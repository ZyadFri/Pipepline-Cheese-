<div align="center">

# 🧀 Cheese Database

### A scientific data management platform for food-preservation research

*Turn scientific PDF papers into a reviewed, structured, exportable research database —
with full provenance back to the source page, table, or figure.*

McGill University · Agricultural Sciences

[![Backend](https://img.shields.io/badge/backend-FastAPI-009688?logo=fastapi&logoColor=white)](backend)
[![Frontend](https://img.shields.io/badge/frontend-React_18_%2B_TypeScript-61DAFB?logo=react&logoColor=white)](frontend)
[![Database](https://img.shields.io/badge/database-PostgreSQL_%2F_SQLite-336791?logo=postgresql&logoColor=white)](#tech-stack)
[![Extraction](https://img.shields.io/badge/PDF_parsing-Docling-8B1730)](docs/extraction_engines.md)
[![Tests](https://img.shields.io/badge/tests-pytest_%2B_vitest-brightgreen)](#testing)

[Watch the walkthrough](docs/demo/app_walkthrough.mp4) · [Quick start](#-quick-start) · [Architecture](#-architecture) · [Docs map](#-documentation-map)

</div>

---

## What this is

Researchers studying food preservation (shelf-life, antimicrobial treatments, packaging,
storage conditions...) spend enormous time manually re-typing numbers out of published PDFs
into spreadsheets. This platform automates that pipeline end to end, while keeping a human
reviewer in the loop and never inventing a data point the source paper doesn't support:

```
   Upload a PDF          Extract evidence         Researcher review       Structured database
  ┌──────────────┐      ┌──────────────────┐      ┌──────────────────┐   ┌──────────────────┐
  │  Scientific   │  →   │  Docling parses   │  →   │  Approve / edit / │ → │  Study →          │
  │  research     │      │  text, tables,    │      │  reject each      │   │  Experiment →      │
  │  paper (PDF)  │      │  figures & charts │      │  measurement,     │   │  Treatment Arm →   │
  │               │      │  → LLM/Rules/ML   │      │  with the source  │   │  Observation        │
  │               │      │  extraction       │      │  crop shown       │   │  (exportable)       │
  └──────────────┘      └──────────────────┘      └──────────────────┘   └──────────────────┘
```

Every number in the final database can be traced back to the exact page, table, or figure it
came from — see [Scientific data model & provenance](#-scientific-data-model--provenance).

**[▶ Watch the real, narrated app walkthrough](docs/demo/app_walkthrough.mp4)** (1080p, ~2 min) —
a genuine screen recording of the live app, not a mockup. Two additional presentation-cut demo
videos (upload→extraction and evidence→database) live in
[`docs/demo/presentation/`](docs/demo/presentation/).

---

## Table of contents

- [Key features](#-key-features)
- [Architecture](#-architecture)
- [Tech stack](#-tech-stack)
- [Repository structure](#-repository-structure)
- [Quick start](#-quick-start)
- [Environment variables](#-environment-variables)
- [Core workflow](#-core-workflow)
- [Extraction engines](#-extraction-engines)
- [Scientific data model & provenance](#-scientific-data-model--provenance)
- [Testing](#-testing)
- [Deployment](#-deployment)
- [Documentation map](#-documentation-map)

---

## ✨ Key features

- **Drag-and-drop PDF upload**, single-paper workspace or batch upload (up to 10 papers at once).
- **Docling-powered parsing** — real page images, native tables, figures, and chart digitization,
  processed progressively (chunked page-range conversion) so evidence appears as it's found
  instead of after the whole paper finishes.
- **Three interchangeable extraction engines** (LLM / Rules / ML-scaffolded) sharing one
  evidence base and one canonical writer — see [`docs/extraction_engines.md`](docs/extraction_engines.md).
- **Evidence workspace** — every extracted text passage, table, figure, and chart is browsable,
  filterable, and individually inspectable with its page location and confidence.
- **Ask-this-paper chat & auto-generated paper summary**, grounded in the extracted evidence.
- **Human review queue** — approve, edit, or reject every measurement, grouped by experiment,
  with the original evidence crop and source snippet shown inline.
- **Canonical scientific schema** — Study → Experiment → Treatment Arm → Observation, with full
  provenance, value-origin, and missing-reason tracking on every number (see below).
- **Research Structure & Scientific Database views** — browse the canonical hierarchy, or the
  flat, filterable, searchable observation table.
- **Multi-format export** — Excel (multi-sheet workbook), CSV archive, JSON, and Parquet (for
  pandas/ML), plus an instant per-table CSV/XLSX export straight from a single extracted asset.
- **Team collaboration** — project membership/roles, audit history, comment threads.
- **Threshold & shelf-life analysis**, unit/taxonomy normalization, validation-issue tracking.
- **Authenticated, project-scoped access** on every route (no cross-tenant data leakage).

---

## 🏗 Architecture

```mermaid
flowchart LR
    subgraph Client["Browser"]
        FE["React 18 + TypeScript\n(Vite, TailwindCSS)"]
    end

    subgraph Server["Backend — FastAPI"]
        API["REST API\n(JWT auth, project-scoped)"]
        DOC["Docling extractor\n(progressive, chunked)"]
        ENG["Extraction engines\nLLM · Rules · ML"]
        PROM["Canonical promoter"]
        EXP["Exporters\nExcel · CSV · JSON · Parquet"]
    end

    subgraph Data["Storage"]
        DB[("PostgreSQL / SQLite\nStudy → Experiment →\nTreatment Arm → Observation")]
        FILES[("File storage\nPDFs · page images ·\nevidence crops · exports")]
    end

    subgraph AI["LLM providers (fallback chain)"]
        GROQ["Groq"]
        GEMINI["Gemini"]
        OPENAI["OpenAI"]
    end

    FE <--> |HTTPS + JSON| API
    API --> DOC --> ENG
    ENG --> AI
    ENG --> PROM --> DB
    API --> EXP --> DB
    API --> FILES
    DOC --> FILES
```

Production deploys the frontend to **Vercel** and the backend to **Azure Container Apps**
(PostgreSQL Flexible Server + Azure Files for persistent uploads/cache) — full details,
resource names, and redeploy commands in [`DEPLOYMENT.md`](DEPLOYMENT.md).

---

## 🧰 Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18 · TypeScript · Vite · TailwindCSS · TanStack Table · Recharts · Zustand |
| Backend | FastAPI · SQLAlchemy (ORM) · Alembic (migrations) · Pydantic v2 |
| Database | SQLite (dev) / PostgreSQL (prod) |
| Auth | JWT (`python-jose`) + `bcrypt` |
| PDF & document parsing | [Docling](https://github.com/DS4SD/docling) (tables, figures, layout) + PyMuPDF |
| AI extraction | Groq · Google Gemini · OpenAI · Anthropic (configurable provider + fallback chain) |
| Export | `openpyxl` (Excel), `pandas` (CSV/Parquet), native JSON |
| Testing | `pytest` (backend, 20+ suites) · `vitest` + Testing Library (frontend) |
| Infra (prod) | Vercel (frontend) · Azure Container Apps + PostgreSQL Flexible Server + Azure Files (backend) |

---

## 📁 Repository structure

```
pipeline/
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI app, CORS, route registration
│   │   ├── core/                   # Settings (.env), JWT/security
│   │   ├── db/                     # SQLAlchemy engine, session, models
│   │   ├── schemas/                # Pydantic request/response models
│   │   ├── api/routes/             # One router per resource (auth, projects, papers,
│   │   │                           #   studies, experiments, observations, review_queue,
│   │   │                           #   extraction_workspace, jobs, snapshots, export...)
│   │   ├── extraction/             # LLM / Rules / ML engine implementations + shared lexicons
│   │   └── services/                # Docling extraction, canonical promotion, exporters,
│   │                                #   chart digitization, normalization, paper chat...
│   ├── alembic/                    # DB migrations
│   ├── tests/                      # pytest suites (cross-tenant auth, job cancel,
│   │                                #   progressive Docling, exports, e2e flows...)
│   ├── .env.example
│   └── requirements.txt
│
├── frontend/
│   └── src/
│       ├── pages/                  # Landing, Login, Dashboard, Upload, Review, Analytics...
│       │   └── project/            # Per-project pages: PapersPage, ExtractionWorkspacePage,
│       │                           #   DoclingResultsPage (Evidence), ValidationPage
│       │                           #   (Extract data), ResearchStructurePage, DatasetPage
│       │                           #   (Database + Export), Studies/Experiments/Treatments...
│       ├── components/             # AssetCard, AssetDetailPanel, ExtractionTimeline,
│       │                           #   AskPaperChat, ProjectSidebar...
│       ├── services/api.ts         # Axios client + typed API calls
│       ├── store/                  # Zustand stores (auth, persisted)
│       └── test/                   # vitest suites
│
├── docs/
│   ├── demo/                       # app_walkthrough.mp4 + captions + narration scripts
│   │   └── presentation/           # Two presentation-cut demo videos + Playwright
│   │                               #   recording scripts + render pipeline (see its own
│   │                               #   DEMO_RECORDING_NOTES.md)
│   └── extraction_engines.md       # LLM / Rules / ML engine architecture
│
├── CLAUDE.md                       # Standing project instructions
├── IMPLEMENTATION.md               # Full milestone checklist + data-model reference
├── DEPLOYMENT.md                   # Production architecture, resources, redeploy steps
├── docker-compose.yml              # Backend + Celery worker + Redis + frontend
├── start.sh / start.bat            # One-command local setup (Mac/Linux / Windows)
└── README.md                       # You are here
```

---

## 🚀 Quick start

### Windows

```bat
cd pipeline
start.bat
```

### Mac / Linux

```bash
cd pipeline
chmod +x start.sh
./start.sh
```

Either script creates a Python virtual environment, installs backend + frontend
dependencies, and starts both dev servers. Then open **http://localhost:5173**.

### First-time setup

1. **Add an AI provider key** — copy `backend/.env.example` to `backend/.env` and fill in one
   provider (Groq is the quickest to get a free key for, and is what production uses):
   ```
   AI_PROVIDER=groq
   GROQ_API_KEY=your-key-here
   ```
   The key is **never sent to the frontend** — it lives only in the backend process.
2. **Register an account** at http://localhost:5173/register.
3. **Create a project** — a default food-preservation schema is applied automatically.
4. **Upload a paper** and run extraction — see [Core workflow](#-core-workflow) below.

### API documentation

FastAPI auto-generates interactive docs once the backend is running:
- Swagger UI — http://localhost:8000/docs
- ReDoc — http://localhost:8000/redoc

---

## 🔑 Environment variables

All in `backend/.env` (see `backend/.env.example` for the full annotated template):

| Variable | Description | Default |
|---|---|---|
| `SECRET_KEY` | JWT signing key | `dev-secret-key-...` |
| `DATABASE_URL` | SQLAlchemy DB URL | `sqlite:///./food_research.db` |
| `AI_PROVIDER` | `groq` \| `google_ai` \| `vertexai` \| `openai` \| `anthropic` | `groq` |
| `GROQ_API_KEY` / `GOOGLE_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | Provider key for the selected `AI_PROVIDER` | — |
| `MAX_UPLOAD_SIZE_MB` | Max PDF size | `50` |
| `MAX_PAPERS_PER_UPLOAD` | Files per batch upload | `10` |
| `UPLOAD_DIR` / `DOCLING_CACHE_DIR` / `CHART_CACHE_DIR` | Storage paths (point under a mounted volume in prod) | `uploads/...` |
| `DOCLING_CHUNK_SIZE` | Pages per progressive Docling conversion call | `2` |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins | `localhost:5173,localhost:3000` |

For PostgreSQL: `DATABASE_URL=postgresql://user:password@host:5432/food_research`.

---

## 🔄 Core workflow

```
1. Create a project           → a default food-preservation schema is applied
2. Upload a paper              → drag-and-drop PDF, single-paper workspace or batch (≤10)
3. Docling extracts evidence   → text, tables, figures & charts appear progressively
4. Run structured extraction   → LLM / Rules / ML engine turns evidence into candidate
                                  experiments, treatment arms & observations
5. Human review                → approve / edit / reject each measurement, evidence shown
6. Research Structure & DB     → browse the canonical hierarchy or the flat, searchable table
7. Export                      → Excel / CSV / JSON / Parquet, whole project or per table
```

---

## 🧪 Extraction engines

Three engines share one Docling-parsed evidence base, one intermediate representation, and one
database writer — see [`docs/extraction_engines.md`](docs/extraction_engines.md) for the full
architecture.

| Engine | Calls an LLM? | Status |
|---|---|---|
| **LLM** | Yes (Groq, with Gemini/OpenAI fallback) | Production |
| **Rules** | No — zero LLM/vision calls | Fully implemented |
| **ML** | No (planned: embeddings + classical ML) | Interfaces defined, not yet implemented |

---

## 🔬 Scientific data model & provenance

The canonical schema is a strict hierarchy:

```
Study  →  Experiment  →  Treatment Arm  →  Observation
```

Every `Observation` carries, at minimum:

- **Origin** — `reported_table` / `reported_text` / `reported_figure` / `graph_estimated` /
  `calculated` / `unit_converted` / `normalized` / `model_imputed` / `manual_entry` / ...
- **Provenance** — source paper, page number, table/figure number, and the original text
  snippet or image crop it came from.
- **Review status** — `extracted` → `needs_review` → `approved` / `rejected` (or
  `changes_requested`), fully auditable.

Imputed values are never silently blended in: they exist only as `ImputationProposal` rows, and
even once accepted stay permanently distinguishable via `value_origin = "model_imputed"`. Full
model reference: [`IMPLEMENTATION.md`](IMPLEMENTATION.md).

---

## ✅ Testing

```bash
# Backend — 20+ suites: cross-tenant auth, job cancel/cross-session visibility,
# progressive Docling, partial-failure handling, export routes, full e2e flows...
cd backend && venv/Scripts/pytest.exe tests/ -v     # Windows
cd backend && venv/bin/pytest tests/ -v              # Mac/Linux

# Frontend — vitest + Testing Library
cd frontend && npm run test
```

---

## ☁️ Deployment

Production runs on **Vercel** (frontend) + **Azure Container Apps** (backend) +
**PostgreSQL Flexible Server** + **Azure Files** (persistent uploads/cache). Full resource
list, environment variables, redeploy commands, and troubleshooting playbook:
**[`DEPLOYMENT.md`](DEPLOYMENT.md)**.

---

## 📚 Documentation map

| Doc | Covers |
|---|---|
| [`IMPLEMENTATION.md`](IMPLEMENTATION.md) | Full milestone checklist, data model reference, API summary |
| [`DEPLOYMENT.md`](DEPLOYMENT.md) | Production architecture, Azure/Vercel resources, redeploy & troubleshooting |
| [`docs/extraction_engines.md`](docs/extraction_engines.md) | LLM / Rules / ML extraction engine architecture |
| [`docs/demo/`](docs/demo/) | Real, narrated app walkthrough video + script + captions |
| [`docs/demo/presentation/`](docs/demo/presentation/) | Presentation-cut demo videos + Playwright recording pipeline |
| [`CLAUDE.md`](CLAUDE.md) | Standing project instructions (repo conventions, push policy) |

