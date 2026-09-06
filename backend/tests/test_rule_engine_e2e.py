"""
Full DB-backed integration test for the rule-based extraction engine — mirrors
test_e2e_cheese_extraction_flow.py's pattern (real persist + promotion code
path, not mocks of the persistence layer itself) but exercises
RuleExtractionEngine against a real table CSV instead of mocking an LLM
response.

Covers spec tests 2 (table extraction), 3 (context inheritance), 8 (engine
isolation — zero LLM calls), and 10 (canonical promotion).
"""
import shutil
from pathlib import Path

import openai
import pytest

from app.db.models import AssetContextLink, ExtractionAsset, Job, Paper, Project
from app.extraction.common.persist import persist_paper_extraction
from app.extraction.rules.engine import RuleExtractionEngine
from app.services import food_extractor
from app.services.canonical_promoter import promote_ext_paper_to_canonical

FIXTURE_CSV = Path(__file__).parent / "fixtures" / "sample_table.csv"


def _seed_project_paper_with_table(db, user, tmp_path, caption: str):
    project = Project(name="Rule Engine Test", owner_id=user.id)
    db.add(project)
    db.flush()

    paper = Paper(
        project_id=project.id, filename="p.pdf", original_name="paper.pdf",
        file_path="/nonexistent/p.pdf", page_count=10, status="uploaded",
    )
    db.add(paper)
    db.flush()

    # Copy the fixture CSV into a per-test temp dir so convert_table_asset's
    # pandas.read_csv has a real file to read, matching how a real ExtractionAsset's
    # csv_path always points at a file already written to disk by the Docling step.
    csv_path = tmp_path / "table_0.csv"
    shutil.copy(FIXTURE_CSV, csv_path)

    asset = ExtractionAsset(
        paper_id=paper.id, project_id=project.id, docling_item_ref="#/tables/0",
        asset_type="native_table", page_number=5, classification="native_table",
        caption=caption, csv_path=str(csv_path), csv_rows=2, csv_cols=4,
        relevance_score=5.0, selected_for_llm=True,
    )
    db.add(asset)
    db.commit()
    db.refresh(paper)
    return project, paper, asset


# ── TEST 2 + 3 — table extraction with context inheritance from the caption ──

def test_rule_engine_extracts_table_with_context_inherited_from_caption(db, test_user, tmp_path):
    project, paper, asset = _seed_project_paper_with_table(
        db, test_user, tmp_path,
        caption="Yeasts and molds counts in Gouda cheese stored at 4°C",
    )

    engine = RuleExtractionEngine()
    result = engine.extract_document(paper.id, project.id, db)

    assert len(result.experiments) == 2  # Control + EO 0.5% rows
    by_treatment = {e.treatment.lower(): e for e in result.experiments}
    assert "control" in by_treatment
    eo_exp = next(e for t, e in by_treatment.items() if "0.5" in t)

    # Context inherited from the caption — neither row repeats "Gouda" itself.
    assert by_treatment["control"].cheese_product == "gouda"
    assert eo_exp.cheese_product == "gouda"

    # 3 time points per row, indicator inferred from the caption.
    control_obs = by_treatment["control"].observations
    assert len(control_obs) == 3
    assert {o.day for o in control_obs} == {0, 15, 30}
    assert all(o.indicator_type == "yeasts and molds" for o in control_obs)
    day30 = next(o for o in control_obs if o.day == 30)
    assert day30.indicator_value == 6.2

    # EO 0.5% row's concentration was parsed from its own row label.
    assert any(i.concentration == 0.5 for i in eo_exp.ingredients)


# ── TEST 8 — engine isolation: zero LLM calls ───────────────────────────────

def test_rule_engine_makes_zero_llm_calls(db, test_user, tmp_path, monkeypatch):
    project, paper, asset = _seed_project_paper_with_table(
        db, test_user, tmp_path, caption="Yeasts and molds in Gouda cheese stored at 4°C",
    )

    calls = []
    monkeypatch.setattr(openai, "OpenAI", lambda *a, **kw: calls.append((a, kw)) or pytest.fail("OpenAI client constructed"))
    monkeypatch.setattr(food_extractor, "_groq_client", lambda: pytest.fail("_groq_client called"))

    engine = RuleExtractionEngine()
    result = engine.extract_document(paper.id, project.id, db)

    assert not calls
    assert len(result.experiments) == 2


# ── TEST 10 — canonical promotion for a non-LLM engine ──────────────────────

def test_rule_engine_promotes_to_canonical_with_correct_engine_tag(db, test_user, tmp_path):
    project, paper, asset = _seed_project_paper_with_table(
        db, test_user, tmp_path, caption="Yeasts and molds in Gouda cheese stored at 4°C",
    )

    engine = RuleExtractionEngine()
    result = engine.extract_document(paper.id, project.id, db)
    persist_counts = persist_paper_extraction(
        result, paper=paper, project_id=project.id, job_id=None, engine="rules", db=db,
    )
    assert persist_counts["experiments_stored"] == 2
    assert persist_counts["measurements_stored"] == 6

    promotion = promote_ext_paper_to_canonical(paper.id, project.id, db, engine="rules")
    assert promotion["experiments_created"] == 2
    assert promotion["observations_created"] == 6

    from app.db.models import Observation, TreatmentArm, Experiment, Study
    study = db.query(Study).filter(Study.paper_id == paper.id).first()
    assert study is not None
    experiments = db.query(Experiment).filter(Experiment.study_id == study.id).all()
    assert len(experiments) == 2
    arm_ids = [a.id for a in db.query(TreatmentArm).filter(
        TreatmentArm.experiment_id.in_([e.id for e in experiments])
    ).all()]
    observations = db.query(Observation).filter(Observation.treatment_arm_id.in_(arm_ids)).all()
    assert len(observations) == 6
    assert all(o.extraction_engine == "rules" for o in observations)
