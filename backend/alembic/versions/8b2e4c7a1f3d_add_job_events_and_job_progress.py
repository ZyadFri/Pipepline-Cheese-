"""add job_events and job progress columns

Supports progressive extraction: Docling now runs as a loop of chunked
page-range conversions (app/services/docling_extractor.py) instead of one
blocking whole-document call, so tables/figures can be persisted and shown to
the user as each chunk completes rather than only after the entire paper
finishes.

  - jobs.total_pages / pages_done: real progress denominator/numerator,
    replacing the old client-side-fabricated stage inference that had no
    backend basis.
  - jobs.tables_found / figures_found: live counters for the workspace header.
  - jobs.warnings_json: non-fatal per-asset failures recorded so one bad
    figure/table can no longer fail the whole paper (final status
    'partial_success' rather than 'failed').
  - jobs.cancel_requested: separate from `status` deliberately - the worker
    holds a long-lived session and commits its own status transitions, which
    would otherwise clobber a direct status write from the cancel endpoint.
  - job_events (new table): a persisted, replayable event timeline consumed
    by the new SSE endpoint. Persisting (not just pushing over the wire) is
    what lets a browser refresh mid-processing show the same progress instead
    of the UI going blank or the job appearing to restart - the client
    reconnects with `since_seq` and replays exactly what it missed.

Revision ID: 8b2e4c7a1f3d
Revises: 3f1a9c2d5b7e
Create Date: 2026-09-07 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '8b2e4c7a1f3d'
down_revision: Union[str, None] = '3f1a9c2d5b7e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NAMING_CONVENTION = {
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
}


def upgrade() -> None:
    with op.batch_alter_table(
        "jobs", recreate="always", naming_convention=NAMING_CONVENTION
    ) as batch_op:
        batch_op.add_column(sa.Column("total_pages", sa.Integer(), nullable=False, server_default="0"))
        batch_op.add_column(sa.Column("pages_done", sa.Integer(), nullable=False, server_default="0"))
        batch_op.add_column(sa.Column("tables_found", sa.Integer(), nullable=False, server_default="0"))
        batch_op.add_column(sa.Column("figures_found", sa.Integer(), nullable=False, server_default="0"))
        batch_op.add_column(sa.Column("warnings_json", sa.Text(), nullable=False, server_default="[]"))
        batch_op.add_column(sa.Column("cancel_requested", sa.Boolean(), nullable=False, server_default=sa.false()))

    op.create_table(
        "job_events",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("job_id", sa.Integer(), sa.ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("seq", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(), nullable=False),
        sa.Column("message", sa.String(), nullable=True),
        sa.Column("payload_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(), nullable=True, index=True),
    )
    op.create_index("ix_job_events_job_id", "job_events", ["job_id"])
    op.create_index("ix_job_events_created_at", "job_events", ["created_at"])
    op.create_unique_constraint("uq_job_event_seq", "job_events", ["job_id", "seq"])


def downgrade() -> None:
    op.drop_table("job_events")

    with op.batch_alter_table(
        "jobs", recreate="always", naming_convention=NAMING_CONVENTION
    ) as batch_op:
        batch_op.drop_column("cancel_requested")
        batch_op.drop_column("warnings_json")
        batch_op.drop_column("figures_found")
        batch_op.drop_column("tables_found")
        batch_op.drop_column("pages_done")
        batch_op.drop_column("total_pages")
