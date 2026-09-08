"""
Deterministic, engine-agnostic enrichment of the shared extraction IR from the
Docling context that already exists in the database.

Why this exists:
The extraction engines historically focused on Product/Treatment/Day/Value,
even though the canonical Experiment model already supports storage temperature,
packaging, atmosphere, pH, milk type, duration, etc. Every engine passes through
this enrichment step before persistence, so LLM, Rules and local-ML outputs all
benefit without adding another PDF parser or another API call.

The parser is deliberately conservative. A field is filled only when the linked
paper context contains one unambiguous value. Conflicting candidates are left
unset rather than guessed. Missing fields remain None and therefore never need
to appear in the UI.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Iterable, Optional

from sqlalchemy.orm import Session

from app.extraction.common.asset_selection import select_assets_for_extraction
from app.extraction.common.models import PaperExtractionResult, Provenance
from app.extraction.rules.regexes import find_numeric_facts


@dataclass(frozen=True)
class _TextSource:
    text: str
    page_number: Optional[int]
    item_ref: Optional[str]
    source_label: Optional[str]


def _clean(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip())


def _contains_identity(text: str, product: str, treatment: str) -> bool:
    low = text.lower()
    product_tokens = [t for t in re.findall(r"[a-z]{4,}", product.lower()) if t not in {"cheese", "sample", "samples"}]
    treatment_tokens = [t for t in re.findall(r"[a-z]{4,}", treatment.lower()) if t not in {"control", "treated", "treatment"}]
    return bool(product_tokens and any(t in low for t in product_tokens)) or bool(
        treatment_tokens and any(t in low for t in treatment_tokens)
    )


def _single(values: Iterable[Any]) -> Any:
    """Return the sole distinct non-empty value, otherwise None."""
    unique: list[Any] = []
    seen: set[str] = set()
    for value in values:
        if value is None or value == "" or value == {} or value == []:
            continue
        key = repr(value)
        if isinstance(value, float):
            key = f"{value:.6g}"
        if key not in seen:
            seen.add(key)
            unique.append(value)
    return unique[0] if len(unique) == 1 else None


def _first_match(text: str, patterns: list[tuple[str, str]]) -> Optional[str]:
    hits = [value for pattern, value in patterns if re.search(pattern, text, re.IGNORECASE)]
    return _single(hits)


def _percent_after(label_pattern: str, text: str) -> Optional[float]:
    m = re.search(label_pattern + r".{0,30}?(\d+(?:[.,]\d+)?)\s*%", text, re.IGNORECASE)
    if not m:
        return None
    try:
        return float(m.group(1).replace(",", "."))
    except ValueError:
        return None


def _initial_number(label_pattern: str, text: str) -> Optional[float]:
    m = re.search(r"\binitial\s+" + label_pattern + r"\s*(?:was|of|=|:)?\s*(\d+(?:[.,]\d+)?)", text, re.IGNORECASE)
    if not m:
        return None
    try:
        return float(m.group(1).replace(",", "."))
    except ValueError:
        return None


def _parse_conditions(text: str) -> dict[str, Any]:
    low = text.lower()
    out: dict[str, Any] = {}

    # Storage temperature / duration / humidity. Prefer semantic predicates from
    # the existing regex layer; only use a bare temperature/day when the same
    # sentence clearly discusses storage.
    temps: list[float] = []
    days: list[float] = []
    humidities: list[float] = []
    for fact in find_numeric_facts(text):
        if fact.predicate == "storage_temperature":
            temps.append(fact.value)
        elif fact.kind == "temperature" and "stor" in low:
            temps.append(fact.value)
        if fact.predicate == "storage_duration":
            days.append(fact.value)
        elif fact.kind == "days" and "stor" in low:
            days.append(fact.value)
        if fact.kind == "humidity" and ("humidity" in low or "storage" in low):
            humidities.append(fact.value)

    temp = _single(temps)
    if temp is not None:
        out["storage_temperature_value"] = temp
        out["storage_temperature_unit_original"] = "°C"
        out["storage_temperature_c"] = temp
    duration = _single(days)
    if duration is not None:
        out["storage_duration_value"] = duration
        out["storage_duration_unit_original"] = "days"
        out["storage_duration_days"] = duration
    humidity = _single(humidities)
    if humidity is not None:
        out["storage_relative_humidity"] = humidity

    packaging = _first_match(text, [
        (r"\bvacuum[-\s]?(?:pack(?:ed|aging)?|sealed)\b", "vacuum"),
        (r"\bmodified\s+atmosphere\s+(?:pack(?:ed|aging)?|storage)\b|\bMAP\b", "modified atmosphere"),
        (r"\bactive\s+packaging\b", "active packaging"),
        (r"\bskin\s+packaging\b", "skin packaging"),
        (r"\bplastic\s+(?:film|wrap|bag)\b", "plastic film"),
    ])
    if packaging:
        out["packaging_type"] = packaging

    atmosphere = _first_match(text, [
        (r"\bvacuum\b", "vacuum"),
        (r"\bmodified\s+atmosphere\b|\bMAP\b", "MAP"),
        (r"\banaerobic\b", "anaerobic"),
        (r"\baerobic\b|\bstored\s+in\s+air\b", "aerobic"),
    ])
    if atmosphere:
        out["atmosphere_type"] = atmosphere

    gases: dict[str, float] = {}
    for gas in ("CO2", "O2", "N2"):
        # Handles both "30% CO2" and "CO2 30%".
        patterns = [
            rf"(\d+(?:[.,]\d+)?)\s*%\s*{gas}\b",
            rf"\b{gas}\b\s*(?:of|=|:)?\s*(\d+(?:[.,]\d+)?)\s*%",
        ]
        values = []
        for pattern in patterns:
            for m in re.finditer(pattern, text, re.IGNORECASE):
                try:
                    values.append(float(m.group(1).replace(",", ".")))
                except ValueError:
                    pass
        value = _single(values)
        if value is not None:
            gases[gas] = value
    if gases:
        out["gas_composition"] = gases

    light = _first_match(text, [
        (r"\bstor(?:ed|age).{0,35}\bin\s+the\s+dark\b|\bdark\s+storage\b", "dark"),
        (r"\bstor(?:ed|age).{0,35}\b(?:under|with)\s+(?:light|illumination)\b", "light exposed"),
    ])
    if light:
        out["light_condition"] = light

    product_family = _first_match(text, [
        (r"\bfresh\s+cheese\b", "fresh"),
        (r"\bsoft\s+cheese\b", "soft"),
        (r"\bsemi[-\s]?soft\s+cheese\b", "semi-soft"),
        (r"\bsemi[-\s]?hard\s+cheese\b", "semi-hard"),
        (r"\bhard\s+cheese\b", "hard"),
        (r"\bblue[-\s]?veined\s+cheese\b|\bblue\s+cheese\b", "blue"),
        (r"\bbrined\s+cheese\b", "brined"),
        (r"\bpasta[-\s]?filata\b", "pasta-filata"),
        (r"\bprocessed\s+cheese\b", "processed"),
        (r"\bwhey\s+cheese\b", "whey"),
    ])
    if product_family:
        out["product_family"] = product_family

    milk_species = _first_match(text, [
        (r"\b(?:cow|bovine)(?:'s)?\s+milk\b", "cow"),
        (r"\b(?:goat|caprine)(?:'s)?\s+milk\b", "goat"),
        (r"\b(?:sheep|ovine)(?:'s)?\s+milk\b", "sheep"),
        (r"\bbuffalo(?:'s)?\s+milk\b", "buffalo"),
        (r"\bmixed\s+milk\b", "mixed"),
    ])
    if milk_species:
        out["milk_species"] = milk_species

    milk_treatment = _first_match(text, [
        (r"\braw\s+milk\b", "raw"),
        (r"\bpasteuri[sz]ed\s+milk\b", "pasteurized"),
        (r"\bthermi[sz]ed\s+milk\b", "thermized"),
    ])
    if milk_treatment:
        out["milk_treatment"] = milk_treatment

    fat_class = _first_match(text, [
        (r"\bfull[-\s]?fat\b", "full-fat"),
        (r"\breduced[-\s]?fat\b", "reduced-fat"),
        (r"\blow[-\s]?fat\b", "low-fat"),
    ])
    if fat_class:
        out["fat_content_class"] = fat_class

    sampling = _first_match(text, [
        (r"\b(?:sampled|samples?)\s+(?:from|of)\s+the\s+rind\b", "rind"),
        (r"\b(?:sampled|samples?)\s+(?:from|of)\s+the\s+surface\b", "surface"),
        (r"\b(?:sampled|samples?)\s+(?:from|of)\s+the\s+(?:core|center|centre)\b", "core"),
        (r"\bbrine\s+samples?\b", "brine"),
        (r"\bwhole[-\s]cheese\s+samples?\b", "whole"),
    ])
    if sampling:
        out["sampling_location"] = sampling

    study_design = _first_match(text, [
        (r"\bchallenge\s+study\b", "challenge_study"),
        (r"\bshelf[-\s]?life\s+(?:study|trial|experiment)\b", "shelf_life"),
        (r"\bin\s+vitro\b", "in_vitro"),
        (r"\bin\s+vivo\b", "in_vivo"),
        (r"\bfield\s+study\b", "field_study"),
    ])
    if study_design:
        out["study_design"] = study_design

    replicate_design = _first_match(text, [
        (r"\bindependent\s+(?:replicates?|batches?)\b", "independent"),
        (r"\btechnical\s+replicates?\b", "technical"),
    ])
    if replicate_design:
        out["replicate_design"] = replicate_design

    if re.search(r"\bartificially\s+inoculat|\binoculated\s+with\b|\bchallenge[-\s]inoculat", text, re.IGNORECASE):
        out["artificial_inoculation"] = True
    elif re.search(r"\bnot\s+inoculated\b|\bwithout\s+(?:artificial\s+)?inoculation\b", text, re.IGNORECASE):
        out["artificial_inoculation"] = False

    initial_ph = _initial_number(r"pH", text)
    if initial_ph is not None and 0 <= initial_ph <= 14:
        out["initial_ph"] = initial_ph
    initial_aw = _initial_number(r"(?:water\s+activity|a[wW])", text)
    if initial_aw is not None and 0 <= initial_aw <= 1.2:
        out["initial_water_activity"] = initial_aw
    salt = _percent_after(r"\binitial\s+(?:salt|NaCl)(?:\s+content)?", text)
    if salt is not None:
        out["initial_salt_pct"] = salt
    moisture = _percent_after(r"\binitial\s+moisture(?:\s+content)?", text)
    if moisture is not None:
        out["initial_moisture_pct"] = moisture

    application = _first_match(text, [
        (r"\b(?:edible\s+)?coating\b|\bcoated\s+with\b", "coating"),
        (r"\bdipp(?:ed|ing)\b|\bimmersion\b|\bimmersed\b", "dipping"),
        (r"\bspray(?:ed|ing)?\b", "spray"),
        (r"\b(?:added|mixed|incorporated)\s+(?:into|in|with)\b", "mixed"),
        (r"\bbrin(?:e|ed|ing)\b", "brine"),
        (r"\binject(?:ed|ion)\b", "injection"),
        (r"\bsurface\s+application\b", "surface"),
    ])
    if application:
        out["application_method"] = application

    timing = _first_match(text, [
        (r"\bbefore\s+storage\b|\bpre[-\s]?storage\b", "pre-storage"),
        (r"\bduring\s+storage\b", "during-storage"),
        (r"\bat\s+(?:the\s+)?packaging\b|\bat\s+packing\b", "at-packaging"),
        (r"\bafter\s+(?:processing|manufacture|production)\b|\bpost[-\s]?processing\b", "post-processing"),
    ])
    if timing:
        out["treatment_timing"] = timing

    treatment_type = _first_match(text, [
        (r"\bessential\s+oil\b", "essential_oil"),
        (r"\bbacteriocin\b|\bnisin\b", "bacteriocin"),
        (r"\bactive\s+packaging\b|\bantimicrobial\s+packaging\b", "packaging"),
        (r"\b(?:edible\s+)?coating\b", "coating"),
        (r"\bantimicrobial\b", "antimicrobial"),
    ])
    if treatment_type:
        out["treatment_type"] = treatment_type

    return out


def _merge_unambiguous(parsed: list[dict[str, Any]]) -> dict[str, Any]:
    keys = {key for item in parsed for key in item}
    merged: dict[str, Any] = {}
    for key in keys:
        if key == "gas_composition":
            gases: dict[str, float] = {}
            for gas in ("CO2", "O2", "N2"):
                value = _single(item.get(key, {}).get(gas) for item in parsed if isinstance(item.get(key), dict))
                if value is not None:
                    gases[gas] = value
            if gases:
                merged[key] = gases
            continue
        value = _single(item.get(key) for item in parsed)
        if value is not None:
            merged[key] = value
    return merged


def enrich_extraction_result(result: PaperExtractionResult, paper_id: int, db: Session) -> PaperExtractionResult:
    """Fill only missing experiment/treatment context fields from Docling-linked text.

    This mutates and returns `result` for convenience. Existing engine values win;
    deterministic enrichment only backfills fields an engine did not populate.
    """
    try:
        assets = select_assets_for_extraction(paper_id, db)
    except Exception:
        return result

    sources: list[_TextSource] = []
    seen: set[str] = set()
    for asset in assets:
        if asset.caption:
            text = _clean(asset.caption)
            if text and text not in seen:
                seen.add(text)
                sources.append(_TextSource(text, asset.page_number, asset.docling_item_ref, asset.caption))
        for link in asset.context_links:
            text = _clean(link.text or "")
            if not text or text in seen:
                continue
            seen.add(text)
            sources.append(_TextSource(
                text,
                getattr(link, "page_number", None) or asset.page_number,
                getattr(link, "item_ref", None) or asset.docling_item_ref,
                getattr(asset, "section_name", None),
            ))

    if not sources or not result.experiments:
        return result

    parsed_global = _merge_unambiguous([_parse_conditions(src.text) for src in sources])

    experiment_fields = {
        "product_family", "milk_species", "milk_treatment", "fat_content_class",
        "sampling_location", "storage_temperature_value", "storage_temperature_unit_original",
        "storage_temperature_c", "storage_relative_humidity", "packaging_type",
        "atmosphere_type", "gas_composition", "light_condition", "storage_duration_value",
        "storage_duration_unit_original", "storage_duration_days", "study_design",
        "replicate_design", "artificial_inoculation", "initial_ph", "initial_water_activity",
        "initial_salt_pct", "initial_moisture_pct",
    }
    treatment_fields = {"application_method", "treatment_timing", "treatment_type"}

    for exp in result.experiments:
        specific_sources = [src for src in sources if _contains_identity(src.text, exp.cheese_product, exp.treatment)]
        specific = _merge_unambiguous([_parse_conditions(src.text) for src in specific_sources]) if specific_sources else {}
        combined = dict(parsed_global)
        combined.update(specific)  # experiment-linked evidence is stronger than document-global evidence

        added = False
        for field_name in experiment_fields | treatment_fields:
            current = getattr(exp, field_name, None)
            if current not in (None, "", {}, []):
                continue
            if field_name in combined:
                setattr(exp, field_name, combined[field_name])
                added = True

        if exp.is_control is None and re.search(r"\b(control|untreated|vehicle)\b", exp.treatment or "", re.IGNORECASE):
            exp.is_control = True
            added = True

        if added:
            source = specific_sources[0] if specific_sources else sources[0]
            exp.provenance.append(Provenance(
                source_type="text",
                docling_item_ref=source.item_ref,
                page_number=source.page_number,
                source_label=source.source_label,
                exact_text=source.text[:1000],
                confidence=0.82 if specific_sources else 0.72,
                confidence_reason=(
                    "Condition parsed deterministically from Docling-linked text that names this experiment."
                    if specific_sources else
                    "Single unambiguous condition parsed from Docling-linked text for this paper."
                ),
            ))

    return result


__all__ = ["enrich_extraction_result"]
