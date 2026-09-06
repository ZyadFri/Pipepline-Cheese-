"""
Generic number+unit extraction from free text. Deliberately does NOT stop at
"found a number" — for every numeric match it also looks at the text immediately
around it for a semantic label (predicate), because a bare number with no label
is useless. When no known predicate is recognized, the caller is expected to
build an UnmappedFact from the nearest noun phrase rather than discard the value.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

NUMBER = r"(-?\d+(?:[.,]\d+)?)"


@dataclass
class NumericMatch:
    kind: str                  # temperature|percentage|days|microbial|ph|water_activity|generic
    raw_text: str               # the exact matched span, e.g. "4°C", "0.5%"
    value: float
    unit: str                   # normalized unit, e.g. "°C", "%", "days", "log CFU/g"
    span: tuple[int, int]       # (start, end) offsets in the source text
    predicate: Optional[str] = None   # semantic label if one was found nearby, e.g. "storage_temperature"


# Order matters: more specific patterns (microbial log units, pH, aw) must be
# tried before the generic "number + %/unit" fallback so they aren't mis-typed.
_PATTERNS: list[tuple[str, re.Pattern]] = [
    ("temperature", re.compile(NUMBER + r"\s*(?:°\s*C|°C|deg(?:rees)?\s*C\b|\s*C\b(?=\s|$))", re.IGNORECASE)),
    ("microbial", re.compile(NUMBER + r"\s*log\s*(?:10)?\s*CFU\s*[/g\-]*\s*g?\b", re.IGNORECASE)),
    ("ph", re.compile(r"\bpH\s*(?:of|=|:)?\s*" + NUMBER, re.IGNORECASE)),
    ("water_activity", re.compile(r"\ba[wW]\s*(?:of|=|:)?\s*" + NUMBER)),
    ("percentage", re.compile(NUMBER + r"\s*%")),
    ("days", re.compile(NUMBER + r"\s*(?:days?|d\b)", re.IGNORECASE)),
    ("humidity", re.compile(NUMBER + r"\s*%?\s*RH\b", re.IGNORECASE)),
    ("p_value", re.compile(r"[pP]\s*(?:<|=|>)\s*" + NUMBER)),
]

# Nearby-phrase → predicate rules, checked against the ~60 chars before a match.
# First match wins; order = specificity.
_CONTEXT_PREDICATES: list[tuple[re.Pattern, str]] = [
    (re.compile(r"stored?\s+at\s*$", re.IGNORECASE), "storage_temperature"),
    (re.compile(r"incubat\w*\s+at\s*$", re.IGNORECASE), "incubation_temperature"),
    (re.compile(r"stored?\s+for\s*$", re.IGNORECASE), "storage_duration"),
    (re.compile(r"\bfor\s*$", re.IGNORECASE), "duration"),
    (re.compile(r"\bon\s+day\s*$", re.IGNORECASE), "measurement_time"),
    (re.compile(r"(moisture\s+content|moisture)\s*(?:was|of|is)?\s*$", re.IGNORECASE), "moisture"),
    (re.compile(r"(relative\s+humidity)\s*(?:of|was)?\s*$", re.IGNORECASE), "storage_humidity"),
]


def _nearest_predicate(text: str, start: int) -> Optional[str]:
    window = text[max(0, start - 60):start]
    for pattern, predicate in _CONTEXT_PREDICATES:
        if pattern.search(window):
            return predicate
    return None


def _nearest_noun_phrase(text: str, start: int, max_words: int = 4) -> Optional[str]:
    """Best-effort fallback label when no known predicate matched: the last few
    words before the number, stripped of connective words. Used only to build an
    UnmappedFact — never presented as a confident field name."""
    window = text[max(0, start - 80):start]
    words = re.findall(r"[A-Za-z][A-Za-z\-]+", window)
    stop = {"was", "were", "is", "are", "of", "the", "a", "an", "at", "for", "with", "and", "to", "in", "on"}
    candidate = [w for w in words if w.lower() not in stop][-max_words:]
    return " ".join(candidate).strip() or None


_UNIT_NORMALIZE = {
    "temperature": "°C",
    "microbial": "log CFU/g",
    "ph": "",
    "water_activity": "",
    "percentage": "%",
    "days": "days",
    "humidity": "% RH",
    "p_value": "",
}


def find_numeric_facts(text: str) -> list[NumericMatch]:
    """Scan `text` for every recognizable number+unit pattern. Returns one
    NumericMatch per hit, each with its own span so provenance can quote the
    exact substring, and a `predicate` when the surrounding words identify what
    was measured."""
    if not text:
        return []
    results: list[NumericMatch] = []
    covered: list[tuple[int, int]] = []

    for kind, pattern in _PATTERNS:
        for m in pattern.finditer(text):
            span = m.span()
            if any(span[0] < c[1] and span[1] > c[0] for c in covered):
                continue  # already claimed by a more specific pattern
            raw_value = m.group(1).replace(",", ".")
            try:
                value = float(raw_value)
            except ValueError:
                continue
            predicate = _nearest_predicate(text, span[0])
            results.append(NumericMatch(
                kind=kind, raw_text=m.group(0).strip(), value=value,
                unit=_UNIT_NORMALIZE.get(kind, ""), span=span, predicate=predicate,
            ))
            covered.append(span)

    return sorted(results, key=lambda r: r.span[0])


def find_generic_numeric_facts(text: str) -> list[NumericMatch]:
    """A looser fallback pass for 'noun phrase + number + unit' patterns that
    don't match any of the specific scientific patterns above (spec §7/§24) —
    e.g. 'springiness was 0.72', 'cohesiveness of 0.61'. Feeds UnmappedFact
    generation, not canonical fields.

    Deliberately conservative: an earlier, looser version of this scanned raw
    narrative sentences unconditionally and produced real garbage on real
    papers — "examined at a working distance" = 5.86, "mm and an accelerating
    voltage" = 30.0 kV — because it had no sense of clause boundaries (grabbing
    mid-word fragments) and no idea that "working distance"/"accelerating
    voltage" are SEM operating parameters, not cheese science. Three guards
    fix that: (1) the phrase must start at a real clause boundary, not an
    arbitrary character offset; (2) a phrase led by a narrative verb
    ("examined", "measured", "performed", ...) is rejected — those describe an
    action in a Methods sentence, not a property with a value; (3) a fixed
    denylist of analytical-instrument vocabulary (SEM/GC-MS/HPLC calibration
    terms) voids the match outright, since virtually every paper's Methods
    section contains some of these and none of them are cheese-science facts.
    """
    if not text:
        return []

    pattern = re.compile(
        r"(?:^|[.;,]\s*|\band\s+)([A-Za-z][A-Za-z\s\-]{2,40}?)\s+(?:was|were|of|=|is|are)\s*[:]?\s*"
        + NUMBER + r"\s*(" + "|".join(_UNIT_WHITELIST) + r")?(?=\s|$|[,.;)])",
    )
    results = []
    for m in pattern.finditer(text):
        label = m.group(1).strip()
        label_lower = label.lower()

        if any(term in label_lower for term in _INSTRUMENT_DENYLIST):
            continue
        first_word = label_lower.split()[0] if label_lower.split() else ""
        if first_word in _LEADING_VERB_DENYLIST:
            continue

        try:
            value = float(m.group(2).replace(",", "."))
        except ValueError:
            continue
        unit = (m.group(3) or "").strip()
        results.append(NumericMatch(
            kind="generic", raw_text=m.group(0).strip(), value=value, unit=unit,
            span=m.span(), predicate=label_lower,
        ))
    return results


# Real unit tokens only — the previous "any trailing letters" capture happily
# grabbed the first word of the NEXT clause as a "unit" ("springiness was 0.72
# and cohesiveness..." -> unit="and"). Longer tokens first so e.g. "kg" isn't
# cut short by a "g" alternative matching first.
_UNIT_WHITELIST = [
    "degC", "kPa", "MPa", "CFU", "log", "ppm", "N/m2", "mmHg",
    "mg", "kg", "mL", "cm", "mm", "min",
    "g", "h", "s", "N", "%",
]

# Analytical-instrument / methodology vocabulary — never a cheese-science fact,
# regardless of what number sits next to it. Broad on purpose: any paper using
# SEM, GC-MS, HPLC, or a spectrophotometer will describe calibration settings
# in almost identical language, so this isn't specific to one paper.
_INSTRUMENT_DENYLIST = {
    "working distance", "accelerating voltage", "water vapor pressure",
    "magnification", "wavelength", "flow rate", "scan rate", "resolution",
    "sputter", "coated with gold", "vacuum", "detector", "excitation",
    "emission", "chromatogram", "retention time", "column temperature",
    "injection volume", "carrier gas", "mobile phase",
}

# Narrative-methods verbs — a phrase led by one of these describes an ACTION
# ("examined at...", "performed using...", "expressed as...") rather than a
# measured property, so it's a methods-section aside, not a fact with a value.
_LEADING_VERB_DENYLIST = {
    "examined", "measured", "performed", "conducted", "carried", "obtained",
    "expressed", "reported", "used", "based", "shown", "determined",
    "calculated", "analyzed", "prepared", "collected", "recorded", "operated",
    "run", "set", "adjusted", "maintained", "kept", "placed", "stored",
    "heated", "cooled", "mixed", "added", "dissolved", "diluted", "filtered",
    "centrifuged", "incubated", "sterilized", "sealed", "labeled", "coded",
}


__all__ = ["NumericMatch", "find_numeric_facts", "find_generic_numeric_facts", "_nearest_noun_phrase"]
