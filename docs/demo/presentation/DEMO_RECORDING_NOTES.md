# Presentation demo recordings — recording notes

Two demo videos of the real, running Cheese Database research platform,
recorded for a McGill/RITA scientific presentation. Both were captured by
driving the real frontend (Vite dev server, `http://localhost:5173`) against
the real backend (FastAPI, `http://localhost:8000`) with Playwright/Chromium
— no mockups, no invented pages, no fabricated data. Every screen, button,
and data value shown was produced by the application itself.

## Source paper

**"Bee venom: A potential natural alternative to conventional preservatives
for prolonging the shelf-life of soft cheese 'Talaga'"** — Ahmed, El-ssayad,
Yousef & Salem, *Heliyon* 10 (2024) e28968. 11 pages. This is the same real
PDF used elsewhere in this project's demo material
(`backend/uploads/44/97240b46a9c4_CHE 0002-BeeVenon.pdf`, original filename
`CHE 0002-BeeVenon.pdf`).

## Demo account and project (seeded for this recording, not a real credential)

- Account: `researcher@mcgill.ca` / password `McGillDemo2026!`, display name
  "Researcher" — registered via the app's own `/api/auth/register` endpoint.
  **This is a local demo-only password, not a real secret** — it was chosen
  specifically so it could be typed on camera. The app has no McGill SSO;
  nothing in either video implies otherwise.
- Project: "Cheese Shelf-Life Research" (id 46), description "Gouda
  shelf-life and preservative studies" — created via the app's own
  `POST /api/projects` endpoint.
- Paper: the bee-venom/Talaga PDF above, uploaded into project 46 **live,
  on camera, during the Video 1 recording itself** (paper id 33) — this was
  a real upload through the real drag-and-drop dropzone, not a pre-seeded
  paper.
- Extraction: real standard-mode Docling extraction (queued by the same
  on-camera upload), followed by a real LLM-engine extraction run
  (`POST /api/projects/46/papers/33/extract?engine=llm`, job id 78) executed
  between the two recordings so Video 2 has genuine structured data to show.
  That run genuinely produced 6 experiments, 6 treatment arms, 15
  observations and 34 provenance records, auto-promoted to the canonical
  Study → Experiment → Treatment Arm → Observation schema. One observation
  was approved live, on camera, during the Video 2 Review scene.

## Video 1 — "Upload and extraction" (~58s)

Real per-scene timings (`video1_timing.json`):

| Scene | Route(s) | Duration |
|---|---|---|
| Landing | `/` | 10.4s |
| Login | `/login` → `/` | 14.3s |
| Dashboard | `/` | 3.6s |
| Open project | `/projects/46` | 2.4s |
| Upload | `/projects/46/upload` → `/projects/46/papers/33/overview` | 18.6s |
| Extraction begins | `/projects/46/papers/33/overview` | 9.1s |
| **Total** | | **58.4s** |

