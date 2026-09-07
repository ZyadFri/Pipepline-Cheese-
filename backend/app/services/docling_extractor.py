"""
docling_extractor.py — Docling-based PDF extraction service.

For each PDF extracts:
  • Structured text paragraphs with page provenance
  • Native tables exported as CSV files
  • Figure images saved as PNG files
  • Per-item metadata: page_number, bounding_box (fractional 0-1), docling self_ref, caption

Runs as a loop of chunked page-range Docling conversions (extract_pdf_progressive)
rather than one blocking whole-document call, so a caller can persist and show
tables/figures to the user as each chunk completes instead of only after the
entire paper finishes. Docling's own API has no per-page callback/streaming
hook (confirmed against the installed version) — page_range is the real,
supported mechanism for this, and page numbers stay absolute across chunked
calls (no re-offsetting needed).

Results are cached on disk by file SHA-256 hash + DOCLING_CACHE_VERSION: one
JSON file per chunk plus a manifest recording which chunks are done and
whether the run is complete, so a crash mid-run is correctly treated as a
cache miss on the next attempt rather than silently served as a full result.

Raises ImportError when docling is not installed.
API credentials never leave the server.
"""
import hashlib
import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Iterator, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

# Sections whose content we skip (conclusions add noise, refs are not experiments)
_SKIP_HEADINGS = frozenset({
    "conclusion", "conclusions", "references", "bibliography",
    "acknowledgement", "acknowledgements", "funding", "conflict",
    "appendix", "supplementary",
})


# ─── Data classes ─────────────────────────────────────────────────────────────

@dataclass
class DoclingText:
    item_ref: str
    page_number: int
    text: str
    heading_context: Optional[str] = None
    bbox: Optional[dict] = None          # {x1, y1, x2, y2} fractional


@dataclass
class DoclingTable:
    item_ref: str
    page_number: int
    caption: Optional[str] = None
    csv_path: str = ""
    bbox: Optional[dict] = None


@dataclass
class DoclingFigure:
    item_ref: str
    page_number: int
    caption: Optional[str] = None
    image_path: str = ""
    bbox: Optional[dict] = None


@dataclass
class DoclingResult:
    file_hash: str
    cache_dir: str
    markdown_path: str
    texts: list = field(default_factory=list)     # List[DoclingText]
    tables: list = field(default_factory=list)    # List[DoclingTable]
    figures: list = field(default_factory=list)   # List[DoclingFigure]
    page_count: int = 0

    @property
    def known_item_refs(self) -> set:
        """All valid docling_item_ref values — used to validate LLM citations."""
        refs = set()
        for item in self.texts:
            refs.add(item.item_ref)
        for item in self.tables:
            refs.add(item.item_ref)
        for item in self.figures:
            refs.add(item.item_ref)
        return refs


@dataclass
class DoclingChunkResult:
    """One page-range window's worth of extraction. Every window yields
    exactly one of these, including a failed one — mirrors the
    chart_converter.convert_charts() generator contract already used
    elsewhere in this codebase, so one bad page range can't kill the job."""
    chunk_index: int
    page_start: int
    page_end: int
    total_pages: int
    texts: list = field(default_factory=list)
    tables: list = field(default_factory=list)
    figures: list = field(default_factory=list)
    markdown: str = ""
    status: str = "ok"              # "ok" | "failed"
    error: Optional[str] = None


@dataclass
class _ChunkCarry:
    """State that must survive across chunk boundaries — each chunk's
    Docling ConversionResult is otherwise independent of its neighbors."""
    current_heading: Optional[str] = None
    skipping: bool = False          # inside a _SKIP_HEADINGS zone (e.g. "References")
    table_seq: int = 0              # global counters: table_N.csv / image_N.png
    figure_seq: int = 0             # would restart at 1 per chunk otherwise and overwrite


# ─── Ref namespacing ──────────────────────────────────────────────────────────
# Each chunk's ConversionResult numbers its own items from scratch (#/texts/0,
# #/tables/0, ...), so refs from different chunks collide unless namespaced.

def _ns_ref(raw_ref: str, page_start: int, page_end: int) -> str:
    return f"{raw_ref}@p{page_start}-{page_end}"


