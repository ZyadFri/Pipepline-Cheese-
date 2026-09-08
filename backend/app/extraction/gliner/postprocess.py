"""
Deterministic post-processing for GLiNER's raw entity spans.

GLiNER is a span DETECTOR, not a value parser — empirical testing against
real papers already in this project showed its own numeric/value labeling is
inconsistent (e.g. tagging "MIC" itself, an abbreviation, as a "measurement
value"), while its entity-span DETECTION is genuinely strong, especially for
microorganism species names (a capability the Rules engine has none of) and
ingredient/product names beyond the fixed YAML lexicons. So this module:
  1. Filters generic noise spans a zero-shot label matches literally
     ("cheese" itself, not a product name).
  2. Cross-checks cheese/ingredient/indicator spans against the SAME lexicons
     the Rules engine already uses (app/extraction/rules/lexicon_loader.py),
     preferring the canonical name when one matches.
  3. Hands numeric interpretation to the SAME regex value/unit parser the
     Rules engine already uses (app/extraction/rules/regexes.py) rather than
     trusting GLiNER's own value span.
  4. Groups same-sentence entities into a candidate ExtractedObservation only
     when there's enough co-located evidence (cheese/treatment identity + a
     day + a value) to justify it — otherwise the fact becomes an
     UnmappedFact rather than a guessed record, matching this project's
     "never invent" rule everywhere else.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

from app.extraction.common.models import (
    ExtractedExperiment, ExtractedObservation, Provenance, UnmappedFact,
)
from app.extraction.gliner.labels import GENERIC_NOISE_TERMS
from app.extraction.rules.lexicon_loader import (
    best_match, cheese_lexicon, indicator_lexicon, ingredient_lexicon,
)
from app.extraction.rules.regexes import NumericMatch, find_numeric_facts
from app.extraction.rules.relations import is_control_arm

# Deliberately below Rules' EXACT_TABLE_VALUE/EXPLICIT_SENTENCE tiers (0.95-1.0,
# app/extraction/rules/confidence.py) — this is model-inferred, not
# deterministic pattern matching, and must never claim to be as certain.
_GLINER_CONFIDENCE_FLOOR = 0.35
_GLINER_CONFIDENCE_CEILING = 0.85
_PARAGRAPH_INHERITED_CAP = 0.55

_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+")
_CLAUSE_SPLIT = re.compile(r",\s*(?:while|whereas)\b|;\s*", re.IGNORECASE)
_DAY_PATTERN = re.compile(r"\bday\s*(\d+)\b|\b(\d+)\s*(?:st|nd|rd|th)?\s*day\b", re.IGNORECASE)

_INDICATOR_LABELS = frozenset({"physicochemical indicator", "microbiological indicator"})
# GLiNER's own label choice for a SHORT, repeated indicator name (pH, MIC, DM)
# is inconsistent across occurrences in the same sentence — confirmed on a
# real compound sentence during testing, where a second "pH" mention was
# tagged "measurement value" instead of "physicochemical indicator". Spans
# under these labels are still checked against the indicator lexicon below,
# so a genuine indicator name isn't lost just because GLiNER mistyped it.
_INDICATOR_FALLBACK_LABELS = frozenset({"measurement value", "concentration or dose"})

# "yeast count", "coliform population", "TVC load" — one of the single most
# common indicator phrasings in cheese-preservation papers. Confirmed during
# testing that GLiNER tags just the organism name ("yeast") as a
# microorganism entity rather than the whole phrase as one indicator span,
# so the count word is detected separately and the two are fused below.
_COUNT_WORD = re.compile(r"^\s{0,3}(?:counts?|populations?|loads?)\b", re.IGNORECASE)


@dataclass
class GlinerEntity:
    label: str
    text: str
    start: int   # character offset within the full text span passed to GLiNER
    end: int
    score: float


def _is_noise(text: str) -> bool:
    t = text.strip().lower().strip(".,;:")
    return (not t) or t in GENERIC_NOISE_TERMS or len(t) < 2


def _confidence(score: float, reason: str) -> tuple[float, str]:
    """Map GLiNER's own 0-1 model score into an honest, compressed band —
    never below the floor (a hit above the extraction threshold is still a
    real signal) and never above the ceiling (never as certain as a
    deterministic table read)."""
    conf = _GLINER_CONFIDENCE_FLOOR + score * (_GLINER_CONFIDENCE_CEILING - _GLINER_CONFIDENCE_FLOOR)
    return round(conf, 2), reason


def _sentences_with_offsets(text: str) -> list[tuple[int, int, str]]:
    spans = []
    start = 0
    for m in _SENTENCE_SPLIT.finditer(text):
        end = m.start()
        if text[start:end].strip():
            spans.append((start, end, text[start:end]))
        start = m.end()
    if text[start:].strip():
        spans.append((start, len(text), text[start:]))
    return spans


def _clauses_with_offsets(sentence: str) -> list[tuple[int, int, str]]:
    """Split one sentence into clauses on contrast/list boundaries
    (", while", ", whereas", "; "). Real papers routinely describe two
    treatment arms in one sentence ("Control was 5.2, while the 1% chitosan
    sample reached 5.6") — without this, an indicator/value search that
    spans the whole sentence can pair the wrong arm's number with an
    indicator name, since the OTHER arm's number may simply be closer in
    character distance. Offsets returned are relative to `sentence` itself
    (the caller adds its own base offset)."""
    spans = []
    start = 0
    for m in _CLAUSE_SPLIT.finditer(sentence):
        end = m.start()
        if sentence[start:end].strip():
            spans.append((start, end, sentence[start:end]))
        start = m.end()
    if sentence[start:].strip():
        spans.append((start, len(sentence), sentence[start:]))
    return spans or [(0, len(sentence), sentence)]


def _parse_day(text: str) -> Optional[int]:
    m = _DAY_PATTERN.search(text)
    if not m:
        return None
    for g in m.groups():
        if g is not None:
            try:
                return int(g)
            except ValueError:
                continue
    return None


def _nearest_numeric_fact(facts: list[NumericMatch], start: int, end: int) -> Optional[NumericMatch]:
    """Nearest number to an entity span, biased to prefer a number AFTER the
    entity over one before it.

    Scientific prose overwhelmingly states "<indicator> of/was/reached
    <value>" (pH of 5.6, hardness was 4.2, MIC of 0.2 mg/mL) — the value
    follows the name. Pure character-distance matching got this wrong on a
    real compound sentence during testing: "...treated with 1% chitosan
    reached a pH of 5.6" paired "pH" with the ingredient's "1%" (behind it,
    across a clause boundary) instead of its own "5.6" (ahead of it),
    because "1%" happened to be a few characters closer. Preferring a
    forward match first, and only falling back to a backward one when
    nothing follows the entity at all, matches every real example seen
    during this engine's testing and avoids that class of mispairing.
    """
    if not facts:
        return None
    forward = [f for f in facts if f.span[0] >= end]
    if forward:
        return min(forward, key=lambda f: f.span[0] - end)
    return min(facts, key=lambda f: min(abs(f.span[0] - end), abs(start - f.span[1])))


def _microbial_count_entities(
    clause: str, clause_entities: list[GlinerEntity], clause_start: int,
) -> list[GlinerEntity]:
    """Synthesize an indicator entity ('yeast count') from a microorganism
    entity ('yeast') immediately followed by a count/population/load word —
    see the module-level _COUNT_WORD comment for why this exists."""
    synthetic = []
    for e in clause_entities:
        if e.label != "microorganism or bacteria species" or _is_noise(e.text):
            continue
        rel_end = e.end - clause_start
        tail = clause[rel_end:rel_end + 20]
        m = _COUNT_WORD.match(tail)
        if not m:
            continue
        synthetic.append(GlinerEntity(
            label="microbiological indicator",
            text=f"{e.text.strip()} {m.group(0).strip()}",
            start=e.start, end=e.end + m.end(),
            score=e.score,
        ))
    return synthetic


def process_text_span(
    text: str,
    entities: list[GlinerEntity],
    *,
    page_number: Optional[int],
    docling_item_ref: Optional[str],
    source_label: Optional[str],
) -> tuple[list[ExtractedExperiment], list[UnmappedFact]]:
    """Group one text span's GLiNER entities into experiments/observations
    where the sentence gives enough evidence, else UnmappedFact."""
    experiments: list[ExtractedExperiment] = []
    unmapped: list[UnmappedFact] = []

    cheese_alias, cheese_entries = cheese_lexicon()
    ingredient_alias, ingredient_entries = ingredient_lexicon()
    indicator_alias, indicator_entries = indicator_lexicon()

    # Paragraph-level fallback context — mirrors how Rules inherits a value
    # from a table caption when a row doesn't repeat it: a cheese/day named
    # once early in a paragraph often applies to indicator mentions later in
    # the same paragraph that don't restate it.
    paragraph_day = _parse_day(text)
    paragraph_cheese = None
    pm = best_match(text, cheese_alias, cheese_entries)
    if pm:
        paragraph_cheese = pm.canonical_name.replace("_", " ")

    for sent_start, sent_end, sentence in _sentences_with_offsets(text):
        sent_entities = [e for e in entities if sent_start <= e.start < sent_end]
        # Numeric facts are found on the sentence substring, so their spans
        # are sentence-relative — entity offsets must be converted to match.
        numeric_facts = find_numeric_facts(sentence)

        def rel(e: GlinerEntity) -> tuple[int, int]:
            return (e.start - sent_start, e.end - sent_start)

        # ── Experiment identity shared across this sentence's clauses ──────
        # (cheese/day are rarely restated per clause — "Control was 5.2,
        # while the 1% chitosan sample reached 5.6" names the cheese once).
        cheese_product = None
        cm = best_match(sentence, cheese_alias, cheese_entries)
        if cm:
            cheese_product = cm.canonical_name.replace("_", " ")
        else:
            for e in sent_entities:
                if e.label == "cheese product" and not _is_noise(e.text):
                    cheese_product = e.text.strip()
                    break
        cheese_from_paragraph = cheese_product is None and paragraph_cheese is not None
        if cheese_product is None:
            cheese_product = paragraph_cheese

        day = _parse_day(sentence)
        day_from_paragraph = day is None and paragraph_day is not None
        if day is None:
            day = paragraph_day

        inherited = cheese_from_paragraph or day_from_paragraph

        # ── Indicator/value pairing happens PER CLAUSE, not per sentence —
        # a sentence naming two treatment arms ("Control was X, while the
        # treated sample reached Y") must not let one arm's indicator pair
        # with the other arm's number just because it's textually closer.
        for clause_start_rel, clause_end_rel, clause in _clauses_with_offsets(sentence):
            clause_start = sent_start + clause_start_rel
            clause_end = sent_start + clause_end_rel
            clause_entities = [e for e in entities if clause_start <= e.start < clause_end]
            # p-values ("P < 0.05") report statistical SIGNIFICANCE of a
            # difference, never the measured value itself — confirmed as a
            # real bug during testing, where "titratable acidity" got paired
            # with the "0.05" from a nearby "P < 0.05" instead of the
            # sentence's actual value ("0.19% lactic acid"), and a sentence
            # that was PURELY about statistical significance ("P < 0.05 for
            # primary proteolysis") produced a fabricated "proteolysis =
            # 0.05" observation with no real measurement anywhere nearby.
            # Excluded from indicator pairing entirely, never just deprioritized.
            clause_numeric_facts = [f for f in find_numeric_facts(clause) if f.kind != "p_value"]

            def clause_rel(e: GlinerEntity) -> tuple[int, int]:
                return (e.start - clause_start, e.end - clause_start)

            is_control = is_control_arm(clause) or any(
                e.label == "control group" for e in clause_entities
            )
            # An explicit "control (sample/group)" mention wins outright over
            # an incidental ingredient-lexicon hit — a real bug found during
            # testing: "found in the Control sample (0.19% lactic acid)" is
            # reporting an ACIDITY VALUE IN UNITS OF lactic acid (a standard
            # dairy-science convention for titratable acidity), not a
            # "lactic acid treatment" applied to the sample. Explicit control
            # language is unambiguous; an ingredient name appearing anywhere
            # in the clause is not.
            treatment_name = "control" if is_control else None
            if treatment_name is None:
                im = best_match(clause, ingredient_alias, ingredient_entries)
                if im:
                    treatment_name = im.canonical_name.replace("_", " ")
                else:
                    for e in clause_entities:
                        if e.label == "food ingredient or additive" and not _is_noise(e.text):
                            treatment_name = e.text.strip()
                            break

            indicator_candidates = clause_entities + _microbial_count_entities(
                clause, clause_entities, clause_start,
            )
            for e in indicator_candidates:
                is_primary_indicator = e.label in _INDICATOR_LABELS
                is_fallback_indicator = e.label in _INDICATOR_FALLBACK_LABELS
                if _is_noise(e.text) or not (is_primary_indicator or is_fallback_indicator):
                    continue

                indicator_type = e.text.strip()
                im2 = best_match(indicator_type, indicator_alias, indicator_entries)
                if im2:
                    indicator_type = im2.canonical_name.replace("_", " ")
                elif is_fallback_indicator:
                    # A "measurement value"/"concentration or dose" span that
                    # doesn't match a known indicator name is very likely
                    # actually a value or a dose, not an indicator — only
                    # promote it here when the lexicon confirms it.
                    continue

                e_start_rel, e_end_rel = clause_rel(e)
                nearest_value = _nearest_numeric_fact(clause_numeric_facts, e_start_rel, e_end_rel)

                conf, reason = _confidence(
                    e.score,
                    f"GLiNER identified '{e.text}' as a {e.label} (model score {e.score:.2f}).",
                )
                if inherited:
                    conf = min(conf, _PARAGRAPH_INHERITED_CAP)
                    reason += " Cheese product and/or day inherited from the surrounding paragraph, not stated in this sentence."

                if cheese_product and treatment_name and day is not None and nearest_value:
                    prov = Provenance(
                        source_type="text", docling_item_ref=docling_item_ref,
                        page_number=page_number, source_label=source_label,
                        exact_text=clause.strip()[:400],
                        confidence=conf, confidence_reason=reason,
                    )
                    experiments.append(ExtractedExperiment(
                        cheese_product=cheese_product, treatment=treatment_name,
                        observations=[ExtractedObservation(
                            day=day, indicator_type=indicator_type,
                            indicator_unit=nearest_value.unit,
                            indicator_value=nearest_value.value,
                            provenance=[prov],
                        )],
                        provenance=[prov],
                    ))
                else:
                    unmapped.append(UnmappedFact(
                        predicate=indicator_type,
                        value_raw=nearest_value.raw_text if nearest_value else None,
                        value_normalized=nearest_value.value if nearest_value else None,
                        unit_raw=nearest_value.unit if nearest_value else None,
                        unit_normalized=nearest_value.unit if nearest_value else None,
                        subject=cheese_product or treatment_name,
                        category="microbiology" if e.label == "microbiological indicator" else "physicochemical",
                        raw_text=clause.strip()[:400],
                        confidence=conf * 0.9,
                        confidence_reason=reason + " Not enough surrounding context (cheese/treatment/day) to build a full record.",
                        provenance=Provenance(
                            source_type="text", docling_item_ref=docling_item_ref,
                            page_number=page_number, source_label=source_label,
                            exact_text=clause.strip()[:400],
                            confidence=conf, confidence_reason=reason,
                        ),
                    ))

        # ── Microorganism entities — always UnmappedFact. This is a genuine
        #    new capability (Rules has no microorganism NER at all), but
        #    linking one to a specific experiment from free text alone isn't
        #    reliable enough yet to claim as a canonical structural link. ───
        for e in sent_entities:
            if e.label != "microorganism or bacteria species" or _is_noise(e.text):
                continue
            conf, reason = _confidence(
                e.score, f"GLiNER identified '{e.text}' as a microorganism (model score {e.score:.2f}).",
            )
            unmapped.append(UnmappedFact(
                predicate="microorganism_detected",
                value_raw=e.text.strip(),
                subject=cheese_product,
                category="microbiology",
                raw_text=sentence.strip()[:400],
                confidence=conf,
                confidence_reason=reason,
                provenance=Provenance(
                    source_type="text", docling_item_ref=docling_item_ref,
                    page_number=page_number, source_label=source_label,
                    exact_text=sentence.strip()[:400],
                    confidence=conf, confidence_reason=reason,
                ),
            ))

        # ── Ingredient + nearby concentration -> unmapped composition fact
        #    (kept separate from observations: this is formulation info, not
        #    a measured outcome) ──────────────────────────────────────────
        for e in sent_entities:
            if e.label != "food ingredient or additive" or _is_noise(e.text):
                continue
            e_start_rel, e_end_rel = rel(e)
            conc = _nearest_numeric_fact(
                [f for f in numeric_facts if f.kind in ("percentage", "generic")],
                e_start_rel, e_end_rel,
            )
            if not conc:
                continue
            conf, reason = _confidence(
                e.score,
                f"GLiNER identified '{e.text}' as an ingredient near a concentration value "
                f"(model score {e.score:.2f}).",
            )
            unmapped.append(UnmappedFact(
                predicate=f"{e.text.strip()} concentration",
                value_raw=conc.raw_text, value_normalized=conc.value,
                unit_raw=conc.unit, unit_normalized=conc.unit,
                subject=cheese_product,
                category="composition",
                raw_text=sentence.strip()[:400],
                confidence=conf, confidence_reason=reason,
                provenance=Provenance(
                    source_type="text", docling_item_ref=docling_item_ref,
                    page_number=page_number, source_label=source_label,
                    exact_text=sentence.strip()[:400],
                    confidence=conf, confidence_reason=reason,
                ),
            ))

    return experiments, unmapped
