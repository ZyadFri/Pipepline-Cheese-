"""
Sentence-level fact extraction from Docling text/context-link content: storage
conditions, concentration statements, and simple qualitative findings
("significantly reduced", "no significant difference"). Feeds ExperimentContext
backfill and UnmappedFact generation — this module never talks to the database.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

from app.extraction.common.models import QualitativeObservation
from app.extraction.rules.lexicon_loader import cheese_lexicon, best_match
from app.extraction.rules.regexes import find_numeric_facts, find_generic_numeric_facts, _nearest_noun_phrase
from app.extraction.rules.relations import is_control_arm, link_concentrations_to_ingredients

_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+")

_QUALITATIVE_PATTERNS: list[tuple[re.Pattern, str, str]] = [
    (re.compile(r"significantly\s+(?:reduced|decreased|lower(?:ed)?)", re.IGNORECASE), "decreased", "significant"),
    (re.compile(r"significantly\s+(?:increased|higher)", re.IGNORECASE), "increased", "significant"),
    (re.compile(r"no\s+significant\s+difference", re.IGNORECASE), "no_change", "not_significant"),
    (re.compile(r"\binhibited\b", re.IGNORECASE), "inhibited", "unknown"),
    (re.compile(r"\bimproved\b", re.IGNORECASE), "improved", "unknown"),
    (re.compile(r"\bworsened\b", re.IGNORECASE), "worsened", "unknown"),
    (re.compile(r"(?:increased|extended)\s+shelf[\s-]life", re.IGNORECASE), "increased", "unknown"),
]


@dataclass
class TextFacts:
    cheese_products: list[str]
    is_control: bool
    concentration_links: list
    storage_temperature_c: Optional[float]
    storage_duration_days: Optional[float]
    qualitative: list[QualitativeObservation]


def split_sentences(text: str) -> list[str]:
    if not text:
        return []
    return [s.strip() for s in _SENTENCE_SPLIT.split(text) if s.strip()]


def extract_text_facts(text: str) -> TextFacts:
    """One-pass extraction of everything text_facts.py knows how to find in a
    block of text (a paragraph, a caption, a context-link snippet)."""
    if not text:
        return TextFacts([], False, [], None, None, [])

    cheese_alias, cheese_entries = cheese_lexicon()
    cheeses = []
    seen = set()
    for sentence in split_sentences(text):
        m = best_match(sentence, cheese_alias, cheese_entries)
        if m and m.canonical_name not in seen:
            cheeses.append(m.canonical_name.replace("_", " "))
            seen.add(m.canonical_name)

    storage_temp = None
    storage_days = None
    for fact in find_numeric_facts(text):
        if fact.predicate in ("storage_temperature", "incubation_temperature") and storage_temp is None:
            storage_temp = fact.value
        elif fact.kind == "temperature" and storage_temp is None and fact.predicate is None:
            storage_temp = fact.value
        if fact.predicate in ("storage_duration", "duration") and storage_days is None:
            storage_days = fact.value
        elif fact.kind == "days" and storage_days is None and fact.predicate is None:
            storage_days = fact.value

    qualitative = []
    for pattern, direction, significance in _QUALITATIVE_PATTERNS:
        m = pattern.search(text)
        if m:
            qualitative.append(QualitativeObservation(
                subject=_nearest_noun_phrase(text, m.start()) or "unspecified",
                direction=direction, significance=significance, raw_text=text[:300],
            ))

    return TextFacts(
        cheese_products=cheeses,
        is_control=is_control_arm(text),
        concentration_links=link_concentrations_to_ingredients(text),
        storage_temperature_c=storage_temp,
        storage_duration_days=storage_days,
        qualitative=qualitative,
    )


def find_unmapped_numeric_facts(text: str) -> list:
    """Generic 'noun phrase + number + unit' hits that didn't match any known
    scientific pattern — the last line of defense against silently losing a
    detected value (spec §7/§24, e.g. 'springiness was 0.72')."""
    known_predicates = {"storage_temperature", "incubation_temperature", "storage_duration",
                         "duration", "measurement_time", "moisture", "storage_humidity"}
    specific = find_numeric_facts(text)
    specific_spans = {f.span for f in specific}
    generic = find_generic_numeric_facts(text)
    return [
        g for g in generic
        if g.span not in specific_spans and (g.predicate not in known_predicates)
    ]