def strip_chunk_suffix(ref: str) -> str:
    """Recover the bare Docling self_ref from a namespaced ref, for any
    caller that needs to compare against a chunk's own ConversionResult."""
    return ref.split("@", 1)[0]


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _file_hash(pdf_path: str) -> str:
    sha = hashlib.sha256()
    with open(pdf_path, "rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            sha.update(chunk)
    return sha.hexdigest()


def _pdf_page_count(pdf_path: str) -> int:
    import fitz  # PyMuPDF — already a dependency, already used elsewhere in this app
    doc = fitz.open(pdf_path)
    try:
        return doc.page_count
    finally:
        doc.close()


def _chunk_windows(total_pages: int, chunk_size: int) -> list:
    """Page windows [(start, end), ...], 1-based inclusive, absolute.
    chunk_size <= 0 (or >= total_pages) yields a single whole-document window."""
    total_pages = max(total_pages, 1)
    if not chunk_size or chunk_size <= 0 or chunk_size >= total_pages:
        return [(1, total_pages)]
    windows = []
    start = 1
    while start <= total_pages:
        end = min(start + chunk_size - 1, total_pages)
        windows.append((start, end))
        start = end + 1
    return windows


def _bbox_fractional(prov_list, page_width: float, page_height: float) -> Optional[dict]:
    """Convert Docling provenance bbox to fractional {x1, y1, x2, y2}."""
    if not prov_list:
        return None
    try:
        bbox = prov_list[0].bbox
        # Docling BoundingBox: l/t/r/b in PDF points (top-left origin)
        # Handle both attribute styles gracefully.
        l = getattr(bbox, "l", None) if getattr(bbox, "l", None) is not None else getattr(bbox, "x1", 0)
        t = getattr(bbox, "t", None) if getattr(bbox, "t", None) is not None else getattr(bbox, "y1", 0)
        r = getattr(bbox, "r", None) if getattr(bbox, "r", None) is not None else getattr(bbox, "x2", page_width)
        b = getattr(bbox, "b", None) if getattr(bbox, "b", None) is not None else getattr(bbox, "y2", page_height)
        if page_width > 0 and page_height > 0:
            return {
                "x1": max(0.0, min(1.0, float(l) / page_width)),
                "y1": max(0.0, min(1.0, float(t) / page_height)),
                "x2": max(0.0, min(1.0, float(r) / page_width)),
                "y2": max(0.0, min(1.0, float(b) / page_height)),
            }
    except Exception:
        pass
    return None


def _page_size(doc, page_no: int) -> tuple:
    """Return (width, height) in PDF points for page_no (1-indexed). Falls back to Letter."""
    try:
        page = doc.pages[page_no]
        return float(page.size.width), float(page.size.height)
    except Exception:
        pass
    try:
        for pno, page in doc.pages.items():
            if pno == page_no:
                return float(page.size.width), float(page.size.height)
    except Exception:
        pass
    return 612.0, 792.0


def _caption_text(element, doc) -> Optional[str]:
    """Extract caption from a PictureItem or TableItem."""
    parts = []
    try:
        for cap in getattr(element, "captions", []):
            # Try different Docling versions
            text = (
                getattr(cap, "text", None)
                or getattr(cap, "ref_text", None)
            )
            if text is None:
                try:
                    resolved = cap.resolve(doc)
                    text = getattr(resolved, "text", None)
                except Exception:
                    pass
            if text:
                parts.append(text)
    except Exception:
        pass
    return " ".join(parts).strip() or None


# ─── Cache: one file per chunk + a manifest ────────────────────────────────────

def _manifest_path(cache_dir: Path) -> Path:
    return cache_dir / "cache_manifest.json"


def _chunk_cache_path(cache_dir: Path, chunk_index: int) -> Path:
    return cache_dir / f"chunk_{chunk_index:04d}.json"


def _dataclass_list_to_dicts(items: list) -> list:
    return [item.__dict__ for item in items]


def _chunk_to_dict(chunk: DoclingChunkResult) -> dict:
    return {
        "chunk_index": chunk.chunk_index,
        "page_start": chunk.page_start,
        "page_end": chunk.page_end,
        "total_pages": chunk.total_pages,
        "status": chunk.status,
        "error": chunk.error,
        "markdown": chunk.markdown,
        "texts": _dataclass_list_to_dicts(chunk.texts),
        "tables": _dataclass_list_to_dicts(chunk.tables),
        "figures": _dataclass_list_to_dicts(chunk.figures),
    }


def _chunk_from_dict(d: dict) -> DoclingChunkResult:
    return DoclingChunkResult(
        chunk_index=d["chunk_index"],
        page_start=d["page_start"],
        page_end=d["page_end"],
        total_pages=d["total_pages"],
        status=d.get("status", "ok"),
        error=d.get("error"),
        markdown=d.get("markdown", ""),
        texts=[DoclingText(**t) for t in d.get("texts", [])],
        tables=[DoclingTable(**t) for t in d.get("tables", [])],
        figures=[DoclingFigure(**f) for f in d.get("figures", [])],
    )


def _write_manifest(cache_dir: Path, manifest: dict) -> None:
    _manifest_path(cache_dir).write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8"
    )


