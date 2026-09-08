from sqlalchemy import create_engine, event, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

from app.core.config import settings

connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(settings.DATABASE_URL, connect_args=connect_args)

if settings.DATABASE_URL.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def _enable_sqlite_foreign_keys(dbapi_connection, _record):
        # SQLite disables FK enforcement by default (per-connection setting).
        # Without this, every ondelete="CASCADE" in models.py is silently inert —
        # deleting a parent row (e.g. a Paper) leaves its children (Jobs,
        # ExtractionAssets, ...) as orphans that a future row can collide with if
        # SQLite reuses the freed integer id.
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def apply_column_migrations() -> None:
    """
    Add columns that create_all() cannot backfill on existing tables.
    Safe to call on every startup — each ALTER TABLE is wrapped in a try/except.
    Only needed for SQLite where Alembic auto-migrations are not running.
    """
    if not settings.DATABASE_URL.startswith("sqlite"):
        return
    migrations = [
        # ExtEvidence — Docling provenance anchor (added in Docling pipeline)
        "ALTER TABLE ext_evidence ADD COLUMN docling_item_ref VARCHAR",
        "ALTER TABLE ext_evidence ADD COLUMN is_chart_derived BOOLEAN DEFAULT 0",
        # Multi-engine extraction (llm|rules|ml) — see alembic/versions/
        # 3f1a9c2d5b7e_add_engine_columns_and_unmapped_facts.py for the full rationale.
        "ALTER TABLE ext_experiments ADD COLUMN engine VARCHAR DEFAULT 'llm'",
        "ALTER TABLE ext_evidence ADD COLUMN engine VARCHAR DEFAULT 'llm'",
        "ALTER TABLE observations ADD COLUMN extraction_engine VARCHAR DEFAULT 'llm'",
        # Progressive extraction — real per-page progress + partial-failure + cancel.
        # job_events itself needs no ALTER: create_all() creates brand-new tables.
        "ALTER TABLE jobs ADD COLUMN total_pages INTEGER DEFAULT 0",
        "ALTER TABLE jobs ADD COLUMN pages_done INTEGER DEFAULT 0",
        "ALTER TABLE jobs ADD COLUMN tables_found INTEGER DEFAULT 0",
        "ALTER TABLE jobs ADD COLUMN figures_found INTEGER DEFAULT 0",
        "ALTER TABLE jobs ADD COLUMN warnings_json TEXT DEFAULT '[]'",
        "ALTER TABLE jobs ADD COLUMN cancel_requested BOOLEAN DEFAULT 0",
        "ALTER TABLE papers ADD COLUMN summary_json TEXT",
        "ALTER TABLE papers ADD COLUMN summary_generated_at DATETIME",
        # User profile (avatar upload, bio, job title, organization)
        "ALTER TABLE users ADD COLUMN avatar_path VARCHAR",
        "ALTER TABLE users ADD COLUMN bio TEXT",
        "ALTER TABLE users ADD COLUMN job_title VARCHAR",
        "ALTER TABLE users ADD COLUMN organization VARCHAR",
        "ALTER TABLE users ADD COLUMN updated_at DATETIME",
    ]
    with engine.connect() as conn:
        for stmt in migrations:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception:
                # Column already exists — safe to ignore
                pass
