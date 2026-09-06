"""add engine columns and unmapped facts table

Supports running the LLM, rule-based, and ML extraction engines independently on
the same paper (app/extraction/):

  - ext_experiments.engine / ext_evidence.engine: which engine (llm|rules|ml)
    produced this staging row. ext_measurements and ext_experiment_ingredients
    need no column of their own — they inherit engine scoping transitively
    through their foreign key to ext_experiments.id. ext_evidence has no such
    FK (its entity_key can reference ingredients/indicators directly), so it
    needs its own column. This lets each engine wipe and rebuild only its own
    rows for a paper on re-run, instead of one engine's run erasing another's.
  - observations.extraction_engine: which engine most recently produced or
    updated this canonical observation. The existing dedup key (treatment_arm_id,
    measurement_type, measurement_subtype, time_days) stays engine-unqualified —
    canonical remains one slot with one current answer, not three parallel
    datasets; promoting a second engine's value for an already-filled slot
    overwrites it (subject to the existing approved-review-status guard) and
    re-stamps this column.
  - ext_unmapped_facts (new table): a scientifically meaningful fact an engine
    detected but could not map to a canonical field, preserved with provenance
    instead of discarded, per the project's maximum-information principle.

All three new columns default to 'llm' at the database level (server_default,
not just an ORM-side default) so every existing row is correctly attributed to
the engine that actually produced it before this migration existed, and is
matched correctly by `WHERE engine = 'llm'` scoping on the very next run.

Revision ID: 3f1a9c2d5b7e
Revises: 7a7274e38eb8
Create Date: 2026-09-06 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '3f1a9c2d5b7e'
down_revision: Union[str, None] = '7a7274e38eb8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NAMING_CONVENTION = {
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
}


def upgrade() -> None:
    with op.batch_alter_table(
        "ext_experiments", recreate="always", naming_convention=NAMING_CONVENTION
    ) as batch_op:
        batch_op.add_column(sa.Column("engine", sa.String(), nullable=False, server_default="llm"))

    with op.batch_alter_table(
        "ext_evidence", recreate="always", naming_convention=NAMING_CONVENTION
    ) as batch_op:
        batch_op.add_column(sa.Column("engine", sa.String(), nullable=False, server_default="llm"))

    with op.batch_alter_table(
        "observations", recreate="always", naming_convention=NAMING_CONVENTION
    ) as batch_op:
        batch_op.add_column(sa.Column("extraction_engine", sa.String(), nullable=False, server_default="llm"))

    op.create_table(
        "ext_unmapped_facts",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("paper_id", sa.Integer(), sa.ForeignKey("papers.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("engine", sa.String(), nullable=False),
        sa.Column("subject", sa.String(), nullable=True),
        sa.Column("predicate", sa.String(), nullable=False),
        sa.Column("value_raw", sa.String(), nullable=True),
        sa.Column("value_normalized", sa.Float(), nullable=True),
        sa.Column("unit_raw", sa.String(), nullable=True),
        sa.Column("unit_normalized", sa.String(), nullable=True),
        sa.Column("category", sa.String(), nullable=False, server_default="unknown"),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("confidence_reason", sa.Text(), nullable=True),
        sa.Column("raw_text", sa.Text(), nullable=True),
        sa.Column("context", sa.Text(), nullable=True),
        sa.Column("page_number", sa.Integer(), nullable=True),
        sa.Column("docling_item_ref", sa.String(), nullable=True),
        sa.Column("source_type", sa.String(), nullable=True),
        sa.Column("review_status", sa.String(), nullable=False, server_default="needs_review"),
        sa.Column("promoted_to_indicator_id", sa.Integer(), sa.ForeignKey("ext_indicators.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("ext_unmapped_facts")

    with op.batch_alter_table(
        "observations", recreate="always", naming_convention=NAMING_CONVENTION
    ) as batch_op:
        batch_op.drop_column("extraction_engine")

    with op.batch_alter_table(
        "ext_evidence", recreate="always", naming_convention=NAMING_CONVENTION
    ) as batch_op:
        batch_op.drop_column("engine")

    with op.batch_alter_table(
        "ext_experiments", recreate="always", naming_convention=NAMING_CONVENTION
    ) as batch_op:
        batch_op.drop_column("engine")
