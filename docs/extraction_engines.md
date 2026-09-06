# Extraction engines

The platform extracts structured data from cheese-preservation research papers using
three independent engines that share one Docling-parsed evidence base, one
intermediate representation, and one database writer:

| Engine | Status | Calls an LLM? |
|---|---|---|
| **LLM** | Existing, unchanged, now behind the shared interface | Yes (Groq, Gemini fallback) |
| **Rules** | New, fully implemented (P0) | No — zero LLM/vision calls |
| **ML** | Interfaces named, not implemented (P1) | No (planned: embeddings + classical ML) |

All three write into the same `Ext*` staging schema, tagged with an `engine` column,
so results from different engines coexist for the same paper instead of overwriting
each other. Canonical promotion (`Study`/`Experiment`/`TreatmentArm`/`Observation`) stays
a single, deliberate dataset — promoting a second engine's result for an already-filled
slot overwrites it (never for an approved value), it does not create parallel
databases.

## Architecture

```
                    Docling (unchanged)
                            │
                 ExtractionAsset + AssetContextLink
                            │
        ┌───────────────────┼────────────────────┐
        ▼                   ▼                    ▼
  LLMExtractionEngine  RuleExtractionEngine   MLExtractionEngine (P1)
        │                   │                    │
        └───────────────────┼────────────────────┘
                            ▼
                 PaperExtractionResult (shared IR)
                            ▼
              persist_paper_extraction()  ← ONE shared writer
                            ▼
      promote_ext_paper_to_canonical(engine=...)
                            ▼
                 Study/Experiment/TreatmentArm/Observation
```

Code layout (`backend/app/extraction/`):

```
common/
  models.py        Shared dataclasses: PaperExtractionResult, ExtractedExperiment,
                    ExtractedObservation, ExtractedIngredientLink, UnmappedFact,
                    QualitativeObservation, Provenance
  base.py          ExtractionEngine ABC — only extract_document() is required
  adapters.py      llm_dict_to_ir() — converts food_extractor.py's dict output to the IR
  persist.py       persist_paper_extraction() — the one IR→database writer
  asset_selection.py  Which ExtractionAsset rows are "in scope" for extraction

rules/
  lexicon_loader.py   Loads lexicons/*.yml, exact + rapidfuzz fuzzy matching
  regexes.py          Number+unit extraction with nearby-predicate detection
  context.py          ExperimentContext resolution (caption → paragraph inheritance)
  relations.py        Concentration→ingredient linking, application method, control detection
  tables.py           Native-table → ExtractedObservation/UnmappedFact conversion
  text_facts.py       Sentence-level facts + qualitative findings + unmapped facts
  confidence.py       Fixed 0.60–1.00 confidence tiers with human-readable reasons
  engine.py           RuleExtractionEngine — orchestrates the above

llm/
  wrapper.py          LLMExtractionEngine — thin wrapper around the existing
                      food_extractor.extract_food_data(), used by compare mode

lexicons/
  cheese_products.yml, ingredients.yml, indicators.yml
```

## The rule-based engine

Zero LLM or vision calls, ever — verified by a test that spies on
`food_extractor._groq_client`/`openai.OpenAI.__init__` and fails if either is invoked
(`tests/test_rule_engine_e2e.py::test_rule_engine_makes_zero_llm_calls`).

**Pipeline**: for each in-scope native-table `ExtractionAsset`, read its CSV, detect
orientation (rows = treatment groups × columns = time points, or rows = treatment
groups × columns = different indicators), match cheese/ingredient/indicator names
against the YAML lexicons (exact substring, then rapidfuzz fuzzy match), inherit
missing context (cheese product, storage temperature/duration) from the table's
caption or linked paragraph text via the *existing* `AssetContextLink` rows Docling's
context linker already built. Every value that doesn't match a known indicator becomes
an `UnmappedFact` instead of being dropped.

**Known P0 limitation**: table-row semantics are inferred from two common shapes
(rows=treatments, or rows=indicators). A table whose rows are themselves time points
(e.g. one row per day, several sensory-score columns) is still fully captured — every
value is either a structured `Observation` or an `UnmappedFact`, nothing is silently
lost — but each row is currently treated as its own tiny "experiment" rather than being
recognized as one experiment sampled over time. Proper table-role classification
(composition / microbial / physicochemical / sensory / formulation) is P1 work (spec
section 9's classification step).

### Confidence tiers

| Score | Meaning |
|---|---|
| 1.00 | Table value with an explicit header and unit |
| 0.95 | Table value with an explicit header, unit inferred; or an explicit sentence pattern |
| 0.85 | Field inherited from the caption |
| 0.75 | Field inherited from the nearest paragraph |
| 0.60 | Fuzzy lexicon match |

Every score carries a `confidence_reason` string — never a bare number.

### Adding a lexicon entry

Edit the relevant YAML file under `backend/app/extraction/lexicons/`. Each top-level key
is the canonical name; `aliases` are the surface forms matched (case-insensitive, exact
substring first, then fuzzy). Example — adding a new cheese to `cheese_products.yml`:

```yaml
manchego:
  aliases: ["manchego", "manchego cheese"]
```

No code change or restart-sensitive cache invalidation beyond a normal process restart
is needed (`lexicon_loader.py` caches per-process via `functools.lru_cache`).

### Adding a new indicator

Edit `indicators.yml`. `canonical_type` should match one of
`canonical_promoter.py`'s `_infer_measurement_type()` categories
(`microbial_count|ph|water_activity|moisture|TBARS|TVB_N|texture|sensory|weight_loss|other`)
so rule-extracted indicators land in the same buckets the LLM pipeline uses.
`common_units` lists the unit(s) to attach when this indicator is matched without an
explicit unit in the table.

### Adding a new relation rule

Add a pattern to `rules/relations.py`'s `_APPLICATION_PATTERNS` (application method
detection) or extend `link_concentrations_to_ingredients()`'s nearest-neighbor logic for
a new kind of pairing. For a new context-inheritance field, extend `ExperimentContext`
in `rules/context.py` and the matching block in `resolve_context_for_asset()`.