def _read_manifest(cache_dir: Path) -> Optional[dict]:
    p = _manifest_path(cache_dir)
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None


def _complete_cached_manifest(cache_dir: Path, file_hash: str, total_pages: int) -> Optional[dict]:
    """Return the manifest only if it describes a complete, current-version,
    contiguous cache for this exact file and page count — otherwise None (a
    cache miss), so a crash mid-run or a stale/partial cache is never
    silently served as a full result."""
    manifest = _read_manifest(cache_dir)
    if not manifest or not manifest.get("complete"):
        return None
    if manifest.get("docling_version") != settings.DOCLING_CACHE_VERSION:
        return None
    if manifest.get("file_hash") != file_hash:
        return None
    if manifest.get("total_pages") != total_pages:
        return None
    chunks = sorted(manifest.get("chunks", []), key=lambda c: c["index"])
    if not chunks:
        return None
    expected_start = 1
    for c in chunks:
        if c.get("page_start") != expected_start:
            return None
        if not _chunk_cache_path(cache_dir, c["index"]).exists():
            return None
        expected_start = c["page_end"] + 1
    if expected_start - 1 != total_pages:
        return None
    return manifest


# ─── Chunked conversion ─────────────────────────────────────────────────────────

def _convert_one_chunk(
    converter,
    pdf_path: str,
    chunk_index: int,
    page_start: int,
    page_end: int,
    total_pages: int,
    cache_dir: Path,
    carry: _ChunkCarry,
) -> DoclingChunkResult:
    from docling_core.types.doc import PictureItem, TableItem

    try:
        conv_result = converter.convert(pdf_path, page_range=(page_start, page_end))
    except Exception as exc:
        logger.warning(
            "Docling chunk %d (pages %d-%d) failed for %s: %s",
            chunk_index, page_start, page_end, pdf_path, exc,
        )
        return DoclingChunkResult(
            chunk_index=chunk_index, page_start=page_start, page_end=page_end,
            total_pages=total_pages, status="failed", error=str(exc)[:500],
        )

    doc = conv_result.document

    # ── Mark skip zone (carries `skipping` across chunks — otherwise a
    #    "References" section on a chunk boundary would resume being kept) ──
    skip_ids: set = set()
    skipping = carry.skipping
    for item, _level in doc.iterate_items():
        raw_text = getattr(item, "text", "") or ""
        label = str(getattr(item, "label", "") or "").lower()
        if "heading" in label or "section_header" in label:
            if raw_text.lower().strip() in _SKIP_HEADINGS:
                skipping = True
        if skipping:
            skip_ids.add(id(item))
    carry.skipping = skipping

    # ── Iterate and collect ───────────────────────────────────────────────────
    texts: list = []
    tables: list = []
    figures: list = []
    current_heading = carry.current_heading

    for element, _level in doc.iterate_items():
        if id(element) in skip_ids:
            continue

        raw_ref: str = getattr(element, "self_ref", None) or f"#/unknown/{id(element)}"
        item_ref = _ns_ref(raw_ref, page_start, page_end)
        prov = getattr(element, "prov", None) or []
        page_no: int = int(prov[0].page_no) if prov else page_start
        w, h = _page_size(doc, page_no)
        bbox = _bbox_fractional(prov, w, h)
        label = str(getattr(element, "label", "") or "").lower()

        # Track current heading for text context — seeded from carry so a
        # paragraph continuing a section from the previous chunk is correct.
        if "heading" in label or "section_header" in label:
            current_heading = getattr(element, "text", "") or None

        if isinstance(element, TableItem):
            carry.table_seq += 1
            try:
                df = element.export_to_dataframe(doc)
            except TypeError:
                df = element.export_to_dataframe()
            csv_path = cache_dir / f"table_{carry.table_seq}.csv"
            df.to_csv(str(csv_path), index=False)
            tables.append(DoclingTable(
                item_ref=item_ref,
                page_number=page_no,
                caption=_caption_text(element, doc),
                csv_path=str(csv_path),
                bbox=bbox,
            ))

        elif isinstance(element, PictureItem):
            carry.figure_seq += 1
            img_path = cache_dir / f"image_{carry.figure_seq}.png"
            saved = False
            try:
                img = element.get_image(doc)
                if img:
                    img.save(str(img_path))
                    saved = True
            except Exception as exc:
                logger.warning("Figure %d save failed: %s", carry.figure_seq, exc)
            figures.append(DoclingFigure(
                item_ref=item_ref,
                page_number=page_no,
                caption=_caption_text(element, doc),
                image_path=str(img_path) if saved else "",
                bbox=bbox,
            ))

        else:
            raw_text = getattr(element, "text", "") or ""
            if raw_text.strip():
                texts.append(DoclingText(
                    item_ref=item_ref,
                    page_number=page_no,
                    text=raw_text,
                    heading_context=current_heading,
                    bbox=bbox,
                ))

    carry.current_heading = current_heading

    markdown = ""
    try:
        markdown = doc.export_to_markdown()
    except Exception as exc:
        logger.warning("Markdown export failed for chunk %d: %s", chunk_index, exc)

    return DoclingChunkResult(
        chunk_index=chunk_index, page_start=page_start, page_end=page_end,
        total_pages=total_pages, texts=texts, tables=tables, figures=figures,
        markdown=markdown, status="ok",
    )


