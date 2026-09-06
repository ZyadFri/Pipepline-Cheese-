"""
Native-table → ExtractedObservation conversion — the highest-priority source per
the project's own spec (§9: "Tables are one of the highest-priority sources").

Handles the two common table shapes in cheese-preservation papers:
  (a) rows = treatment groups, columns = time points, ONE indicator identified
      from the caption/context (spec §9's own worked example: Control/EO 0.5%
      rows × Day 0/15/30 columns, caption "Yeast counts in Gouda cheese...").
  (b) rows = treatment groups, columns = different indicators (headers matched
      against the indicator lexicon, e.g. "pH", "TVC", "Moisture (%)"), at a
      single implicit time point (day 0 unless the caption/context says otherwise).

Context inheritance (spec §10): a row never has to repeat the cheese product,
storage temperature, etc. if the caption or surrounding text already said it —
resolve_context_for_asset() supplies whatever the table itself doesn't.
"""
from __future__ import annotations

import re

import pandas as pd
from sqlalchemy.orm import Session

from app.db.models import ExtractionAsset
from app.extraction.common.models import (
    ExtractedExperiment, ExtractedIngredientLink, ExtractedObservation, Provenance, UnmappedFact,
)
from app.extraction.rules import confidence
from app.extraction.rules.context import resolve_context_for_asset
from app.extraction.rules.lexicon_loader import indicator_lexicon, best_match
from app.extraction.rules.relations import is_control_arm, link_concentrations_to_ingredients

# Two digit orders both appear in real papers: "Day 15"/"D15" (word-then-number)
# and "15 days"/"15 d" (number-then-word) — a header missing either pattern
# silently fails to parse as a time point, which is exactly what happened on a
# real paper whose columns read "7 days", "14 days" (number-first only).
_DAY_HEADER_WORD_FIRST = re.compile(r"\bday\s*(\d+)|\bd\s*(\d+)\b|\bt\s*(\d+)\b", re.IGNORECASE)
_DAY_HEADER_NUMBER_FIRST = re.compile(r"(\d+)\s*(?:days?|d)\b", re.IGNORECASE)
_ZERO_TIME = re.compile(r"\bzero\s*time\b|\binitial\b|\bday\s*0\b|\bbaseline\b", re.IGNORECASE)


def _parse_day_header(header: str) -> int | None:
    text = str(header)
    if _ZERO_TIME.search(text):
        return 0
    m = _DAY_HEADER_WORD_FIRST.search(text)
    if not m:
        m = _DAY_HEADER_NUMBER_FIRST.search(text)
    if not m:
        # A bare number column header ("0", "15", "30") is common too.
        try:
            return int(float(text.strip()))
        except ValueError:
            return None
    for g in m.groups():
        if g is not None:
            return int(g)
    return None


def _row_experiment_identity(row_label: str) -> tuple[str, list, str | None]:
    """From a row label like 'EO 0.5%' or 'Control', derive treatment text,
    concentration links, and whether it's a control arm."""
    links = link_concentrations_to_ingredients(row_label)
    is_control = is_control_arm(row_label) or not links
    return row_label.strip(), links, ("control" if is_control else None)


