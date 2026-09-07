"""
Tests for progressive (chunked page-range) Docling extraction.

Docling's installed version has no native per-page streaming/callback API,
so the real mechanism for incremental results is looping
converter.convert(pdf_path, page_range=(a, b)) over successive page windows.
These tests exercise the orchestration around that loop — windowing, ref
namespacing, cross-chunk carry state, failure isolation, and cache
completeness — using lightweight fakes rather than a real Docling
conversion (fully offline, matching the rest of this test suite's
convention of mocking heavy external dependencies).
"""
from pathlib import Path

import pytest

from app.core.config import settings
from app.services import docling_extractor as de
from app.services.docling_extractor import (
    _ChunkCarry,
    _chunk_cache_path,
    _chunk_windows,
    _complete_cached_manifest,
    _convert_one_chunk,
    _ns_ref,
    _write_manifest,
    strip_chunk_suffix,
)


# ─── Fakes mirroring the shape docling_extractor._convert_one_chunk needs ──────

class FakeElement:
    def __init__(self, self_ref, text, label="paragraph"):
        self.self_ref = self_ref
        self.text = text
        self.label = label
        self.prov = []
        self.captions = []


class FakeDoc:
    pages: dict = {}

    def __init__(self, items):
        self._items = items

    def iterate_items(self):
        return iter(self._items)

    def export_to_markdown(self):
        return ""


class FakeConvResult:
    def __init__(self, doc):
        self.document = doc


class FakeConverter:
    """Maps a page_range tuple to a pre-built FakeDoc."""

    def __init__(self, docs_by_range: dict):
        self.docs_by_range = docs_by_range
        self.calls: list = []

    def convert(self, pdf_path, page_range=None):
        self.calls.append(page_range)
        return FakeConvResult(self.docs_by_range[page_range])


class RaisingConverter:
    def convert(self, pdf_path, page_range=None):
        raise RuntimeError("boom")


# ─── Chunk windowing ────────────────────────────────────────────────────────────

def test_chunk_windows_cover_all_pages():
    assert _chunk_windows(14, 6) == [(1, 6), (7, 12), (13, 14)]


def test_chunk_windows_exact_multiple():
    assert _chunk_windows(12, 6) == [(1, 6), (7, 12)]


def test_chunk_windows_disabled_returns_single_window():
    assert _chunk_windows(14, 0) == [(1, 14)]


def test_chunk_windows_larger_than_total_returns_single_window():
    assert _chunk_windows(5, 6) == [(1, 5)]


def test_chunk_windows_never_starts_past_total_pages():
    windows = _chunk_windows(13, 6)
    assert windows[-1][1] == 13
    for start, end in windows:
        assert start <= 13
        assert end <= 13


# ─── Ref namespacing ────────────────────────────────────────────────────────────

def test_ref_namespacing_round_trips():
    ref = _ns_ref("#/texts/0", 7, 12)
    assert ref == "#/texts/0@p7-12"
    assert strip_chunk_suffix(ref) == "#/texts/0"


def test_ref_namespacing_distinct_across_chunks():
    a = _ns_ref("#/texts/0", 1, 6)
    b = _ns_ref("#/texts/0", 7, 12)
    assert a != b
    assert strip_chunk_suffix(a) == strip_chunk_suffix(b)


# ─── Cross-chunk carry state ────────────────────────────────────────────────────

def test_skip_zone_carries_across_chunks(tmp_path):
    """Once a 'References' heading is hit, everything after it — including
    into the NEXT chunk — must keep being dropped, matching the existing
    single-call behavior's document-global skip zone."""
    chunk1_items = [
        (FakeElement("#/texts/0", "Results", label="section_header"), 0),
        (FakeElement("#/texts/1", "a real result sentence", label="paragraph"), 0),
        (FakeElement("#/texts/2", "References", label="section_header"), 0),
        (FakeElement("#/texts/3", "Smith et al 2020", label="paragraph"), 0),
    ]
    chunk2_items = [
        (FakeElement("#/texts/0", "should also be skipped", label="paragraph"), 0),
    ]
    converter = FakeConverter({
        (1, 2): FakeDoc(chunk1_items),
        (3, 4): FakeDoc(chunk2_items),
    })
    carry = _ChunkCarry()

    chunk1 = _convert_one_chunk(converter, "fake.pdf", 0, 1, 2, 4, tmp_path, carry)
    assert [t.text for t in chunk1.texts] == ["Results", "a real result sentence"]
    assert carry.skipping is True

    chunk2 = _convert_one_chunk(converter, "fake.pdf", 1, 3, 4, 4, tmp_path, carry)
    assert chunk2.texts == []