def _build_converter():
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import PdfPipelineOptions
    from docling.document_converter import DocumentConverter, PdfFormatOption

    pipeline_options = PdfPipelineOptions()
    pipeline_options.images_scale = 2.0
    pipeline_options.generate_page_images = False
    pipeline_options.generate_picture_images = True

    # GPU acceleration when available
    try:
        from docling.datamodel.pipeline_options import AcceleratorOptions, AcceleratorDevice
        import torch
        device = AcceleratorDevice.CUDA if torch.cuda.is_available() else AcceleratorDevice.CPU
        pipeline_options.accelerator_options = AcceleratorOptions(
            device=device, num_threads=4
        )
    except (ImportError, AttributeError):
        pass  # CPU default is fine

    return DocumentConverter(
        format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)}
    )


# ─── Main entry points ─────────────────────────────────────────────────────────

def extract_pdf_progressive(
    pdf_path: str,
    chunk_size: Optional[int] = None,
    cancel_check: Optional[Callable[[], bool]] = None,
) -> Iterator[DoclingChunkResult]:
    """
    Extract a PDF as a stream of page-range chunks, so a caller can persist
    and surface each chunk's tables/figures as soon as it's ready instead of
    waiting for the whole document. Every window yields exactly one
    DoclingChunkResult, including a failed one (never raises out of the loop).

    On a cache hit, still yields chunk-by-chunk (from disk) so callers have a
    single code path regardless of whether this is a fresh run or a replay.

    `cancel_check`, if given, is polled before starting each new chunk (not
    mid-conversion — a single converter.convert() call can't be interrupted).
    On cancellation the generator simply stops; already-cached chunks remain
    on disk for a future resume, and the manifest is left `complete: false`.
    """
    try:
        import docling  # noqa: F401
    except ImportError as exc:
        raise ImportError(
            "docling is not installed. Run: pip install 'docling>=2.14.0,<3.0'"
        ) from exc

    if chunk_size is None:
        chunk_size = settings.DOCLING_CHUNK_SIZE

    file_hash = _file_hash(pdf_path)
    base_dir = Path(settings.DOCLING_CACHE_DIR)
    cache_dir = base_dir / file_hash
    cache_dir.mkdir(parents=True, exist_ok=True)

    total_pages = _pdf_page_count(pdf_path)

    # ── Cache hit ─────────────────────────────────────────────────────────────
    manifest = _complete_cached_manifest(cache_dir, file_hash, total_pages)
    if manifest is not None:
        logger.info("Docling cache hit: %s", pdf_path)
        for c in sorted(manifest["chunks"], key=lambda c: c["index"]):
            data = json.loads(_chunk_cache_path(cache_dir, c["index"]).read_text(encoding="utf-8"))
            yield _chunk_from_dict(data)
        return

    # ── Fresh extraction ──────────────────────────────────────────────────────
    windows = _chunk_windows(total_pages, chunk_size)
    logger.info(
        "Running Docling on %s — %d page(s), %d chunk(s) of up to %s page(s) …",
        pdf_path, total_pages, len(windows), chunk_size or "all",
    )

    converter = _build_converter()
    carry = _ChunkCarry()
    manifest_chunks: list = []
    md_path = cache_dir / "content.md"
    md_path.write_text("", encoding="utf-8")

    for chunk_index, (start, end) in enumerate(windows):
        if cancel_check and cancel_check():
            logger.info(
                "Docling extraction cancelled before chunk %d (pages %d-%d) for %s",
                chunk_index, start, end, pdf_path,
            )
            return

        chunk = _convert_one_chunk(
            converter, pdf_path, chunk_index, start, end, total_pages, cache_dir, carry,
        )

        _chunk_cache_path(cache_dir, chunk_index).write_text(
            json.dumps(_chunk_to_dict(chunk), indent=2, ensure_ascii=False), encoding="utf-8"
        )
        if chunk.markdown:
            with md_path.open("a", encoding="utf-8") as fh:
                fh.write(chunk.markdown)
                fh.write("\n\n")

        manifest_chunks.append({
            "index": chunk_index, "page_start": start, "page_end": end, "status": chunk.status,
        })
        _write_manifest(cache_dir, {
            "docling_version": settings.DOCLING_CACHE_VERSION,
            "file_hash": file_hash,
            "total_pages": total_pages,
            "chunk_size": chunk_size,
            "chunks": manifest_chunks,
            "complete": False,
        })

        yield chunk

    _write_manifest(cache_dir, {
        "docling_version": settings.DOCLING_CACHE_VERSION,
        "file_hash": file_hash,
        "total_pages": total_pages,
        "chunk_size": chunk_size,
        "chunks": manifest_chunks,
        "complete": True,
    })
    logger.info(
        "Docling complete: %s (%d chunk(s), %d page(s))",
        pdf_path, len(manifest_chunks), total_pages,
    )


