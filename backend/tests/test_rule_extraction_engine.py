"""
Unit tests for the rule-based extraction engine's building blocks — lexicon
matching, numeric+unit regexes, relation resolution, and unmapped-fact
generation. No database, no Docling, no LLM. Mirrors the scenarios in the
project's own spec (sentence extraction, units, relation resolution, unknown
facts).
"""
from app.extraction.rules.lexicon_loader import cheese_lexicon, ingredient_lexicon, best_match
from app.extraction.rules.regexes import find_numeric_facts, find_generic_numeric_facts
from app.extraction.rules.relations import (
    detect_application_method, is_control_arm, link_concentrations_to_ingredients,
)
from app.extraction.rules.tables import _parse_day_header
from app.extraction.rules.text_facts import extract_text_facts, find_unmapped_numeric_facts


SENTENCE = "Gouda cheese was coated with 0.5% thyme essential oil and stored at 4°C for 60 days."


# ── TEST 1 — sentence extraction ────────────────────────────────────────────

def test_sentence_extraction_finds_cheese():
    alias, entries = cheese_lexicon()
    match = best_match(SENTENCE, alias, entries)
    assert match is not None
    assert match.canonical_name == "gouda"


def test_sentence_extraction_finds_ingredient_and_concentration():
    links = link_concentrations_to_ingredients(SENTENCE)
    assert len(links) == 1
    assert links[0].ingredient_name == "thyme essential oil"
    assert links[0].concentration_value == 0.5
    assert links[0].concentration_unit == "%"


def test_sentence_extraction_finds_application_method():
    assert detect_application_method(SENTENCE) == "coating"


def test_sentence_extraction_finds_temperature_and_duration():
    facts = extract_text_facts(SENTENCE)
    assert facts.storage_temperature_c == 4.0
    assert facts.storage_duration_days == 60.0


# ── TEST 4 — units ───────────────────────────────────────────────────────────

def test_units_temperature_variants():
    for text in ["4 C", "4°C", "4 °C", "stored at 4 degrees C"]:
        facts = find_numeric_facts(text)
        temps = [f for f in facts if f.kind == "temperature"]
        assert temps, f"no temperature match in {text!r}"
        assert temps[0].value == 4.0


def test_units_percentage_variants():
    for text in ["0.5%", "0.5 %"]:
        facts = find_numeric_facts(text)
        pcts = [f for f in facts if f.kind == "percentage"]
        assert pcts and pcts[0].value == 0.5


def test_units_days():
    for text in ["15 d", "15 days"]:
        facts = find_numeric_facts(text)
        days = [f for f in facts if f.kind == "days"]
        assert days and days[0].value == 15.0


def test_units_microbial_log_cfu():
    facts = find_numeric_facts("4.3 log CFU/g")
    microbial = [f for f in facts if f.kind == "microbial"]
    assert microbial and microbial[0].value == 4.3
    assert microbial[0].unit == "log CFU/g"


def test_units_ph_and_water_activity():
    facts = find_numeric_facts("pH 5.2 and aw 0.94")
    ph = [f for f in facts if f.kind == "ph"]
    aw = [f for f in facts if f.kind == "water_activity"]
    assert ph and ph[0].value == 5.2
    assert aw and aw[0].value == 0.94


# ── TEST 5 — relation resolution ────────────────────────────────────────────

def test_relation_links_concentration_to_correct_ingredient():
    text = "Samples were treated with 1% chitosan and 0.5% nisin."
    links = link_concentrations_to_ingredients(text)
    by_name = {l.ingredient_name: l.concentration_value for l in links}
    assert by_name.get("chitosan") == 1.0
    assert by_name.get("nisin") == 0.5


def test_control_arm_detection():
    assert is_control_arm("Control")
    assert is_control_arm("control sample")
    assert not is_control_arm("EO 0.5%")


# ── TEST 7 — unknown fact is preserved, not discarded ───────────────────────

def test_unknown_fact_is_preserved_as_unmapped():
    text = "Springiness was 0.72."
    generic = find_generic_numeric_facts(text)
    assert any(g.value == 0.72 and "springiness" in (g.predicate or "") for g in generic)

    unmapped = find_unmapped_numeric_facts(text)
    assert any(u.value == 0.72 for u in unmapped)


# ── Regression: table day-header parsing, both digit orders ────────────────
# A real cheese-preservation paper's table used "7 days"/"14 days" (number
# before the word) headers — the original regex only matched "Day 7"/"D7"
# (word before the number) and silently produced zero observations for that
# table. Found via live testing, not a synthetic case.

def test_day_header_word_then_number():
    assert _parse_day_header("Day 15") == 15
    assert _parse_day_header("D15") == 15


def test_day_header_number_then_word():
    assert _parse_day_header("7 days") == 7
    assert _parse_day_header("14 days") == 14


# ── Regression: instrumentation noise, found live on a real paper ──────────
# The generic "noun phrase + number" fallback previously scanned Methods-
# section SEM/GC-MS calibration sentences unconditionally and produced real
# garbage: "examined at a working distance" = 5.86, "mm and an accelerating
# voltage" = 30.0 kV. Neither is cheese science — both are microscope/
# instrument settings that happened to sit near a number.

def test_instrument_calibration_sentences_produce_no_facts():
    sentences = [
        "Images were examined at a working distance of 5.86 mm and an accelerating voltage of 30.0 kV.",
        "Samples were analyzed in freeze-dried mode at a water vapor pressure of 7.25 Torr.",
        "The GC-MS was operated with a scan rate of 2.5 and a column temperature of 250.",
    ]
    for s in sentences:
        assert find_generic_numeric_facts(s) == [], f"expected no facts in: {s!r}"


def test_real_cheese_facts_still_captured_alongside_denylist():
    facts = find_generic_numeric_facts("Springiness was 0.72 and cohesiveness was 0.61.")
    by_predicate = {f.predicate: f.value for f in facts}
    assert by_predicate.get("springiness") == 0.72
    assert by_predicate.get("cohesiveness") == 0.61


def test_unit_capture_does_not_swallow_the_next_word():
    # Previously "0.72 and cohesiveness" mis-captured "and" as the unit.
    facts = find_generic_numeric_facts("Springiness was 0.72 and cohesiveness was 0.61.")
    assert all(f.unit != "and" for f in facts)


def test_percentage_unit_still_captured():
    facts = find_generic_numeric_facts("The moisture content was 42.3% and the salt content was 1.6%.")
    by_predicate = {f.predicate: (f.value, f.unit) for f in facts}
    assert by_predicate.get("the moisture content") == (42.3, "%")


def test_day_header_zero_time_and_bare_number():
    assert _parse_day_header("Zero time") == 0
    assert _parse_day_header("0") == 0


def test_known_predicate_not_double_counted_as_unmapped():
    # "stored at 4°C" already has a recognized predicate (storage_temperature) —
    # it must not also show up as a generic unmapped fact.
    text = "Samples were stored at 4°C."
    unmapped = find_unmapped_numeric_facts(text)
    assert not any(abs(u.value - 4.0) < 1e-6 for u in unmapped)
