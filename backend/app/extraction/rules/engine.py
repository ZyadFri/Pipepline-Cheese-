"""
RuleExtractionEngine — deterministic extraction using Docling structure,
lexicons, regex, and rapidfuzz fuzzy matching. Performs ZERO LLM/vision calls;
see tests/test_rule_engine_e2e.py for the isolation check that enforces this.
"""
from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.db.models import AssetContextLink, ExtractionAsset
from app.extraction.common.asset_selection import select_assets_for_extraction
from app.extraction.common.base import ExtractionEngine
from app.extraction.common.models import ExtractedExperiment, PaperExtractionResult, UnmappedFact
from app.extraction.rules.tables import convert_table_asset
from app.extraction.rules.text_facts import extract_text_facts, find_unmapped_numeric_facts

logger = logging.getLogger(__name__)


def _experiment_signature(exp: ExtractedExperiment) -> tuple[str, str]:
    return (exp.cheese_product.strip().lower(), exp.treatment.strip().lower())


def _merge_experiments(experiments: list[ExtractedExperiment]) -> list[ExtractedExperiment]:
    """Multiple tables/text spans in the same paper often describe the same
    (cheese, treatment) experiment — merge them into one ExtractedExperiment
    instead of letting each source create a separate ExtExperiment row for what
    is really the same condition."""
    merged: dict[tuple[str, str], ExtractedExperiment] = {}
    for exp in experiments:
        key = _experiment_signature(exp)
        if key not in merged:
            merged[key] = exp
            continue
        existing = merged[key]
        existing.observations.extend(exp.observations)
        existing.provenance.extend(exp.provenance)
        existing_ing_names = {i.ingredient_name for i in existing.ingredients}
        for ing in exp.ingredients:
            if ing.ingredient_name not in existing_ing_names:
                existing.ingredients.append(ing)
    return list(merged.values())


class RuleExtractionEngine(ExtractionEngine):
    name = "rules"
    version = "0.1.0"

    def extract_document(self, paper_id: int, project_id: int, db: Session) -> PaperExtractionResult:
        assets: list[ExtractionAsset] = select_assets_for_extraction(paper_id, db)
        warnings: list[str] = []

        experiments: list[ExtractedExperiment] = []
        unmapped: list[UnmappedFact] = []

        tables = [a for a in assets if a.asset_type == "native_table"]
        for table_asset in tables:
            try:
                exps, facts = convert_table_asset(table_asset, db)
                experiments.extend(exps)
                unmapped.extend(facts)
            except Exception as exc:
                logger.warning("RuleExtractionEngine: table %s failed: %s", table_asset.id, exc)
                warnings.append(f"Table on page {table_asset.page_number} could not be parsed: {exc}")

        if not tables:
            warnings.append("No native tables found for this paper — rule extraction relies primarily on tables.")

        # Text-derived unmapped facts (spec §7/§24: never discard a detected
        # number just because it doesn't map to a canonical field). Scanned from
        # AssetContextLink text already linked to in-scope assets, so this stays
        # scoped to relevant context rather than the whole document.
        seen_text_spans: set[str] = set()
        for asset in assets:
            for link in asset.context_links:
                if not link.text or link.text in seen_text_spans:
                    continue
                seen_text_spans.add(link.text)
                for fact in find_unmapped_numeric_facts(link.text):
                    unmapped.append(UnmappedFact(
                        predicate=fact.predicate or fact.raw_text,
                        value_raw=str(fact.value), value_normalized=fact.value,
                        unit_raw=fact.unit, unit_normalized=fact.unit,
                        raw_text=link.text[:300], category="unknown",
                        confidence=0.55,
                        confidence_reason="Generic number+unit pattern with no recognized scientific predicate.",
                    ))

        merged_experiments = _merge_experiments(experiments)

        return PaperExtractionResult(
            paper_id=paper_id,
            project_id=project_id,
            engine="rules",
            engine_version=self.version,
            experiments=merged_experiments,
            unmapped_facts=unmapped,
            warnings=warnings,
            reasoning_summary=(
                f"Rule-based extraction: {len(tables)} table(s) processed, "
                f"{len(merged_experiments)} experiment(s), {len(unmapped)} additional fact(s) preserved."
            ),
        )
