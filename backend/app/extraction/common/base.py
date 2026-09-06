"""
Common interface every extraction engine implements.

Only `extract_document()` is truly abstract — it's the one thing every engine can
do, whether or not it has separable internal stages. The six granular methods
below are concrete "extension points" (default to NotImplementedError) that a
subclass with genuinely discrete stages MAY call from its own extract_document():
RuleExtractionEngine does, because lexicon matching / table parsing / relation
resolution really are separate steps. LLMExtractionEngine doesn't — a single LLM
call isn't meaningfully decomposable into these stages after the fact, so leaving
them unused there is honest, not lazy.

Any engine with an optional sub-component (e.g. a future MLExtractionEngine's
embedding model) MUST fail soft: log a warning and continue with whatever it can
still produce, never raise and abort the whole extraction because one optional
piece was unavailable.
"""
from __future__ import annotations

from abc import ABC, abstractmethod

from sqlalchemy.orm import Session

from app.extraction.common.models import PaperExtractionResult


class ExtractionEngine(ABC):
    name: str = "base"
    version: str = "0.1.0"

    @abstractmethod
    def extract_document(self, paper_id: int, project_id: int, db: Session) -> PaperExtractionResult:
        """Run this engine end-to-end on one paper's already-parsed Docling evidence
        (ExtractionAsset/AssetContextLink rows) and return the shared IR. Must not
        mutate the database — persistence is a separate, shared step
        (see app/extraction/common/persist.py)."""
        raise NotImplementedError

    def extract_metadata(self, *args, **kwargs):
        """Paper-level metadata: title, authors, journal, year, DOI, abstract, keywords."""
        raise NotImplementedError

    def extract_experiments(self, *args, **kwargs):
        """Distinct experimental conditions (cheese/treatment/concentration/storage combos)."""
        raise NotImplementedError

    def extract_entities(self, *args, **kwargs):
        """Named entities: cheese, ingredient, microorganism, indicator, packaging, process."""
        raise NotImplementedError

    def extract_relations(self, *args, **kwargs):
        """Deterministic or learned links between entities (concentration→ingredient, etc.)."""
        raise NotImplementedError

    def extract_observations(self, *args, **kwargs):
        """Numeric measurements: indicator + value + unit + time, linked to an experiment."""
        raise NotImplementedError

    def extract_generic_facts(self, *args, **kwargs):
        """Anything numeric/qualitative that doesn't fit the above — becomes an UnmappedFact."""
        raise NotImplementedError
