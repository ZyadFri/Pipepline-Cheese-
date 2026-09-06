"""
Deterministic relation resolution within a single sentence/text span — linking a
concentration to the ingredient it modifies, and detecting the application
method (coated/dipped/sprayed/immersed) a treatment used. Distance-based: the
nearest preceding ingredient mention wins, matching how these sentences are
actually written in cheese-preservation papers ("coated with 0.5% thyme
essential oil").
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

from app.extraction.rules.lexicon_loader import ingredient_lexicon, match_text
from app.extraction.rules.regexes import find_numeric_facts

_APPLICATION_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\bcoated\s+with\b", re.IGNORECASE), "coating"),
    (re.compile(r"\bdipped\s+in\b", re.IGNORECASE), "dipping"),
    (re.compile(r"\bsprayed\s+with\b", re.IGNORECASE), "spraying"),
    (re.compile(r"\bimmersed\s+in\b", re.IGNORECASE), "immersion"),
    (re.compile(r"\btreated\s+with\b", re.IGNORECASE), "treatment"),
    (re.compile(r"\bvacuum[\s-]packag(?:ed|ing)\b", re.IGNORECASE), "vacuum_packaging"),
    (re.compile(r"\bmodified\s+atmosphere\b", re.IGNORECASE), "modified_atmosphere_packaging"),
]

_CONTROL_PATTERN = re.compile(r"\bcontrol(?:\s+(?:sample|group|cheese|treatment))?\b", re.IGNORECASE)


@dataclass
class IngredientConcentrationLink:
    ingredient_name: str
    concentration_value: float
    concentration_unit: str
    application_method: Optional[str]
    raw_text: str
    distance: int   # character distance between the two spans — used for confidence


def detect_application_method(text: str) -> Optional[str]:
    for pattern, method in _APPLICATION_PATTERNS:
        if pattern.search(text):
            return method
    return None


def is_control_arm(text: str) -> bool:
    return bool(_CONTROL_PATTERN.search(text)) if text else False


def link_concentrations_to_ingredients(text: str) -> list[IngredientConcentrationLink]:
    """Find every (concentration, ingredient) pair in `text` by nearest-neighbor
    distance — the concentration closest to an ingredient mention is assumed to
    modify it (spec §12: 'CONCENTRATION → closest INGREDIENT'). Skips a
    concentration if no ingredient is found anywhere in the text at all."""
    alias_to_name, entries = ingredient_lexicon()
    ingredient_hits = []
    for alias, name in alias_to_name.items():
        for m in re.finditer(re.escape(alias), text, re.IGNORECASE):
            ingredient_hits.append((m.start(), m.end(), name, alias))

    if not ingredient_hits:
        return []

    links = []
    application = detect_application_method(text)
    for fact in find_numeric_facts(text):
        if fact.kind != "percentage":
            continue
        nearest = min(ingredient_hits, key=lambda h: min(abs(h[0] - fact.span[1]), abs(fact.span[0] - h[1])))
        distance = min(abs(nearest[0] - fact.span[1]), abs(fact.span[0] - nearest[1]))
        links.append(IngredientConcentrationLink(
            ingredient_name=nearest[2].replace("_", " "),
            concentration_value=fact.value,
            concentration_unit=fact.unit,
            application_method=application,
            raw_text=fact.raw_text,
            distance=distance,
        ))
    return links