def extract_pdf(pdf_path: str) -> DoclingResult:
    """
    Extract a PDF using Docling and return one aggregated result.

    Thin accumulator over extract_pdf_progressive() — kept for callers that
    need the whole document at once (context linking needs whole-document
    ordering; existing tests construct/expect this shape directly).

    Raises ImportError if docling is not installed.
    Raises RuntimeError if every chunk failed (nothing was extracted at all).
    """
    file_hash = _file_hash(pdf_path)
    cache_dir = Path(settings.DOCLING_CACHE_DIR) / file_hash

    texts: list = []
    tables: list = []
    figures: list = []
    total_pages = 0
    any_ok = False
    any_failed = False

    for chunk in extract_pdf_progressive(pdf_path):
        total_pages = chunk.total_pages
        if chunk.status == "failed":
            any_failed = True
            continue
        any_ok = True
        texts.extend(chunk.texts)
        tables.extend(chunk.tables)
        figures.extend(chunk.figures)

    if any_failed and not any_ok:
        raise RuntimeError(f"Docling conversion failed for {pdf_path}")

    result = DoclingResult(
        file_hash=file_hash,
        cache_dir=str(cache_dir),
        markdown_path=str(cache_dir / "content.md"),
        texts=texts,
        tables=tables,
        figures=figures,
        page_count=total_pages,
    )
    logger.info(
        "Docling: %d texts, %d tables, %d figures from %s",
        len(texts), len(tables), len(figures), pdf_path,
    )
    return result
