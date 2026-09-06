"""
The ONE function that writes any engine's PaperExtractionResult into the Ext*
staging schema. Used by both RuleExtractionEngine and (via
app/extraction/llm/wrapper.py's adapter) the existing LLM flow, so persistence
logic exists exactly once regardless of how many engines exist.

Engine-scoped: only this paper's rows for THIS engine are wiped before writing
fresh ones, so running Rules never erases the LLM's staging data for the same
paper (or vice versa) — both coexist and can be compared. ExtIngredient/
ExtIndicator are project-level reusable catalogs shared across engines
deliberately (the same real ingredient found by two engines should resolve to
the same catalog row) and are never wiped here.
"""
from __future__ import annotations

import json
import logging
from typing import Optional

from sqlalchemy.orm import Session

from app.core.config import UPLOAD_PATH
from app.db.models import (
    ExtEvidence, ExtExperiment, ExtExperimentIngredient, ExtIndicator,
    ExtIngredient, ExtMeasurement, ExtUnmappedFact, Paper,
)
from app.extraction.common.models import PaperExtractionResult
from app.services.evidence_capture import save_evidence_crop

logger = logging.getLogger(__name__)

EVIDENCE_BASE = UPLOAD_PATH / "evidence"


def _get_or_create_ingredient(project_id: int, name: str, func_class: str, source: str, db: Session) -> ExtIngredient:
    ing = db.query(ExtIngredient).filter(
        ExtIngredient.project_id == project_id,
        ExtIngredient.ingredient_name == name,
    ).first()
    if not ing:
        ing = ExtIngredient(
            project_id=project_id, ingredient_name=name,
            functional_class=func_class or "unknown", source=source or "",
        )
        db.add(ing)
        db.flush()
        return ing
    # Backfill-if-empty: first engine to see this ingredient shouldn't permanently
    # block a later, better classification from a different engine (mirrors the
    # existing indicator_threshold backfill below).
    if (not ing.functional_class or ing.functional_class == "unknown") and func_class and func_class != "unknown":
        ing.functional_class = func_class
    if not ing.source and source:
        ing.source = source
    return ing


def _get_or_create_indicator(project_id: int, ind_type: str, ind_unit: str,
                              threshold: Optional[float], db: Session) -> ExtIndicator:
    ind = db.query(ExtIndicator).filter(
        ExtIndicator.project_id == project_id,
        ExtIndicator.indicator_type == ind_type,
        ExtIndicator.indicator_unit == ind_unit,
    ).first()
    if not ind:
        ind = ExtIndicator(
            project_id=project_id, indicator_type=ind_type,
            indicator_unit=ind_unit, indicator_threshold=threshold,
        )
        db.add(ind)
        db.flush()
    elif threshold is not None and ind.indicator_threshold is None:
        ind.indicator_threshold = threshold
    return ind


