"""
Generic pre-delete cleanup for the canonical Study -> Experiment -> TreatmentArm ->
Observation tree, plus Paper and Project themselves.

That tree cascades correctly through the ORM relationships declared on
Project/Study/Experiment (SQLAlchemy deletes children before parents). But a growing
number of side tables (audit logs, staging tables, the Model Lab feature, usage
tracking...) hold plain, non-cascading foreign keys straight into paper/project/study
rows - SQLite has no ALTER TABLE ADD CONSTRAINT, so retrofitting ON DELETE CASCADE
onto them would require a full table rebuild, and new ones keep getting added by
unrelated feature work.

Rather than hand-enumerate every such table (which has already silently missed two
in production - ext_experiments.promoted_experiment_id and llm_usage_events.paper_id,
each discovered only when a real delete failed), this introspects the actual schema
at runtime via SQLAlchemy's reflection API and handles ANY non-cascaded foreign key
pointing at a row being deleted: NULL it if the column is nullable (preserves the
referencing row - the correct behavior for audit/usage-log style tables), or delete
the referencing row first, recursing if that row is itself referenced elsewhere.
"""
from sqlalchemy import bindparam, inspect, text
from sqlalchemy.orm import Session


def _ids(db: Session, sql: str, **params) -> list:
    stmt = text(sql)
    for key, value in params.items():
        if isinstance(value, list):
            stmt = stmt.bindparams(bindparam(key, expanding=True))
    return [row[0] for row in db.execute(stmt, params)]


def _referencing_columns(engine, target_table: str):
    """(table, column, nullable) for every FK column anywhere in the schema that
    points at target_table's primary key, excluding ones already ON DELETE CASCADE
    at the DB level (Postgres and SQLite's PRAGMA foreign_keys=ON both enforce that
    automatically, so those need no manual handling here)."""
    insp = inspect(engine)
    out = []
    for table_name in insp.get_table_names():
        try:
            fks = insp.get_foreign_keys(table_name)
            cols_by_name = {c["name"]: c for c in insp.get_columns(table_name)}
        except Exception:
            continue
        for fk in fks:
            if fk.get("referred_table") != target_table:
                continue
            ondelete = (fk.get("options") or {}).get("ondelete") or ""
            if ondelete.upper() == "CASCADE":
                continue
            for col in fk.get("constrained_columns", []):
                out.append((table_name, col, cols_by_name.get(col, {}).get("nullable", True)))
    return out


def clear_dangling_refs(db: Session, table: str, ids: list, _depth: int = 0) -> None:
    """Before deleting `ids` from `table`, clear every other table's non-cascaded
    reference into them: NULL nullable columns (keeps the row - audit/usage-log
    tables), or recursively clear-then-delete rows through a required column.
    Call this immediately before issuing the actual delete of `ids` from `table`.
    """
    if not ids or _depth > 6:
        return
    engine = db.get_bind()
    for ref_table, ref_col, nullable in _referencing_columns(engine, table):
        if nullable:
            db.execute(
                text(f"UPDATE {ref_table} SET {ref_col} = NULL WHERE {ref_col} IN :ids")
                .bindparams(bindparam("ids", expanding=True)),
                {"ids": ids},
            )
        else:
            ref_ids = _ids(db, f"SELECT id FROM {ref_table} WHERE {ref_col} IN :ids", ids=ids)
            if not ref_ids:
                continue
            clear_dangling_refs(db, ref_table, ref_ids, _depth + 1)
            db.execute(
                text(f"DELETE FROM {ref_table} WHERE id IN :ids").bindparams(bindparam("ids", expanding=True)),
                {"ids": ref_ids},
            )


def _study_tree_ids(db: Session, study_ids: list) -> tuple:
    experiment_ids = _ids(db, "SELECT id FROM experiments WHERE study_id IN :ids", ids=study_ids) if study_ids else []
    arm_ids = _ids(db, "SELECT id FROM treatment_arms WHERE experiment_id IN :ids", ids=experiment_ids) if experiment_ids else []
    obs_ids = _ids(db, "SELECT id FROM observations WHERE treatment_arm_id IN :ids", ids=arm_ids) if arm_ids else []
    return experiment_ids, arm_ids, obs_ids


def prepare_study_tree_deletion(db: Session, study_ids: list) -> None:
    """Clear dangling refs through the whole Study -> ... -> Observation tree,
    innermost first. Does not delete anything itself - the ORM cascade (via
    Project.studies / Paper.study / Study.experiments / ...) still does that."""
    if not study_ids:
        return
    experiment_ids, arm_ids, obs_ids = _study_tree_ids(db, study_ids)
    if obs_ids:
        clear_dangling_refs(db, "observations", obs_ids)
    if arm_ids:
        clear_dangling_refs(db, "treatment_arms", arm_ids)
    if experiment_ids:
        clear_dangling_refs(db, "experiments", experiment_ids)
    clear_dangling_refs(db, "studies", study_ids)


def prepare_project_deletion(db: Session, project_id: int) -> None:
    study_ids = _ids(db, "SELECT id FROM studies WHERE project_id = :pid", pid=project_id)
    prepare_study_tree_deletion(db, study_ids)
    clear_dangling_refs(db, "projects", [project_id])


def prepare_paper_deletion(db: Session, paper_id: int) -> None:
    study_ids = _ids(db, "SELECT id FROM studies WHERE paper_id = :pid", pid=paper_id)
    prepare_study_tree_deletion(db, study_ids)
    clear_dangling_refs(db, "papers", [paper_id])
