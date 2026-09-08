"""
Unit tests for the GLiNER post-processing module — pure functions, no real
model needed (GlinerEntity lists are constructed directly), so these run
fast and deterministically in CI. The real model's actual output quality
was verified manually against real papers already in this project during
development (see docs/extraction_engines.md) — these tests lock in the
deterministic grouping/normalization logic around it, including three real
bugs found during that manual testing:
  1. A compound sentence describing two treatment arms in one sentence
     ("Control was 5.2, while the treated sample reached 5.6") mis-paired
     an indicator with the OTHER arm's number since it was textually
     closer — fixed with clause-level splitting.
  2. A p-value ("P < 0.05") got used as if it were the actual measured
     value — fixed by excluding p_value-kind numeric facts outright.
  3. "yeast count of 5.2 log CFU/g" — GLiNER tags "yeast" as a
     microorganism, not the compound indicator phrase — fixed by fusing a
     microorganism entity with an immediately-following count/population word.
"""
from app.extraction.gliner.postprocess import GlinerEntity, process_text_span


def _entity(label, text, start, end, score=0.6):
    return GlinerEntity(label=label, text=text, start=start, end=end, score=score)


def test_builds_a_full_experiment_when_everything_is_co_located():
    text = "By day 15, the Gouda cheese sample treated with 1% chitosan reached a pH of 5.6."
    ph_start = text.index("pH")
    entities = [
        _entity("sampling day", "day 15", text.index("day 15"), text.index("day 15") + 6),
        _entity("physicochemical indicator", "pH", ph_start, ph_start + 2, score=0.55),
    ]
    exps, unmapped = process_text_span(
        text, entities, page_number=3, docling_item_ref="#/texts/0", source_label="Results",
    )
    assert len(exps) == 1
    exp = exps[0]
    assert exp.cheese_product == "gouda"
    assert exp.treatment == "chitosan"
    assert len(exp.observations) == 1
    obs = exp.observations[0]
    assert obs.day == 15
    assert obs.indicator_value == 5.6
    assert obs.provenance[0].confidence < 0.95  # never as certain as a deterministic table read


def test_compound_sentence_does_not_cross_pair_clauses():
    """Regression test for the exact bug found during manual testing: two
    treatment arms named in one sentence must not let one arm's indicator
    pair with the OTHER arm's number just because it's textually closer.
    Before the clause-splitting fix, the first 'pH' below paired with the
    chitosan clause's '1%' (closer in character distance, wrong arm and
    wrong quantity entirely) instead of finding no value in its own clause."""
    text = (
        "By day 15, the Gouda cheese control sample had a pH of 5.2, "
        "while the sample treated with 1% chitosan reached a pH of 5.6."
    )
    first_ph = text.index("pH")
    second_ph = text.index("pH", first_ph + 1)
    entities = [
        _entity("sampling day", "day 15", text.index("day 15"), text.index("day 15") + 6),
        _entity("cheese product", "Gouda cheese", text.index("Gouda cheese"), text.index("Gouda cheese") + 12, score=0.9),
        _entity("control group", "control sample", text.index("control sample"), text.index("control sample") + 14),
        _entity("physicochemical indicator", "pH", first_ph, first_ph + 2, score=0.55),
        _entity("physicochemical indicator", "pH", second_ph, second_ph + 2, score=0.55),
    ]
    exps, unmapped = process_text_span(
        text, entities, page_number=3, docling_item_ref="#/texts/0", source_label="Results",
    )
    by_treatment = {e.treatment: e for e in exps}
    assert "control" in by_treatment
    assert by_treatment["control"].observations[0].indicator_value == 5.2
    assert "chitosan" in by_treatment
    assert by_treatment["chitosan"].observations[0].indicator_value == 5.6


def test_p_value_is_never_used_as_a_measurement():
    """Regression test: 'P < 0.05' reports statistical significance, never
    the measured value — a real bug found on an actual paper where
    'primary proteolysis (P < 0.05)' produced a fabricated
    proteolysis=0.05 observation with no real measurement anywhere nearby.
    Mozzarella is named so the ONLY reason this must stay unmapped is the
    missing value, not missing cheese/treatment context — otherwise this
    test would pass even without the p-value fix."""
    text = (
        "Mozzarella cheese samples were monitored on day 13. "
        "Storage time significantly influenced primary proteolysis "
        "(P < 0.05 in secondary proteolysis) in the control sample."
    )
    idx = text.index("primary proteolysis")
    entities = [
        _entity("physicochemical indicator", "primary proteolysis", idx, idx + len("primary proteolysis"), score=0.5),
    ]
    exps, unmapped = process_text_span(
        text, entities, page_number=5, docling_item_ref=None, source_label=None,
    )
    assert exps == []
    assert len(unmapped) == 1
    assert unmapped[0].value_raw is None
    assert unmapped[0].value_normalized is None


