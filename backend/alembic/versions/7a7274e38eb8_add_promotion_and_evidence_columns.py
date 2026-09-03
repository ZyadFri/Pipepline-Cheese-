"""add promotion tracking and evidence columns

Supports promote_ext_paper_to_canonical() (app/services/canonical_promoter.py),
which promotes the Ext* staging schema into the canonical Study/Experiment/
TreatmentArm/Observation model automatically after extraction:

  - ext_experiments.promoted_experiment_id / promoted_at: lets a retry after a
    partial promotion failure skip experiments already promoted within the same
    run (cross-run idempotency instead uses Experiment.condition_signature,
    which survives ext_experiments rows being wiped and rebuilt on re-run).
  - provenance_records.docling_item_ref / extraction_asset_id: link a canonical
    provenance record back to the Docling item / rendered asset it came from.
  - provenance_records.evidence_image_path / evidence_thumbnail_path: a durable
    copy of the evidence crop path, copied (not re-generated) at promotion time
    from the ExtEvidence row that produced it — ext_evidence rows are wiped and
    rebuilt on every re-extraction, so a live reference would orphan the moment
    someone re-runs extraction on an already-reviewed paper.

All columns are nullable and additive — safe for SQLite and PostgreSQL alike,
no data migration needed.

Revision ID: 7a7274e38eb8
Revises: ecd47468ad75
Create Date: 2026-09-03 00:00:01.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '7a7274e38eb8'
down_revision: Union[str, None] = 'ecd47468ad75'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NAMING_CONVENTION = {
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
}


def upgrade() -> None:
    with op.batch_alter_table(
        "ext_experiments", recreate="always", naming_convention=NAMING_CONVENTION
    ) as batch_op:
        batch_op.add_column(sa.Column("promoted_experiment_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("promoted_at", sa.DateTime(), nullable=True))
        batch_op.create_foreign_key(
            "fk_ext_experiments_promoted_experiment_id_experiments",
            "experiments", ["promoted_experiment_id"], ["id"],
        )

    with op.batch_alter_table(
        "provenance_records", recreate="always", naming_convention=NAMING_CONVENTION
    ) as batch_op:
        batch_op.add_column(sa.Column("docling_item_ref", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("extraction_asset_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("evidence_image_path", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("evidence_thumbnail_path", sa.String(), nullable=True))
        batch_op.create_foreign_key(
            "fk_provenance_records_extraction_asset_id_extraction_assets",
            "extraction_assets", ["extraction_asset_id"], ["id"],
        )


def downgrade() -> None:
    with op.batch_alter_table(
        "provenance_records", recreate="always", naming_convention=NAMING_CONVENTION
    ) as batch_op:
        batch_op.drop_constraint(
            "fk_provenance_records_extraction_asset_id_extraction_assets", type_="foreignkey"
        )
        batch_op.drop_column("evidence_thumbnail_path")
        batch_op.drop_column("evidence_image_path")
        batch_op.drop_column("extraction_asset_id")
        batch_op.drop_column("docling_item_ref")

    with op.batch_alter_table(
        "ext_experiments", recreate="always", naming_convention=NAMING_CONVENTION
    ) as batch_op:
        batch_op.drop_constraint(
            "fk_ext_experiments_promoted_experiment_id_experiments", type_="foreignkey"
        )
        batch_op.drop_column("promoted_at")
        batch_op.drop_column("promoted_experiment_id")
