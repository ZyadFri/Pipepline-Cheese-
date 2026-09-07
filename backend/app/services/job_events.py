"""
Single choke point for writing to a job's live progress timeline.

Every stage of progressive extraction (Docling chunking, chart conversion,
partial failures, cancellation, completion) calls `emit()` instead of
constructing JobEvent rows directly, so the seq-numbering and commit
behavior can't drift between call sites. The SSE endpoint in
extraction_workspace.py reads these rows back in order.
"""
import json
from typing import Any, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.models import JobEvent


def emit(
    db: Session,
    job_id: int,
    event_type: str,
    message: Optional[str] = None,
    **payload: Any,
) -> JobEvent:
    next_seq = (
        db.query(func.coalesce(func.max(JobEvent.seq), 0)).filter(JobEvent.job_id == job_id).scalar()
    ) + 1
    event = JobEvent(
        job_id=job_id,
        seq=next_seq,
        event_type=event_type,
        message=message,
        payload_json=json.dumps(payload, default=str) if payload else "{}",
    )
    db.add(event)
    db.commit()
    return event
