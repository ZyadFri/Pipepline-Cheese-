"""
Transparent, fixed confidence tiers for the rule engine — never fake precision.
Every score comes with a `confidence_reason` string explaining exactly why that
tier applied, so a reviewer (or the ML engine's weak-supervision step, later)
can see the reasoning, not just a bare number.
"""
from __future__ import annotations

EXACT_TABLE_VALUE = 1.00
EXPLICIT_SENTENCE = 0.95
CAPTION_INHERITED = 0.85
PARAGRAPH_INHERITED = 0.75
FUZZY_RELATIONSHIP = 0.60


def table_value_confidence(has_header: bool, has_unit: bool) -> tuple[float, str]:
    if has_header and has_unit:
        return EXACT_TABLE_VALUE, "Value read directly from a table cell with an explicit header and unit."
    if has_header:
        return EXPLICIT_SENTENCE, "Value read from a table cell with an explicit header; unit inferred."
    return PARAGRAPH_INHERITED, "Value read from a table cell without a clear header; treated as inherited context."


def sentence_relation_confidence(rule_name: str) -> tuple[float, str]:
    return EXPLICIT_SENTENCE, f"Matched an explicit sentence pattern ({rule_name})."


def caption_inherited_confidence(field: str) -> tuple[float, str]:
    return CAPTION_INHERITED, f"{field} inherited from the table/figure caption, not repeated in the row."


def paragraph_inherited_confidence(field: str) -> tuple[float, str]:
    return PARAGRAPH_INHERITED, f"{field} inherited from the nearest surrounding paragraph."


def fuzzy_match_confidence(matched_alias: str, score: float) -> tuple[float, str]:
    return FUZZY_RELATIONSHIP, f"Fuzzy lexicon match against '{matched_alias}' (similarity {score:.0f}%)."
