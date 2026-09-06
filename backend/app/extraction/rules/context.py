"""
ExperimentContext resolution — figuring out which cheese/treatment/temperature/
etc. applies to a table or figure when the asset itself doesn't repeat it (it
was already stated in the caption, or the nearest paragraph, or the Methods
section). Consumes the EXISTING AssetContextLink rows Docling's context linker
already built (caption / neighbor_before / neighbor_after / same_section /
keyword_match) — this module does no new context-linking of its own, only
interprets links that already exist.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from app.db.models import AssetContextLink, ExtractionAsset
from app.extraction.rules.lexicon_loader import cheese_lexicon, ingredient_lexicon, best_match
from app.extraction.rules.regexes import find_numeric_facts


@dataclass
class ExperimentContext:
    cheese_product: Optional[str] = None
    treatment: Optional[str] = None
    concentration: Optional[str] = None
    storage_temperature_c: Optional[float] = None
    storage_duration_days: Optional[float] = None
    source_text: str = ""              # the text the context was actually inherited from
    source: str = "unknown"            # caption|neighbor|same_section|methods|unknown
    confidence_field: dict = field(default_factory=dict)   # field_name -> confidence tier used


def _context_texts_for_asset(asset: ExtractionAsset, db) -> list[tuple[str, str]]:
    """Returns [(link_type, text), ...] ordered by priority: caption first, then
    same_section/neighbors, matching how a human reader would resolve missing
    context (spec §10: caption > preceding paragraph > Methods section)."""
    texts: list[tuple[str, str]] = []
    if asset.caption:
        texts.append(("caption", asset.caption))
    links = sorted(asset.context_links, key=lambda l: -1.0 if l.link_type == "caption" else -l.score)
    for link in links:
        if link.text:
            texts.append((link.link_type, link.text))
    return texts


def resolve_context_for_asset(asset: ExtractionAsset, db) -> ExperimentContext:
    """Best-effort ExperimentContext for one table/figure asset, inherited from
    its caption first, then linked context, in that priority order. Never
    guesses — a field stays None if nothing in the available text supports it."""
    ctx = ExperimentContext()
    cheese_alias, cheese_entries = cheese_lexicon()
    ing_alias, ing_entries = ingredient_lexicon()

    for link_type, text in _context_texts_for_asset(asset, db):
        if ctx.cheese_product is None:
            m = best_match(text, cheese_alias, cheese_entries)
            if m:
                ctx.cheese_product = m.canonical_name.replace("_", " ")
                ctx.source_text = ctx.source_text or text
                ctx.source = link_type if link_type != "caption" else "caption"
                ctx.confidence_field["cheese_product"] = "caption" if link_type == "caption" else "paragraph"

        if ctx.treatment is None:
            m = best_match(text, ing_alias, ing_entries)
            if m:
                ctx.treatment = m.canonical_name.replace("_", " ")
                ctx.confidence_field["treatment"] = "caption" if link_type == "caption" else "paragraph"

        if ctx.storage_temperature_c is None or ctx.storage_duration_days is None:
            for fact in find_numeric_facts(text):
                if fact.kind == "temperature" and ctx.storage_temperature_c is None:
                    ctx.storage_temperature_c = fact.value
                    ctx.confidence_field["storage_temperature_c"] = "caption" if link_type == "caption" else "paragraph"
                if fact.kind == "days" and ctx.storage_duration_days is None:
                    ctx.storage_duration_days = fact.value
                    ctx.confidence_field["storage_duration_days"] = "caption" if link_type == "caption" else "paragraph"

    return ctx
