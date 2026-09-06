"""
Multi-engine scientific-paper extraction.

Three independent extraction approaches over the same Docling-parsed evidence
(ExtractionAsset / AssetContextLink):

  llm    — app/extraction/llm/wrapper.py    — wraps the existing app/services/food_extractor.py
  rules  — app/extraction/rules/engine.py   — deterministic lexicon/regex/table rules, zero LLM calls
  ml     — (not yet implemented)            — non-generative ML, see docs/extraction_engines.md

All three produce the same intermediate representation (app/extraction/common/models.py)
and are written to the database by the same function
(app/extraction/common/persist.py:persist_paper_extraction), scoped by an `engine` column
so results from different engines coexist per paper instead of overwriting each other.
See docs/extraction_engines.md for the full architecture.
"""
