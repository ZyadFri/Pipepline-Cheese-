"""cascade delete fixes for paper and project foreign keys

Deleting a Paper left Job/Study/ProvenanceRecord rows orphaned (no ondelete=CASCADE
on their FKs, and SQLite doesn't enforce FK actions unless PRAGMA foreign_keys=ON is
set, which app/db/database.py now does on every connection). Combined with SQLite
reusing a deleted row's integer id on the next insert, a newly-uploaded paper could
silently "inherit" a previous, unrelated paper's orphaned extraction results.

No constraint in this DB was ever explicitly named (Base = declarative_base() with
no naming_convention), so batch mode needs an explicit naming_convention to compute
a deterministic name it can both drop and recreate by, for each FK touched here.

Revision ID: 25f78a5472d8
Revises:
Create Date: 2026-09-02 11:48:13.617592

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '25f78a5472d8'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NAMING_CONVENTION = {
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
}


def upgrade() -> None:
    with op.batch_alter_table(
        "jobs", recreate="always", naming_convention=NAMING_CONVENTION
    ) as batch_op:
        batch_op.drop_constraint("fk_jobs_project_id_projects", type_="foreignkey")
        batch_op.drop_constraint("fk_jobs_paper_id_papers", type_="foreignkey")
        batch_op.create_foreign_key(
            "fk_jobs_project_id_projects", "projects", ["project_id"], ["id"],
            ondelete="CASCADE",
        )
        batch_op.create_foreign_key(
            "fk_jobs_paper_id_papers", "papers", ["paper_id"], ["id"],
            ondelete="CASCADE",
        )

    with op.batch_alter_table(
        "studies", recreate="always", naming_convention=NAMING_CONVENTION
    ) as batch_op:
        batch_op.drop_constraint("fk_studies_project_id_projects", type_="foreignkey")
        batch_op.drop_constraint("fk_studies_paper_id_papers", type_="foreignkey")
        batch_op.create_foreign_key(
            "fk_studies_project_id_projects", "projects", ["project_id"], ["id"],
            ondelete="CASCADE",
        )
        batch_op.create_foreign_key(
            "fk_studies_paper_id_papers", "papers", ["paper_id"], ["id"],
            ondelete="CASCADE",
        )

    with op.batch_alter_table(
        "provenance_records", recreate="always", naming_convention=NAMING_CONVENTION
    ) as batch_op:
        batch_op.drop_constraint("fk_provenance_records_paper_id_papers", type_="foreignkey")
        batch_op.create_foreign_key(
            "fk_provenance_records_paper_id_papers", "papers", ["paper_id"], ["id"],
            ondelete="CASCADE",
        )

    with op.batch_alter_table(
        "trajectory_definitions", recreate="always", naming_convention=NAMING_CONVENTION
    ) as batch_op:
        batch_op.drop_constraint("fk_trajectory_definitions_project_id_projects", type_="foreignkey")
        batch_op.create_foreign_key(
            "fk_trajectory_definitions_project_id_projects", "projects", ["project_id"], ["id"],
            ondelete="CASCADE",
        )


def downgrade() -> None:
    with op.batch_alter_table(
        "trajectory_definitions", recreate="always", naming_convention=NAMING_CONVENTION
    ) as batch_op:
        batch_op.drop_constraint("fk_trajectory_definitions_project_id_projects", type_="foreignkey")
        batch_op.create_foreign_key(
            "fk_trajectory_definitions_project_id_projects", "projects", ["project_id"], ["id"],
        )

    with op.batch_alter_table(
        "provenance_records", recreate="always", naming_convention=NAMING_CONVENTION
    ) as batch_op:
        batch_op.drop_constraint("fk_provenance_records_paper_id_papers", type_="foreignkey")
        batch_op.create_foreign_key(
            "fk_provenance_records_paper_id_papers", "papers", ["paper_id"], ["id"],
        )

    with op.batch_alter_table(
        "studies", recreate="always", naming_convention=NAMING_CONVENTION
    ) as batch_op:
        batch_op.drop_constraint("fk_studies_project_id_projects", type_="foreignkey")
        batch_op.drop_constraint("fk_studies_paper_id_papers", type_="foreignkey")
        batch_op.create_foreign_key(
            "fk_studies_project_id_projects", "projects", ["project_id"], ["id"],
        )
        batch_op.create_foreign_key(
            "fk_studies_paper_id_papers", "papers", ["paper_id"], ["id"],
        )

    with op.batch_alter_table(
        "jobs", recreate="always", naming_convention=NAMING_CONVENTION
    ) as batch_op:
        batch_op.drop_constraint("fk_jobs_project_id_projects", type_="foreignkey")
        batch_op.drop_constraint("fk_jobs_paper_id_papers", type_="foreignkey")
        batch_op.create_foreign_key(
            "fk_jobs_project_id_projects", "projects", ["project_id"], ["id"],
        )
        batch_op.create_foreign_key(
            "fk_jobs_paper_id_papers", "papers", ["paper_id"], ["id"],
        )
