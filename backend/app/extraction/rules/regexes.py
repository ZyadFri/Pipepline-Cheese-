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
    generation, not canonical fields."""
    if not text:
        return []
    pattern = re.compile(
        r"([A-Za-z][A-Za-z\s\-]{2,30}?)\s+(?:was|were|of|=|is|are)\s*[:]?\s*" + NUMBER + r"\s*([A-Za-z%/°]*)",
    )
    results = []
    for m in pattern.finditer(text):
        label = m.group(1).strip()
        try:
            value = float(m.group(2).replace(",", "."))
        except ValueError:
            continue
        unit = (m.group(3) or "").strip()
        results.append(NumericMatch(
            kind="generic", raw_text=m.group(0).strip(), value=value, unit=unit,
            span=m.span(), predicate=label.lower(),
        ))
    return results


__all__ = ["NumericMatch", "find_numeric_facts", "find_generic_numeric_facts", "_nearest_noun_phrase"]