Sequence: slow elegant scroll down the real landing page (real "Recent
research" cards, real capabilities section) and back to top → click "Log in"
→ type `researcher@mcgill.ca` and the demo password character-by-character
into the real login form → real Dashboard showing the real "Cheese
Shelf-Life Research" project card and the "Researcher" avatar → open the
project (fresh, empty state: "Build your research library") → click "Upload
your first paper" → a synthetic-but-real drag-and-drop of the actual PDF
bytes onto the real react-dropzone (see "Recording technology" below) →
"Standard extraction" selected and submitted → lands on the paper's real
Overview tab and lets real Docling progress states play out (live activity
feed: pages analyzed, tables/figures found, live paper preview) for ~9s,
stopping mid-analysis — this is the deliberate bridge to Video 2.

## Video 2 — "Evidence to database" (~45s)

Real per-scene timings (`video2_timing.json`):

| Scene | Route(s) | Duration |
|---|---|---|
| Resume overview (continuity bridge) | `/projects/46/papers/33/overview` | 2.2s |
| Evidence workspace | `/projects/46/papers/33/docling` | 10.9s |
| Evidence → structured info | `/projects/46/papers/33/validation` | 4.7s |
| Researcher review | `/projects/46/papers/33/review` | 6.7s |
| Research Structure | `/projects/46/research-structure` | 6.6s |
| Scientific database | `/projects/46/dataset` | 4.3s |
| Export | `/projects/46/dataset` (Export menu) | 8.3s |
| Closing | `/projects/46/dataset` | 1.8s |
| **Total** | | **45.4s** |

Sequence: opens on the same paper's Overview tab, now showing "Standard
finished in 56s" — the same screen Video 1 ended on, now complete, as the
visual continuity bridge → Evidence tab: real filter buttons (All/Figures/
Tables/Photos/Charts) exercised with real counts, opens one real extracted
table asset in the detail panel, then browses the real chart gallery (5 real
digitized figures from the paper, e.g. "Fig. 4. Minimum inhibitory
concentration for honey-BV against bacteria") → Extract data tab: the real
completed extraction summary (23 evidence items, 16 text passages, 4 tables,
3 charts) → Review tab: real "Needs Review" queue grouped by experiment
(Talaga cheese / honey-BV arms), expands one row's real evidence crop +
source snippet, then clicks the real Approve action on one measurement (a
genuine review decision, not a staged screenshot) → Research Structure: the
real canonical hierarchy (1 study, 6 experiments, 6 treatments, 15
observations) with real treatment/measurement cards → Scientific Database:
the real observations table (15 rows, all from this paper) → Export: opens
the real export menu and downloads a real Excel workbook — the closing frame
shows the app's own "Excel workbook downloaded" success toast, proving the
full pipeline (upload → extract → review → structure → export) is genuinely
functional end to end.

## Recording technology

- **Playwright (Python, sync API) driving real Chromium** against the real
  dev servers, using Playwright's own off-screen video recorder
  (`record_video_dir` / `record_video_size`, viewport 1920×1080) rather than
  OS-level screen capture. This guarantees zero risk of exposing the desktop,
  taskbar, browser chrome, or Windows activation watermark, and is
  resolution-independent of the physical monitor.
- Scripts: `record_demo_01.py`, `record_demo_02.py`, sharing helpers in
  `record_helpers.py` (native-JS smooth scrolling, eased mouse movement,
  React-compatible character-by-character typing, a `SceneTimer` for the
  real durations tabulated above).
- **Real file upload via synthetic drag-and-drop**: the actual PDF bytes are
  read from disk, base64-encoded, and reconstructed into a real
  browser-native `File` inside a `DataTransfer`, which is then dispatched as
  `dragenter`/`dragover`/`drop` events on the real react-dropzone root. The
  uploaded file and everything the backend does with it afterward (parsing,
  extraction, storage) is 100% real; only the low-level OS drag gesture is
  simulated, which is the standard technique for driving an HTML5 drop zone
  from outside a real desktop drag-and-drop.
- Login uses the app's real authentication form and typing simulation.
  Video 2 authenticates by seeding the same real JWT (obtained from the
  app's own `/api/auth/login`) into the frontend's own auth store
  (`localStorage['food-research-auth']`) before navigating, so it continues
  the same logged-in session rather than repeating the login scene.
- Rendering: `render_demos.sh` re-encodes each raw Playwright `.webm` master
  to H.264 High Profile, `yuv420p`, `faststart` MP4 at two resolutions:
  1080p (native) and 4K (upscaled from the 1080p master via a Lanczos
  filter).

## Known, deliberate deviations from the brief

- **Frame rate**: Playwright's built-in video recorder is hard-capped at
  25fps regardless of resolution or requested settings (confirmed via
  `ffprobe` on a raw test capture: `r_frame_rate=25/1`). This is a tool
  limitation, not a setting. All cursor/scroll motion was deliberately kept
  slow and eased specifically so 25fps reads as smooth rather than choppy.
- **4K capture**: this machine's Playwright↔Chromium automation measured
  significantly higher per-interaction latency at 4K rendering (the
  underlying cause was unrelated background load — this machine's own Chrome
  browser was running ~50 tab processes during recording). Per the brief's
  own stated fallback ("if 4K60 is not feasible... upscale afterward...
  never sacrifice UI smoothness for nominal resolution"), both videos were
  captured natively at 1920×1080 and the 4K deliverables are produced via a
  high-quality Lanczos upscale in `render_demos.sh`, not native 4K capture.
- **Video 1 duration**: 58.4s real duration vs. the 35–50s target (about 8s
  over). No scene was padded artificially — this reflects genuinely slower
  automation round-trips on this machine during the live upload + extraction
  scenes. All content is real and every scene earns its time; it was not
  trimmed further to avoid cutting into the real upload/extraction
  interaction it depends on.
- Both videos are silent by design (no narration, no music), per the
  brief — the presenter narrates live.
