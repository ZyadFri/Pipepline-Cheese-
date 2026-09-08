"""
evidence_package.py — Build compact, LLM-ready evidence packages from Docling artefacts.

Instead of sending the full paper Markdown to the LLM, this module assembles
small evidence packages containing relevant text, native tables and validated
chart CSVs. Every package also reminds the extractor about the OPTIONAL rich
scientific context supported by the canonical schema. Optional means exactly
that: if a value is not explicitly supported by this paper, omit the key rather
than returning null/unknown placeholders.
"""
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from app.services.docling_extractor import DoclingResult, DoclingText, DoclingTable, DoclingFigure
from app.services.chart_converter import ChartResult

logger = logging.getLogger(__name__)

_RELEVANCE_KW = frozenset({
    # Time / storage
    "day", " d0", " d1", " d2", " d3", " d4", " d5", " d6", " d7",
    "d8", " d9", "d10", "d12", "d14", "d16", "d21",
    "storage", "shelf", "shelf-life", "shelf life", "temperature",
    "humidity", "relative humidity", "dark", "light", "refrigerated", "frozen",
    # Microbiology
    "cfu", "log cfu", "tvc", "total viable", "aerobic",
    "yeast", "mold", "mould", "coliform", "salmonella", "listeria",
    "staphylococcus", "lactic acid bacteria", "inoculated", "inoculation",
    # Chemistry / quality
    "ph", "tbars", "tvb-n", "tvb", "aw", "water activity",
    "oxidation", "peroxide", "acid value", "moisture", "salt",
    "colour", "color", "texture", "firmness", "hardness",
    # Treatments / ingredients
    "treatment", "control", "coating", "dip", "spray", "marination", "brine",
    "chitosan", "nisin", "thymol", "rosemary", "oregano", "thyme",
    "essential oil", "bacteriocin", "antimicrobial", "antioxidant",
    "concentration", "%, g/l, mg/kg, mg/g, mg/ml, au/ml",
    "preservation", "packaging", "vacuum", "modified atmosphere", "map",
    # Matrix / design
    "cheese", "milk", "whey", "casein", "ripening", "coagulation",
    "raw milk", "pasteurized", "pasteurised", "thermized", "thermised",
    "cow milk", "goat milk", "sheep milk", "buffalo milk", "fat",
    "surface", "rind", "core", "replicate", "triplicate", "challenge study",
    # Other food matrices retained for generality
    "beef", "chicken", "pork", "lamb", "turkey", "fish", "salmon",
    "fillet", "breast", "loin", "minced", "ground", "sausage",
    # Statistical
    "p<", "p <", "p=", "significant", "mean", "std", "sd", "standard deviation",
    "standard error", "detection limit",
})

_HEADING_RELEVANCE_KW = frozenset({
    "material", "method", "result", "experiment", "treatment",
    "antimicrobial", "preservation", "quality", "measurement",
    "microbial", "chemical", "physical", "sensory", "storage", "composition",
})

MAX_TOKENS_PER_PACKAGE = 3_000
_CHARS_PER_TOKEN = 4

# This supplements food_extractor.SYSTEM_PROMPT without breaking the old JSON
# contract. Models that understand the fields return them inside each experiment;
# adapters.py accepts them. Models that do not simply keep returning the old
# schema and the deterministic context_enricher backfills what it can.
_RICH_SCHEMA_HINT = """
OPTIONAL SCIENTIFIC CONTEXT — include a key inside each experiment ONLY when the
paper explicitly supports it. Do NOT emit null, unknown, N/A, or guessed values.
Preserve the paper's wording/units where requested.

Experiment/product fields you may add:
  food_category, product_family, matrix_description, milk_species,
  milk_treatment, fat_content_class, sampling_location,
  storage_temperature_value, storage_temperature_unit_original,
  storage_temperature_c, storage_relative_humidity, packaging_type,
  atmosphere_type, gas_composition (object such as {"CO2":30,"N2":70}),
  light_condition, storage_duration_value, storage_duration_unit_original,
  storage_duration_days, study_design, replicate_design,
  artificial_inoculation, initial_ph, initial_water_activity,
  initial_salt_pct, initial_moisture_pct.

Treatment fields you may add on the experiment:
  is_control, treatment_type, application_method, treatment_timing,
  extra_treatment (object for other explicitly reported treatment conditions).

For each ingredient you may additionally add:
  ingredient_family, application_method, treatment_timing, extra.

For each measurement you may additionally add, only if explicitly reported:
  microorganism_name, time_value_original, time_unit_original,
  measurement_unit_normalized, value_original_text, mean_value,
  standard_deviation, standard_error, minimum_value, maximum_value,
  replicate_count, detection_limit, detection_limit_unit, censoring_type,
  significance_letter, value_origin, extra.

If a scientifically useful fact does not fit any of these fields, do not force it
into the wrong key. Leave it to the application's unmapped-fact preservation.
""".strip()