def convert_table_asset(asset: ExtractionAsset, db: Session) -> tuple[list[ExtractedExperiment], list[UnmappedFact]]:
    """Convert one native-table ExtractionAsset into experiments/observations.
    Returns ([], []) if the CSV is missing, empty, or too small to interpret —
    never raises, never invents a value."""
    if not asset.csv_path:
        return [], []
    try:
        df = pd.read_csv(asset.csv_path)
    except Exception:
        return [], []
    if df.shape[0] < 1 or df.shape[1] < 2:
        return [], []

    ctx = resolve_context_for_asset(asset, db)
    ind_alias, ind_entries = indicator_lexicon()

    row_label_col = df.columns[0]
    value_cols = list(df.columns[1:])

    # Decide orientation: do the non-first column headers look like time points?
    day_headers = {col: _parse_day_header(col) for col in value_cols}
    is_time_series = sum(1 for v in day_headers.values() if v is not None) >= max(1, len(value_cols) - 1)

    caption_indicator = None
    if asset.caption:
        caption_indicator = best_match(asset.caption, ind_alias, ind_entries)

    experiments: list[ExtractedExperiment] = []
    unmapped: list[UnmappedFact] = []
    table_label = asset.caption or f"Table (page {asset.page_number})"
    base_prov_kwargs = dict(
        source_type="table", docling_item_ref=asset.docling_item_ref,
        page_number=asset.page_number, source_label=table_label,
    )

    for _, row in df.iterrows():
        row_label = str(row[row_label_col])
        treatment, conc_links, control_flag = _row_experiment_identity(row_label)

        ingredients = [
            ExtractedIngredientLink(
                ingredient_name=link.ingredient_name,
                concentration=link.concentration_value,
                concentration_unit=link.concentration_unit,
                provenance=[Provenance(
                    **base_prov_kwargs, exact_text=row_label, table_row_header=row_label,
                    confidence=confidence.EXPLICIT_SENTENCE,
                    confidence_reason="Concentration parsed from the table's row label.",
                )],
            )
            for link in conc_links
        ]

        cheese_product = ctx.cheese_product or "unspecified"
        exp_provenance = [Provenance(
            **base_prov_kwargs, exact_text=row_label, table_row_header=row_label,
            confidence=confidence.CAPTION_INHERITED if ctx.cheese_product else confidence.FUZZY_RELATIONSHIP,
            confidence_reason=(
                f"Cheese product inherited from the table caption ('{ctx.source_text[:80]}')."
                if ctx.cheese_product else
                "No cheese product identified in the caption or surrounding text for this table."
            ),
        )]

        observations = []
        if is_time_series:
            indicator_type = caption_indicator.canonical_name.replace("_", " ") if caption_indicator else None
            indicator_unit = ""
            if caption_indicator:
                units = caption_indicator.extra.get("common_units") or [""]
                indicator_unit = units[0]
            if indicator_type is None:
                # No recognizable indicator in the caption — keep the raw values as
                # unmapped facts rather than silently dropping the whole table.
                for col in value_cols:
                    val = row[col]
                    if pd.isna(val):
                        continue
                    try:
                        fval = float(val)
                    except (ValueError, TypeError):
                        continue
                    unmapped.append(UnmappedFact(
                        predicate=str(col), value_raw=str(val), value_normalized=fval,
                        subject=f"{cheese_product} / {row_label}", category="unknown",
                        raw_text=f"{table_label}: {row_label} / {col} = {val}",
                        confidence=confidence.PARAGRAPH_INHERITED,
                        confidence_reason="Table value with no indicator recognized from the caption.",
                        provenance=Provenance(**base_prov_kwargs, exact_text=str(val),
                                               table_row_header=row_label, table_col_header=str(col),
                                               confidence=confidence.PARAGRAPH_INHERITED),
                    ))
                continue
            for col in value_cols:
                day = day_headers.get(col)
                val = row[col]
                if day is None or pd.isna(val):
                    continue
                try:
                    fval = float(val)
                except (ValueError, TypeError):
                    continue
                score, reason = confidence.table_value_confidence(has_header=True, has_unit=bool(indicator_unit))
                observations.append(ExtractedObservation(
                    day=day, indicator_type=indicator_type, indicator_unit=indicator_unit,
                    indicator_value=fval,
                    provenance=[Provenance(
                        **base_prov_kwargs, exact_text=str(val), table_row_header=row_label,
                        table_col_header=str(col), confidence=score, confidence_reason=reason,
                    )],
                ))
        else:
            # Columns are different indicators at one implicit time point (day 0
            # unless context said otherwise).
            day = int(ctx.storage_duration_days) if ctx.storage_duration_days is not None else 0
            for col in value_cols:
                val = row[col]
                if pd.isna(val):
                    continue
                try:
                    fval = float(val)
                except (ValueError, TypeError):
                    continue
                match = best_match(str(col), ind_alias, ind_entries)
                if match:
                    unit = (match.extra.get("common_units") or [""])[0]
                    score, reason = confidence.table_value_confidence(has_header=True, has_unit=bool(unit))
                    observations.append(ExtractedObservation(
                        day=day, indicator_type=match.canonical_name.replace("_", " "),
                        indicator_unit=unit, indicator_value=fval,
                        provenance=[Provenance(
                            **base_prov_kwargs, exact_text=str(val), table_row_header=row_label,
                            table_col_header=str(col), confidence=score, confidence_reason=reason,
                        )],
                    ))
                else:
                    unmapped.append(UnmappedFact(
                        predicate=str(col), value_raw=str(val), value_normalized=fval,
                        subject=f"{cheese_product} / {row_label}", category="unknown",
                        raw_text=f"{table_label}: {row_label} / {col} = {val}",
                        confidence=confidence.PARAGRAPH_INHERITED,
                        confidence_reason=f"Column header '{col}' did not match a known indicator.",
                        provenance=Provenance(**base_prov_kwargs, exact_text=str(val),
                                               table_row_header=row_label, table_col_header=str(col),
                                               confidence=confidence.PARAGRAPH_INHERITED),
                    ))

        if observations or ingredients:
            experiments.append(ExtractedExperiment(
                cheese_product=cheese_product, treatment=treatment,
                ingredients=ingredients, observations=observations, provenance=exp_provenance,
            ))

    return experiments, unmapped