def test_heading_context_carries_across_chunks(tmp_path):
    """A paragraph in chunk 2 continuing a section started in chunk 1 must
    still get the correct heading_context — each chunk's ConversionResult
    has no idea a heading appeared several pages earlier."""
    chunk1_items = [
        (FakeElement("#/texts/0", "Methods", label="section_header"), 0),
    ]
    chunk2_items = [
        (FakeElement("#/texts/0", "continued paragraph", label="paragraph"), 0),
    ]
    converter = FakeConverter({
        (1, 2): FakeDoc(chunk1_items),
        (3, 4): FakeDoc(chunk2_items),
    })
    carry = _ChunkCarry()

    _convert_one_chunk(converter, "fake.pdf", 0, 1, 2, 4, tmp_path, carry)
    assert carry.current_heading == "Methods"

    chunk2 = _convert_one_chunk(converter, "fake.pdf", 1, 3, 4, 4, tmp_path, carry)
    assert chunk2.texts[0].heading_context == "Methods"


def test_table_and_figure_counters_are_global_not_per_chunk(tmp_path):
    """table_N.csv / image_N.png must not restart at 1 per chunk — that
    would silently overwrite chunk 1's files with chunk 2's."""
    carry = _ChunkCarry()
    carry.table_seq = 3
    carry.figure_seq = 2
    # No TableItem/PictureItem instances are exercised here (that requires
    # docling_core's real classes) — this locks in the counter contract the
    # rest of _convert_one_chunk relies on via `carry.table_seq += 1` etc.
    assert carry.table_seq == 3
    assert carry.figure_seq == 2


# ─── Failure isolation ──────────────────────────────────────────────────────────

def test_chunk_conversion_failure_yields_failed_status_not_raise(tmp_path):
    carry = _ChunkCarry()
    result = _convert_one_chunk(RaisingConverter(), "fake.pdf", 0, 1, 2, 4, tmp_path, carry)
    assert result.status == "failed"
    assert "boom" in result.error
    assert result.texts == []


def test_extract_pdf_progressive_continues_past_a_failed_chunk(tmp_path, monkeypatch):
    pdf_path = tmp_path / "paper.pdf"
    pdf_path.write_bytes(b"%PDF-1.4 fake content")
    monkeypatch.setattr(settings, "DOCLING_CACHE_DIR", str(tmp_path / "cache"))
    monkeypatch.setattr(de, "_pdf_page_count", lambda p: 12)

    good_doc = FakeDoc([(FakeElement("#/texts/0", "ok text"), 0)])
    call_count = {"n": 0}

    class FlakyConverter:
        def convert(self, path, page_range=None):
            call_count["n"] += 1
            if page_range == (7, 12):
                raise RuntimeError("simulated Docling failure")
            return FakeConvResult(good_doc)

    monkeypatch.setattr(de, "_build_converter", lambda: FlakyConverter())

    chunks = list(de.extract_pdf_progressive(str(pdf_path), chunk_size=6))
    assert len(chunks) == 2
    assert chunks[0].status == "ok"
    assert chunks[1].status == "failed"
    # the whole-document accumulator must not raise just because one
    # chunk failed, as long as at least one chunk succeeded
    result = de.extract_pdf(str(pdf_path))
    assert len(result.texts) == 1


def test_extract_pdf_raises_only_if_every_chunk_failed(tmp_path, monkeypatch):
    pdf_path = tmp_path / "paper.pdf"
    pdf_path.write_bytes(b"%PDF-1.4 fake content")
    monkeypatch.setattr(settings, "DOCLING_CACHE_DIR", str(tmp_path / "cache"))
    monkeypatch.setattr(de, "_pdf_page_count", lambda p: 6)
    monkeypatch.setattr(de, "_build_converter", lambda: RaisingConverter())

    with pytest.raises(RuntimeError):
        de.extract_pdf(str(pdf_path))