def _is_relevant_text(txt: DoclingText) -> bool:
    combined = (txt.text + " " + (txt.heading_context or "")).lower()
    return any(kw in combined for kw in _RELEVANCE_KW)


def _is_relevant_heading(heading: Optional[str]) -> bool:
    if not heading:
        return True
    return any(kw in heading.lower() for kw in _HEADING_RELEVANCE_KW)


@dataclass
class EvidenceItem:
    item_ref: str
    page_number: int
    source_type: str
    source_label: Optional[str]
    caption: Optional[str]
    content: str
    bbox: Optional[dict]
    is_approximate: bool = False


@dataclass
class EvidencePackage:
    index: int
    items: list = field(default_factory=list)
    token_estimate: int = 0

    def render(self) -> str:
        parts = [f"=== EVIDENCE PACKAGE {self.index} ===\n", _RICH_SCHEMA_HINT, ""]
        for item in self.items:
            approx_note = "  [VALUES ARE APPROXIMATE — chart reading]" if item.is_approximate else ""
            header = (
                f"[{item.source_type.upper()}]"
                f" {item.source_label or ''}"
                f" (ref: {item.item_ref}, page: {item.page_number})"
                f"{approx_note}"
            )
            if item.caption:
                header += f"\nCaption: {item.caption}"
            parts.append(f"\n{header}\n{item.content}\n")
        return "\n".join(parts)


def build_packages(
    docling_result: DoclingResult,
    chart_results: list,
    max_tokens: int = MAX_TOKENS_PER_PACKAGE,
) -> list:
    max_chars = max_tokens * _CHARS_PER_TOKEN
    items: list = []

    for tbl in docling_result.tables:
        if not tbl.csv_path or not Path(tbl.csv_path).exists():
            continue
        try:
            content = Path(tbl.csv_path).read_text(encoding="utf-8")
        except Exception:
            continue
        if not content.strip():
            continue
        items.append(EvidenceItem(
            item_ref=tbl.item_ref, page_number=tbl.page_number, source_type="table",
            source_label=tbl.caption or f"Table (page {tbl.page_number})",
            caption=tbl.caption, content=content[:4000], bbox=tbl.bbox, is_approximate=False,
        ))

    chart_by_ref = {cr.item_ref: cr for cr in chart_results}
    for fig in docling_result.figures:
        cr = chart_by_ref.get(fig.item_ref)
        if not cr or cr.status != "valid" or not cr.csv_path or not Path(cr.csv_path).exists():
            continue
        try:
            content = Path(cr.csv_path).read_text(encoding="utf-8")
        except Exception:
            continue
        if not content.strip():
            continue
        label = fig.caption or f"Figure {cr.figure_index} (page {fig.page_number})"
        items.append(EvidenceItem(
            item_ref=fig.item_ref, page_number=fig.page_number, source_type="chart_csv",
            source_label=label, caption=fig.caption, content=content[:2000], bbox=fig.bbox,
            is_approximate=True,
        ))

    for txt in docling_result.texts:
        if not _is_relevant_heading(txt.heading_context) or not _is_relevant_text(txt):
            continue
        items.append(EvidenceItem(
            item_ref=txt.item_ref, page_number=txt.page_number, source_type="text",
            source_label=txt.heading_context, caption=None, content=txt.text[:1500],
            bbox=txt.bbox, is_approximate=False,
        ))

    if not items:
        logger.info("Evidence package builder: no relevant items found.")
        return []

    packages: list = []
    current_items: list = []
    current_chars = len(_RICH_SCHEMA_HINT)
    pkg_index = 1

    for item in items:
        item_chars = len(item.content) + len(item.item_ref) + 100
        if current_items and current_chars + item_chars > max_chars:
            packages.append(EvidencePackage(
                index=pkg_index, items=current_items,
                token_estimate=current_chars // _CHARS_PER_TOKEN,
            ))
            pkg_index += 1
            current_items = []
            current_chars = len(_RICH_SCHEMA_HINT)
        current_items.append(item)
        current_chars += item_chars

    if current_items:
        packages.append(EvidencePackage(
            index=pkg_index, items=current_items,
            token_estimate=current_chars // _CHARS_PER_TOKEN,
        ))

    logger.info(
        "Built %d evidence packages (%d items: %d tables, %d charts, %d text)",
        len(packages), len(items),
        sum(1 for i in items if i.source_type == "table"),
        sum(1 for i in items if i.source_type == "chart_csv"),
        sum(1 for i in items if i.source_type == "text"),
    )
    return packages
