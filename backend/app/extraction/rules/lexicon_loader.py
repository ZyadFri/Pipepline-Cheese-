"""
Loads app/extraction/lexicons/*.yml (cached) and matches surface text against
each lexicon's alias lists — exact substring first, then rapidfuzz fuzzy
matching for spelling variants. Never invents a match below the fuzzy threshold;
callers should treat "no match" as a real answer, not an error.
"""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Optional

import yaml
from rapidfuzz import fuzz, process

LEXICON_DIR = Path(__file__).resolve().parent.parent / "lexicons"

FUZZY_THRESHOLD = 87.0   # rapidfuzz token_sort_ratio score (0-100) — conservative,
                          # tuned to catch spelling variants without over-matching


@dataclass
class LexiconMatch:
    canonical_name: str
    matched_alias: str
    raw_text: str
    score: float          # 100.0 for an exact substring match, else the fuzzy score
    extra: dict           # the rest of that entry's YAML fields (functional_class, canonical_type, ...)


@lru_cache(maxsize=None)
def _load_yaml(filename: str) -> dict:
    path = LEXICON_DIR / filename
    if not path.exists():
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


@lru_cache(maxsize=None)
def _alias_index(filename: str) -> tuple[dict[str, str], dict[str, dict]]:
    """Returns (alias_lower -> canonical_name, canonical_name -> entry dict)."""
    data = _load_yaml(filename)
    alias_to_name: dict[str, str] = {}
    entries: dict[str, dict] = {}
    for canonical_name, entry in data.items():
        entries[canonical_name] = entry or {}
        for alias in (entry or {}).get("aliases", []):
            alias_to_name[alias.lower().strip()] = canonical_name
    return alias_to_name, entries


def cheese_lexicon() -> tuple[dict[str, str], dict[str, dict]]:
    return _alias_index("cheese_products.yml")


def ingredient_lexicon() -> tuple[dict[str, str], dict[str, dict]]:
    return _alias_index("ingredients.yml")


def indicator_lexicon() -> tuple[dict[str, str], dict[str, dict]]:
    return _alias_index("indicators.yml")


def match_text(text: str, alias_to_name: dict[str, str], entries: dict[str, dict],
                fuzzy_threshold: float = FUZZY_THRESHOLD) -> list[LexiconMatch]:
    """
    Find every lexicon entry mentioned in `text`. Exact substring matches are
    always returned (score 100). If nothing matched exactly, fuzzy-match each
    lexicon alias against the whole text as a fallback for spelling variants —
    intentionally conservative (high threshold) since a false entity match is
    worse than a missed one here; anything genuinely ambiguous should surface
    as an UnmappedFact instead of a wrong entity.
    """
    if not text:
        return []
    text_lower = text.lower()
    matches: list[LexiconMatch] = []
    seen_names: set[str] = set()

    for alias, canonical_name in alias_to_name.items():
        if alias in text_lower and canonical_name not in seen_names:
            matches.append(LexiconMatch(
                canonical_name=canonical_name, matched_alias=alias, raw_text=alias,
                score=100.0, extra=entries.get(canonical_name, {}),
            ))
            seen_names.add(canonical_name)

    if matches:
        return matches

    best = process.extractOne(text_lower, list(alias_to_name.keys()), scorer=fuzz.token_sort_ratio)
    if best and best[1] >= fuzzy_threshold:
        alias, score, _ = best
        canonical_name = alias_to_name[alias]
        matches.append(LexiconMatch(
            canonical_name=canonical_name, matched_alias=alias, raw_text=text,
            score=float(score), extra=entries.get(canonical_name, {}),
        ))
    return matches


def best_match(text: str, alias_to_name: dict[str, str], entries: dict[str, dict]) -> Optional[LexiconMatch]:
    found = match_text(text, alias_to_name, entries)
    return found[0] if found else None
