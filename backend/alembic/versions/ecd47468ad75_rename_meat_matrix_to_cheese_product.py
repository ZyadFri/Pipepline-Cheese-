"""rename ext_experiments.meat_matrix to cheese_product

The app is now a cheese-preservation extraction platform; the meat_matrix column
name was a holdover from an earlier meat-focused version and never matched what
the field actually holds (a cheese product name/description). Renamed in its own
migration, separate from the additive-columns migration that follows it, since a
rename is the one change here with real deploy-atomicity risk — old code reading
.meat_matrix breaks the instant this runs, so it stays independently reviewable
and revertable.

Revision ID: ecd47468ad75
Revises: 25f78a5472d8
Create Date: 2026-09-03 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'ecd47468ad75'
down_revision: Union[str, None] = '25f78a5472d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("ext_experiments") as batch_op:
        batch_op.alter_column(
            "meat_matrix", new_column_name="cheese_product",
            existing_type=sa.String(), existing_nullable=False,
        )


def downgrade() -> None:
    with op.batch_alter_table("ext_experiments") as batch_op:
        batch_op.alter_column(
            "cheese_product", new_column_name="meat_matrix",
            existing_type=sa.String(), existing_nullable=False,
        )
