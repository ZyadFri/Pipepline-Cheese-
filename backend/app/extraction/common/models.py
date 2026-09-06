"""
Shared intermediate representation (IR) produced by every extraction engine
(LLM, Rules, ML). None of these classes touch the database — they're pure data,
built by an engine's extract_document() and consumed by
app/extraction/common/persist.py:persist_paper_extraction(), which is the ONE
function that writes any engine's output into the Ext* staging schema.

Every extracted value carries a `provenance` list so a human (or a later engine)
can always trace a number back to the exact page/table/sentence it came from.
Nothing in this module invents values: an engine that isn't sure MUST omit the
field or emit an UnmappedFact instead of guessing.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Provenance:
    """Where one extracted value came from — the traceability the whole project depends on."""
    source_type: str                       # text|table|chart|figure|caption|supplementary_material
    docling_item_ref: Optional[str] = None
    page_number: Optional[int] = None
    source_label: Optional[str] = None     # "Table 2", "Figure 3"
    exact_text: Optional[str] = None       # the raw sentence/cell this came from
    table_row_header: Optional[str] = None
    table_col_header: Optional[str] = None
    bbox: Optional[dict] = None            # fractional {"x1","y1","x2","y2"} — same convention as ExtractionAsset.bbox_json
    confidence: float = 0.5
    confidence_reason: str = ""            # human-readable "why" — never fake precision
    value_is_approximate: bool = False     # True for anything chart-digitized/estimated


@dataclass
class ExtractedIngredientLink:
    ingredient_name: str
    functional_class: str = "unknown"      # antimicrobial|antioxidant|preservative|coating_agent|acidulant|texture_modifier|combined|other|unknown
    source: str = ""
    concentration: Optional[float] = None
    concentration_unit: Optional[str] = None
    provenance: list[Provenance] = field(default_factory=list)


@dataclass
class ExtractedObservation:
    day: Optional[int]
    indicator_type: str                    # raw label, e.g. "Total viable count"
    indicator_unit: str
    indicator_value: float
    indicator_threshold: Optional[float] = None
    value_is_approximate: bool = False
    provenance: list[Provenance] = field(default_factory=list)


@dataclass
class ExtractedExperiment:
    cheese_product: str
    treatment: str
    ingredients: list[ExtractedIngredientLink] = field(default_factory=list)
    observations: list[ExtractedObservation] = field(default_factory=list)
    provenance: list[Provenance] = field(default_factory=list)   # evidence for the experiment identity itself


@dataclass
class UnmappedFact:
    """
    A scientifically meaningful fact that doesn't map to a canonical field — kept,
    never discarded, per the project's maximum-information principle. Maps 1:1 to
    the ExtUnmappedFact table.
    """
    predicate: str                         # e.g. "springiness"
    value_raw: Optional[str] = None
    value_normalized: Optional[float] = None
    unit_raw: Optional[str] = None
    unit_normalized: Optional[str] = None
    subject: Optional[str] = None          # nearest experiment context, free text
    category: str = "unknown"              # composition|storage|processing|microbiology|sensory|physical|chemical|statistical|unknown
    raw_text: Optional[str] = None
    context: Optional[str] = None
    confidence: Optional[float] = None
    confidence_reason: str = ""
    provenance: Optional[Provenance] = None


@dataclass
class QualitativeObservation:
    """A non-numeric finding, e.g. 'treatment significantly reduced microbial growth'."""
    subject: str
    indicator: Optional[str] = None
    direction: Optional[str] = None        # increased|decreased|no_change|inhibited|improved|worsened
    significance: Optional[str] = None     # significant|not_significant|unknown
    comparison: Optional[str] = None       # what it's being compared against
    raw_text: str = ""
    provenance: Optional[Provenance] = None


@dataclass
class PaperExtractionResult:
    """Top-level output of any ExtractionEngine.extract_document() call."""
    paper_id: int
    project_id: int
    engine: str                            # llm|rules|ml
    engine_version: str = "0.1.0"
    experiments: list[ExtractedExperiment] = field(default_factory=list)
    unmapped_facts: list[UnmappedFact] = field(default_factory=list)
    qualitative_observations: list[QualitativeObservation] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    reasoning_summary: str = ""