def persist_paper_extraction(
    result: PaperExtractionResult,
    paper: Paper,
    project_id: int,
    job_id: Optional[int],
    engine: str,
    db: Session,
) -> dict:
    """Wipe this paper's stale rows for `engine`, write `result` fresh, return counts."""
    paper_id = paper.id

    # ── Wipe stale rows for THIS engine only ────────────────────────────────────
    stale_exp_ids = [
        row.id for row in
        db.query(ExtExperiment.id).filter(
            ExtExperiment.paper_id == paper_id,
            ExtExperiment.engine == engine,
        ).all()
    ]
    if stale_exp_ids:
        db.query(ExtMeasurement).filter(
            ExtMeasurement.experiment_id.in_(stale_exp_ids)
        ).delete(synchronize_session=False)
        db.query(ExtExperimentIngredient).filter(
            ExtExperimentIngredient.experiment_id.in_(stale_exp_ids)
        ).delete(synchronize_session=False)
    db.query(ExtEvidence).filter(
        ExtEvidence.paper_id == paper_id, ExtEvidence.engine == engine,
    ).delete(synchronize_session=False)
    db.query(ExtExperiment).filter(
        ExtExperiment.paper_id == paper_id, ExtExperiment.engine == engine,
    ).delete(synchronize_session=False)
    db.query(ExtUnmappedFact).filter(
        ExtUnmappedFact.paper_id == paper_id, ExtUnmappedFact.engine == engine,
    ).delete(synchronize_session=False)
    db.flush()

    def _save_evidence(entity_type: str, entity_key: dict, field_name: Optional[str], prov) -> None:
        bbox = prov.bbox or {}
        rec = ExtEvidence(
            paper_id=paper_id, engine=engine,
            entity_type=entity_type, entity_key=json.dumps(entity_key), field_name=field_name,
            page_number=prov.page_number, source_type=prov.source_type, source_label=prov.source_label,
            exact_text=prov.exact_text,
            bbox_x1=bbox.get("x1"), bbox_y1=bbox.get("y1"), bbox_x2=bbox.get("x2"), bbox_y2=bbox.get("y2"),
            confidence=prov.confidence,
            value_is_approximate=bool(prov.value_is_approximate),
            docling_item_ref=prov.docling_item_ref,
            is_chart_derived=(prov.source_type == "chart" or bool(prov.value_is_approximate)),
        )
        db.add(rec)
        db.flush()

        if prov.page_number and bbox.get("x1") is not None and paper.file_path:
            img_dir = EVIDENCE_BASE / str(paper_id)
            img_path = img_dir / f"ev_{rec.id}.png"
            thumb_path = img_dir / f"thumb_{rec.id}.png"
            try:
                if save_evidence_crop(paper.file_path, prov.page_number, bbox, img_path, thumb_path):
                    rec.evidence_image_path = str(img_path)
                    rec.evidence_thumbnail_path = str(thumb_path)
            except Exception as exc:
                logger.warning("persist_paper_extraction: evidence crop failed for paper %d: %s", paper_id, exc)

    exp_count = meas_count = ing_link_count = unmapped_count = 0

    for exp in result.experiments:
        if not exp.cheese_product or not exp.treatment:
            continue
        exp_row = ExtExperiment(
            project_id=project_id, paper_id=paper_id, job_id=job_id, engine=engine,
            cheese_product=exp.cheese_product, treatment=exp.treatment,
        )
        db.add(exp_row)
        db.flush()
        exp_count += 1

        for prov in exp.provenance:
            _save_evidence("experiment", {"experiment_id": exp_row.id}, None, prov)

        for ing in exp.ingredients:
            if not ing.ingredient_name or ing.concentration is None:
                continue
            ing_row = _get_or_create_ingredient(
                project_id, ing.ingredient_name, ing.functional_class, ing.source, db,
            )
            junction = db.query(ExtExperimentIngredient).filter(
                ExtExperimentIngredient.experiment_id == exp_row.id,
                ExtExperimentIngredient.ingredient_id == ing_row.id,
            ).first()
            if not junction:
                db.add(ExtExperimentIngredient(
                    experiment_id=exp_row.id, ingredient_id=ing_row.id,
                    concentration=float(ing.concentration),
                    concentration_unit=ing.concentration_unit or "",
                ))
                db.flush()
                ing_link_count += 1
            for prov in ing.provenance:
                _save_evidence(
                    "ingredient_link",
                    {"experiment_id": exp_row.id, "ingredient_id": ing_row.id},
                    None, prov,
                )

        for obs in exp.observations:
            if obs.day is None or obs.indicator_value is None or not obs.indicator_type:
                continue
            ind_row = _get_or_create_indicator(
                project_id, obs.indicator_type, obs.indicator_unit, obs.indicator_threshold, db,
            )
            exists = db.query(ExtMeasurement).filter(
                ExtMeasurement.experiment_id == exp_row.id,
                ExtMeasurement.day == int(obs.day),
                ExtMeasurement.indicator_id == ind_row.id,
            ).first()
            if not exists:
                db.add(ExtMeasurement(
                    experiment_id=exp_row.id, day=int(obs.day), indicator_id=ind_row.id,
                    indicator_value=float(obs.indicator_value),
                    value_is_approximate=bool(obs.value_is_approximate),
                ))
                db.flush()
                meas_count += 1
                for prov in obs.provenance:
                    _save_evidence(
                        "measurement",
                        {"experiment_id": exp_row.id, "day": int(obs.day), "indicator_id": ind_row.id},
                        "indicator_value", prov,
                    )

    for fact in result.unmapped_facts:
        prov = fact.provenance
        db.add(ExtUnmappedFact(
            project_id=project_id, paper_id=paper_id, engine=engine,
            subject=fact.subject, predicate=fact.predicate,
            value_raw=fact.value_raw, value_normalized=fact.value_normalized,
            unit_raw=fact.unit_raw, unit_normalized=fact.unit_normalized,
            category=fact.category, confidence=fact.confidence, confidence_reason=fact.confidence_reason,
            raw_text=fact.raw_text, context=fact.context,
            page_number=prov.page_number if prov else None,
            docling_item_ref=prov.docling_item_ref if prov else None,
            source_type=prov.source_type if prov else None,
        ))
        unmapped_count += 1

    db.flush()

    return {
        "experiments_stored": exp_count,
        "measurements_stored": meas_count,
        "ingredient_links_stored": ing_link_count,
        "unmapped_facts_stored": unmapped_count,
    }
