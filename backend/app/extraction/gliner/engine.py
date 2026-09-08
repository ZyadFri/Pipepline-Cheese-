"""
GlinerExtractionEngine — local, zero-shot NER using GLiNER. No API key, no
external network call at extraction time (the model is downloaded once on
first use and cached locally thereafter). Feeds the SAME Docling-derived
text the Rules engine already consumes (AssetContextLink rows) — no new PDF
parser — then hands numeric/value interpretation to the same deterministic
regex machinery Rules uses, since GLiNER is a span detector, not a value
parser (see postprocess.py's module docstring for why).
"""
from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import ExtractionAsset
from app.extraction.common.asset_selection import select_assets_for_extraction
from app.extraction.common.base import ExtractionEngine
from app.extraction.common.models import ExtractedExperiment, PaperExtractionResult, UnmappedFact
from app.extraction.gliner.labels import LABELS
from app.extraction.gliner.model_loader import get_gliner_model
from app.extraction.gliner.postprocess import GlinerEntity, process_text_span

logger = logging.getLogger(__name__)


def _experiment_signature(exp: ExtractedExperiment) -> tuple[str, str]:
    return (exp.cheese_product.strip().lower(), exp.treatment.strip().lower())


def _merge_experiments(experiments: list[ExtractedExperiment]) -> list[ExtractedExperiment]:
    """Same merge rule as RuleExtractionEngine — multiple text spans in the
    same paper often describe the same (cheese, treatment) condition."""
    merged: dict[tuple[str, str], ExtractedExperiment] = {}
    for exp in experiments:
        key = _experiment_signature(exp)
        if key not in merged:
            merged[key] = exp
            continue
        existing = merged[key]
        existing.observations.extend(exp.observations)
        existing.provenance.extend(exp.provenance)
    return list(merged.values())


class GlinerExtractionEngine(ExtractionEngine):
    name = "gliner"
    version = "0.1.0"

    def extract_document(self, paper_id: int, project_id: int, db: Session) -> PaperExtractionResult:
        model = get_gliner_model()
        if model is None:
            return PaperExtractionResult(
                paper_id=paper_id, project_id=project_id, engine="gliner",
                engine_version=self.version,
                warnings=["The local GLiNER model could not be loaded on this server — "
                          "no entities were extracted. This usually means the model "
                          "checkpoint has never been downloaded and the server has no "
                          "network access; contact an administrator."],
                reasoning_summary="GLiNER model unavailable — extraction skipped.",
            )

        assets: list[ExtractionAsset] = select_assets_for_extraction(paper_id, db)

        # Dedupe by text exactly like RuleExtractionEngine's text-fact pass —
        # the same caption/paragraph is often linked from multiple assets.
        seen_texts: dict[str, tuple] = {}
        for asset in assets:
            for link in asset.context_links:
                if not link.text or link.text in seen_texts:
                    continue
                seen_texts[link.text] = (link.page_number, link.item_ref, asset.section_name)

        warnings: list[str] = []
        if not seen_texts:
            warnings.append(
                "No text spans were available for GLiNER to scan — Docling may not have "
                "linked any context text to this paper's assets."
            )

        experiments: list[ExtractedExperiment] = []
        unmapped: list[UnmappedFact] = []
        n_entities = 0
        n_failed = 0

        for text, (page_number, item_ref, section_label) in seen_texts.items():
            try:
                raw_entities = model.predict_entities(text, LABELS, threshold=settings.GLINER_THRESHOLD)
            except Exception as exc:
                n_failed += 1
                logger.warning("GlinerExtractionEngine: prediction failed for one text span: %s", exc)
                continue

            n_entities += len(raw_entities)
            entities = [
                GlinerEntity(label=e["label"], text=e["text"], start=e["start"], end=e["end"], score=e["score"])
                for e in raw_entities
            ]
            exps, facts = process_text_span(
                text, entities,
                page_number=page_number, docling_item_ref=item_ref, source_label=section_label,
            )
            experiments.extend(exps)
            unmapped.extend(facts)

        if n_failed:
            warnings.append(f"{n_failed} text span(s) could not be processed by GLiNER and were skipped.")

        merged = _merge_experiments(experiments)
        n_obs = sum(len(e.observations) for e in merged)

        return PaperExtractionResult(
            paper_id=paper_id, project_id=project_id, engine="gliner",
            engine_version=self.version,
            experiments=merged, unmapped_facts=unmapped, warnings=warnings,
            reasoning_summary=(
                f"GLiNER local NER: scanned {len(seen_texts)} text span(s), found {n_entities} "
                f"raw entit{'y' if n_entities == 1 else 'ies'}, producing {len(merged)} "
                f"experiment(s) with {n_obs} measurement(s) and {len(unmapped)} additional fact(s)."
            ),
        )