def test_control_language_wins_over_an_incidental_ingredient_match():
    """Regression test: 'found in the Control sample (0.19% lactic acid)'
    reports an acidity value IN UNITS OF lactic acid (a standard dairy
    convention), not a 'lactic acid treatment' — real bug found on an
    actual paper (mozzarella cheese, day 13). Explicit control language
    must win the treatment-name resolution over an incidental
    ingredient-lexicon hit. Mozzarella is named earlier in the same text
    span (paragraph-level context), mirroring the real paper's structure —
    it isn't restated in the sentence with the actual value."""
    text2 = (
        "Mozzarella cheese samples were monitored over the storage period. "
        "Titratable acidity values were found in the Control sample (0.19% lactic acid) on day 13."
    )
    ta_idx = text2.index("Titratable acidity")
    ctrl_idx = text2.index("Control sample")
    entities = [
        _entity("physicochemical indicator", "Titratable acidity", ta_idx, ta_idx + len("Titratable acidity"), score=0.5),
        _entity("control group", "Control sample", ctrl_idx, ctrl_idx + len("Control sample")),
    ]
    exps, unmapped = process_text_span(
        text2, entities, page_number=6, docling_item_ref=None, source_label=None,
    )
    assert len(exps) == 1
    assert exps[0].treatment == "control"
    assert exps[0].observations[0].indicator_value == 0.19


def test_microbial_count_fusion():
    """'yeast count of 5.2 log CFU/g' — GLiNER tags just 'yeast' as a
    microorganism; the count word must be fused into one indicator span.
    Gouda is named earlier in the same text span (paragraph-level context),
    matching how this reads on a real paper — the cheese name isn't
    restated in the exact sentence that gives the count value."""
    text = (
        "Gouda cheese samples were stored under refrigeration. "
        "The control sample showed a yeast count of 5.2 log CFU/g on day 15."
    )
    yeast_idx = text.index("yeast")
    day_idx = text.index("day 15")
    ctrl_idx = text.index("control sample")
    entities = [
        _entity("microorganism or bacteria species", "yeast", yeast_idx, yeast_idx + 5, score=0.5),
        _entity("sampling day", "day 15", day_idx, day_idx + 6),
        _entity("control group", "control sample", ctrl_idx, ctrl_idx + 14),
    ]
    exps, unmapped = process_text_span(
        text, entities, page_number=2, docling_item_ref=None, source_label=None,
    )
    assert len(exps) == 1
    obs = exps[0].observations[0]
    assert "yeast" in obs.indicator_type
    assert obs.indicator_value == 5.2
    assert obs.indicator_unit == "log CFU/g"
    assert obs.day == 15


def test_generic_noise_entities_are_filtered():
    """Bare 'cheese'/'cheeses' carry no product-specific information — a
    real, common false-positive on real papers (a zero-shot label matches
    the literal word) that must never become a fake cheese_product name."""
    text = "The cheese was analyzed for quality."
    idx = text.index("cheese")
    entities = [_entity("cheese product", "cheese", idx, idx + 6, score=0.4)]
    exps, unmapped = process_text_span(
        text, entities, page_number=1, docling_item_ref=None, source_label=None,
    )
    assert exps == []
    assert unmapped == []


def test_microorganism_without_context_becomes_an_honest_unmapped_fact():
    text = "Listeria monocytogenes was not detected in any sample."
    idx = text.index("Listeria monocytogenes")
    entities = [_entity("microorganism or bacteria species", "Listeria monocytogenes", idx, idx + len("Listeria monocytogenes"), score=0.9)]
    exps, unmapped = process_text_span(
        text, entities, page_number=4, docling_item_ref="#/texts/2", source_label="Results",
    )
    assert exps == []
    assert len(unmapped) == 1
    fact = unmapped[0]
    assert fact.predicate == "microorganism_detected"
    assert fact.value_raw == "Listeria monocytogenes"
    assert fact.category == "microbiology"
    assert fact.provenance is not None
    assert fact.provenance.page_number == 4