## Chart digitization without an LLM

**Not implemented in this pass (P2).** The existing chart pipeline
(`app/services/chart_converter.py`) already calls a vision LLM
(`settings.GROQ_VISION_MODEL`) on each figure PNG — a non-LLM alternative would need a
function with the identical `(figures, cache_dir) -> Generator[ChartResult]` contract
(OpenCV axis/gridline detection, RapidOCR for tick labels — already installed
transitively via `docling`, not yet wired up standalone) to be a drop-in replacement.
Interface named at `app/extraction/rules/charts.py` for a future pass.

## The ML engine (P1 — not implemented)

Honest scope, given no labeled training corpus exists for this domain: **not** a
from-scratch fine-tuned transformer NER. Planned architecture reuses the rule engine's
span detection as candidate generation, then adds two genuinely non-generative ML
layers that don't require pre-existing labeled data:

1. **Sentence-embedding semantic classifier** (`sentence-transformers`,
   e.g. `all-MiniLM-L6-v2`, CPU-only) mapping unknown/unmapped phrases to categories via
   cosine similarity against hand-written prototype phrases — e.g. "oxygen-impermeable
   polyamide pouch" → `PACKAGING`.
2. **Weakly-supervised relation classifier** (`scikit-learn` `LogisticRegression`):
   rule-confirmed links become positive silver-label examples, random non-adjacent
   entity pairs become negatives, trained at extraction time.

Both `torch`/`transformers`/`scikit-learn` are already installed transitively via
`docling`; only `sentence-transformers` itself would be a new dependency. The
`ExtractionEngine` base class's fail-soft contract (see `common/base.py`'s docstring)
exists specifically so this engine can degrade to rules-only output if a model fails to
load, rather than failing the whole extraction.

## Training data / human-review feedback (P1 — not implemented)

`AuditEvent` (`app/db/models.py`) already records `before_json`/`after_json` on every
observation edit/approve/reject, but `diff_json` is currently always written as an empty
`{}` — a real field-level diff would need to be added to
`app/api/routes/observations.py`'s `_audit()` helper before this can feed a training-data
export (`training_data.jsonl`) cleanly.

## Comparison and benchmarking (P1 — not implemented)

`GET /projects/{pid}/papers/{paper_id}/extractions` (implemented) returns each engine's
experiment/measurement/unmapped-fact counts and last job status — the data a comparison
view needs. The comparison UI itself, a consensus view (agreement/conflict, never
auto-merged into canonical), and the benchmarking framework (entity/field/relation
precision-recall-F1, coverage, complete-row accuracy) are named in the architecture but
not built. Comparison is designed to read from the per-engine `Ext*` staging tables
directly, not from canonical — canonical promotion stays a deliberate, engine-scoped
action a human triggers, never an automatic three-way merge.

## API

| Method | Path | Notes |
|---|---|---|
| `POST` | `/projects/{pid}/papers/{paper_id}/extract?engine=llm\|rules` | `llm` is a thin alias to the existing `/send-to-llm` flow. `engine=ml`/`compare` return a clear "not available yet" error, not a silent stub. |
| `GET` | `/projects/{pid}/papers/{paper_id}/extractions` | Per-engine experiment/measurement/unmapped-fact counts + last job status |
| `GET` | `/projects/{pid}/papers/{paper_id}/unmapped-facts` | Preserved-but-unmapped facts, optionally filtered by `engine` |

## Configuration

No new settings were added in this pass — the rule engine has no API keys or optional
dependencies to gate behind a feature flag (it only needs `rapidfuzz`, `pyyaml`, and
`pandas`, all installed). P1's ML engine will need `ML_EXTRACTION_ENABLED`,
`ML_MODEL_PATH`, and `ML_DEVICE` settings (following the plain-typed-attribute pattern in
`app/core/config.py`) once it exists.

## Limitations (current)

- Table-role classification is heuristic (two shapes only), not learned — see the P0
  limitation note above.
- The ML engine, non-LLM chart digitization, comparison UI, consensus view, and
  benchmarking framework are architected but not implemented.
- Rule-engine text-derived experiments (as opposed to table-derived) are limited to
  context/backfill use — full free-text experiment-signature construction from
  multi-condition sentences (spec section 11's "Gouda and Edam... 0%, 0.5%, and 1% EO...
  4°C and 10°C" example) is not yet implemented; tables remain the primary source, per
  the project's own P0 priority order.
- `ProvenanceRecord` rows accumulate on repeat promotion (a pre-existing behavior, not
  introduced by this work) — not deduplicated across promotion calls.