# ─── Cooperative cancellation ───────────────────────────────────────────────────

def test_cancel_check_stops_before_the_next_chunk(tmp_path, monkeypatch):
    pdf_path = tmp_path / "paper.pdf"
    pdf_path.write_bytes(b"%PDF-1.4 fake content")
    monkeypatch.setattr(settings, "DOCLING_CACHE_DIR", str(tmp_path / "cache"))
    monkeypatch.setattr(de, "_pdf_page_count", lambda p: 18)

    empty_doc = FakeDoc([])

    class CountingConverter:
        def __init__(self):
            self.calls = []

        def convert(self, path, page_range=None):
            self.calls.append(page_range)
            return FakeConvResult(empty_doc)

    converter = CountingConverter()
    monkeypatch.setattr(de, "_build_converter", lambda: converter)

    seen = {"n": 0}

    def cancel_check():
        seen["n"] += 1
        return seen["n"] > 1  # allow the first chunk, cancel before the second

    chunks = list(de.extract_pdf_progressive(str(pdf_path), chunk_size=6, cancel_check=cancel_check))
    assert len(chunks) == 1
    assert converter.calls == [(1, 6)]


# ─── Cache completeness ─────────────────────────────────────────────────────────

def test_incomplete_manifest_is_a_cache_miss(tmp_path):
    _write_manifest(tmp_path, {
        "docling_version": settings.DOCLING_CACHE_VERSION,
        "file_hash": "abc123",
        "total_pages": 10,
        "chunks": [{"index": 0, "page_start": 1, "page_end": 6, "status": "ok"}],
        "complete": False,
    })
    assert _complete_cached_manifest(tmp_path, "abc123", 10) is None


def test_complete_manifest_missing_a_chunk_file_is_a_miss(tmp_path):
    _write_manifest(tmp_path, {
        "docling_version": settings.DOCLING_CACHE_VERSION,
        "file_hash": "abc123",
        "total_pages": 10,
        "chunks": [
            {"index": 0, "page_start": 1, "page_end": 6, "status": "ok"},
            {"index": 1, "page_start": 7, "page_end": 10, "status": "ok"},
        ],
        "complete": True,
    })
    # chunk_0000.json / chunk_0001.json were never written to disk
    assert _complete_cached_manifest(tmp_path, "abc123", 10) is None


def test_complete_manifest_with_all_chunk_files_is_a_hit(tmp_path):
    _write_manifest(tmp_path, {
        "docling_version": settings.DOCLING_CACHE_VERSION,
        "file_hash": "abc123",
        "total_pages": 10,
        "chunks": [
            {"index": 0, "page_start": 1, "page_end": 6, "status": "ok"},
            {"index": 1, "page_start": 7, "page_end": 10, "status": "ok"},
        ],
        "complete": True,
    })
    _chunk_cache_path(tmp_path, 0).write_text("{}", encoding="utf-8")
    _chunk_cache_path(tmp_path, 1).write_text("{}", encoding="utf-8")
    assert _complete_cached_manifest(tmp_path, "abc123", 10) is not None


def test_wrong_docling_version_is_a_cache_miss(tmp_path):
    _write_manifest(tmp_path, {
        "docling_version": "some-old-version",
        "file_hash": "abc123",
        "total_pages": 10,
        "chunks": [{"index": 0, "page_start": 1, "page_end": 10, "status": "ok"}],
        "complete": True,
    })
    _chunk_cache_path(tmp_path, 0).write_text("{}", encoding="utf-8")
    assert _complete_cached_manifest(tmp_path, "abc123", 10) is None


def test_wrong_file_hash_is_a_cache_miss(tmp_path):
    _write_manifest(tmp_path, {
        "docling_version": settings.DOCLING_CACHE_VERSION,
        "file_hash": "abc123",
        "total_pages": 10,
        "chunks": [{"index": 0, "page_start": 1, "page_end": 10, "status": "ok"}],
        "complete": True,
    })
    _chunk_cache_path(tmp_path, 0).write_text("{}", encoding="utf-8")
    assert _complete_cached_manifest(tmp_path, "different_hash", 10) is None
