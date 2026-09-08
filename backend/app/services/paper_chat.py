"""
"Ask this paper" — lightweight keyword-retrieval + LLM answer, scoped to ONE
paper's already-extracted Docling text. No embeddings/vector store: a paper
has at most a few dozen text spans, so keyword overlap is enough for v1 and
keeps this dependency-free.
"""
import re

from sqlalchemy.orm import Session

from app.services.llm_qa import ask_llm
from app.services.paper_context import gather_paper_text_spans

_STOPWORDS = frozenset({
    "the", "a", "an", "of", "in", "on", "at", "to", "for", "and", "or", "is",
    "was", "were", "are", "what", "which", "who", "how", "did", "does", "do",
    "this", "that", "paper", "study", "with", "used", "have", "has",
})
_WORD = re.compile(r"[a-zA-Z]{3,}")

_MAX_CONTEXT_CHARS = 5000
_TOP_K = 8

_SYSTEM_PROMPT = (
    "You answer questions about ONE specific scientific paper using ONLY the "
    "excerpts provided below. If the excerpts don't contain the answer, say "
    "you couldn't find that information in the extracted text — never guess "
    "or use outside knowledge. Keep answers to 2-4 sentences."
)


def _keywords(text: str) -> set[str]:
    return {w.lower() for w in _WORD.findall(text)} - _STOPWORDS


def _retrieve(paper_id: int, question: str, db: Session) -> list[dict]:
    spans = gather_paper_text_spans(paper_id, db)
    q_words = _keywords(question)
    if not q_words:
        return spans[:_TOP_K]
    scored = [(s, len(_keywords(s["text"]) & q_words)) for s in spans]
    matched = sorted((s for s in scored if s[1] > 0), key=lambda p: p[1], reverse=True)
    return [s for s, _ in matched[:_TOP_K]] or spans[:_TOP_K]


def answer_question_about_paper(paper_id: int, question: str, db: Session) -> dict:
    spans = _retrieve(paper_id, question, db)
    if not spans:
        return {
            "answer": "This paper hasn't been extracted yet, so there's no text to search.",
            "sources": [],
        }

    parts: list[str] = []
    used: list[dict] = []
    total = 0
    for s in spans:
        if total >= _MAX_CONTEXT_CHARS:
            break
        chunk = s["text"][: _MAX_CONTEXT_CHARS - total]
        parts.append(f"[Page {s['page_number'] or '?'}] {chunk}")
        total += len(chunk)
        used.append(s)

    context = "\n\n".join(parts)
    prompt = f"EXCERPTS FROM THE PAPER:\n{context}\n\nQUESTION: {question}"
    answer = ask_llm(_SYSTEM_PROMPT, prompt, max_tokens=400).strip()

    return {
        "answer": answer or "I couldn't generate an answer from the extracted text.",
        "sources": [
            {"page_number": s["page_number"], "snippet": s["text"][:220]}
            for s in used[:4]
        ],
    }
