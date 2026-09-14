# Product Demo Video — Narration Script

**Purpose:** A full walkthrough script for a screen-recorded demo of the Cheese
Database research platform, meant to be embedded on the landing page. Read
each section aloud while performing the bracketed on-screen action. Estimated
total runtime: **18–22 minutes** at a natural speaking pace. Cut freely if you
need a shorter version — section boundaries are marked so you can jump straight
to any page.

Suggested recording setup: 1920×1080, browser zoomed to 100%, a clean test
project pre-seeded with 2–3 real papers so extraction results are already
populated for the pages that need them (Review, Database, Studies, etc.) —
don't make the viewer wait through a live extraction unless you want to show
that specifically (see the note in Part 4).

---

## Part 0 — Landing page (signed out)

**[Screen: `/` while logged out — the marketing Landing page]**

> "This is the Cheese Database platform — a research data management system
> built for food science labs, specifically for turning scientific papers
> about food preservation and shelf-life into structured, queryable data.
>
> The problem it solves is simple to describe and painful to live with: a lab
> might have hundreds of papers on cheese preservation, each reporting
> experiments in its own format — different tables, different units,
> different terminology for the same treatments and microorganisms. Getting
> that into one consistent, searchable dataset today means a grad student
> manually reading PDFs and copying numbers into a spreadsheet for weeks.
>
> This platform automates that pipeline end to end: upload a PDF, and the
> system finds every table, chart, and figure in it, converts scientific
> charts back into data points, extracts structured experiments and
> measurements using a combination of deterministic rules and AI, and gives
> a researcher a review queue to verify everything before it becomes part of
> the permanent dataset — with every single value traceable back to the exact
> page, table cell, or sentence it came from."

**[Scroll through the landing page's feature highlights, pause briefly on
each]**

> "Let's walk through the whole application, page by page."

---

## Part 1 — Account creation and login

**[Screen: `/register`]**

> "Getting started is a standard sign-up — email, name, and password. Nothing
> exotic here; this is a normal authenticated multi-user application, and
> every project can have multiple team members with different roles, which
> we'll see later in the Team page."

**[Fill in the form, submit, land on the Dashboard]**

> "And that's it — we're straight into the workspace."

---

## Part 2 — Dashboard: your research projects

**[Screen: `/` signed in — Dashboard]**

> "This is the Dashboard — every research project you're part of, shown as a
> card with a live paper count. Projects are the top-level container in this
> app: a project might represent one literature review, one lab's shared
> paper library, or one specific research question you're collecting evidence
> for.
>
> Creating a new project just takes a name and an optional description."

**[Click "New Research Project", show the modal, fill it in, cancel or create]**

> "Once you're in a project, everything — papers, extracted data, review
> queues, exports — is scoped to it. Let's open one."

**[Click into an existing project card]**

---

## Part 3 — Project home: the paper library

**[Screen: `/projects/:id` — ProjectView]**

> "This is a project's home page — the paper library. Every PDF you've
> uploaded to this project lives here, with a live thumbnail of its first
> page and a real-time extraction progress indicator, not a fake spinner —
> if a paper is mid-extraction, this bar reflects actual pages processed out
> of actual total pages.
>
> On the right, we've got a pipeline overview showing how many papers are in
> each stage — uploaded, extracting, extracted, reviewed — a recent activity
> feed, and quick actions to jump straight into review or the database view.
>
> Uploading a paper is drag-and-drop, or click to browse — multiple PDFs at
> once if you've got a batch to process."

**[Show the upload control, optionally drag one file in without submitting]**

> "Let's open one paper and go through its entire workflow in detail — this
> is really the heart of the platform."

**[Click a paper card]**

---

## Part 4 — Inside a paper: the Overview tab

**[Screen: `/projects/:id/papers/:paperId/overview`]**

> "Every paper gets its own workspace with several tabs across the top —
> Overview, Docling, Charts, Extract Data, Review, and Database. We'll go
> through every one.
>
> This first tab, Overview, is what you land on right after upload. If
> extraction is still running, you'd see a live progress view here: a real
> event timeline — not a fabricated multi-stage animation — driven by actual
> backend events as Docling processes the PDF in page chunks, so tables and
> figures appear here progressively as they're found, rather than making you
> stare at a blank screen until the whole paper finishes."

**[If you have a paper mid-extraction, show that state for ~15 seconds; otherwise skip to the completed state]**

> "Once extraction finishes, this becomes a real dashboard for the paper:
> page count, how many tables, charts, and figures were found, and the full
> evidence gallery below — every table, chart and figure Docling pulled out
> of the PDF, each shown with its page number and caption, filterable by
> type."

**[Click through the filter tabs: All / Charts / Tables / Figures / Photos / Diagrams]**

> "Two more things live on this tab that are worth calling out specifically.
>
> First — this card here is an AI-generated summary of the paper itself:
> its objective, the food product studied, the treatments tested, the
> variables measured, and the main findings, generated from the paper's own
> extracted text, with the real experiment and observation counts underneath
> so you can sanity-check it against the actual structured data. This is
> meant to answer 'does the system actually understand this paper' before
> you even open the database."

**[Point to the Paper Summary card]**

> "And second — this is a small chat box scoped to just this one paper. You
> can ask it plain-language questions — 'what storage temperature was used,'
> 'which treatment had the best result' — and it retrieves the relevant
> excerpts from the paper's own extracted text and answers using only that
> text, citing the page numbers it pulled from. It won't use outside
> knowledge or guess; if the paper doesn't say it, it says so."

**[Type a real question into Ask This Paper, show the answer and its page-cited sources]**

> "Let's click into one of these tables to see the last major piece of this
> tab."

**[Click a table asset card to open the detail panel]**

> "This slide-over shows the original table image, where it appears in the
> paper with the actual page context, and — for native tables specifically —
> a side-by-side preview: the raw table exactly as Docling parsed it, next
> to the normalized database rows our rule engine derived from it. This is
> instant — no AI call, no waiting — so you can sanity-check the table
> parsing before committing to a full extraction run."

**[Scroll to the "Table → database preview" section, point out both sides]**

---

## Part 5 — The Docling tab

**[Screen: `/projects/:id/papers/:paperId/docling`]**

> "This tab is the raw output of the parsing stage — Docling is the
> open-source document-understanding engine underneath this platform,
> responsible for turning a PDF into structured elements: text blocks,
> tables, figures, and their positions on the page. This view lets you
> inspect that raw parse directly, page by page, which is useful when
> something looks off downstream and you want to check whether the problem
> is in parsing or in extraction."

**[Scroll through a couple of pages]**

---

## Part 6 — The Charts tab

**[Screen: `/projects/:id/papers/:paperId/charts`]**

> "Scientific papers report a lot of their results as charts, not tables —
> a line graph of microbial counts over storage days, for instance — and
> those numbers are just as real as anything in a table, they're just locked
> inside an image. This tab is chart-to-table digitization: every chart
> figure found in the paper, converted back into a data table of x and y
> values using vision-based reading of the plotted points and axes."

**[Open one chart's detail, show the reconstructed data table next to the original chart image]**

> "You can inspect and download the digitized values directly from here,
> and they feed into the same extraction pipeline as tables and text."

---

## Part 7 — The Extract Data tab

**[Screen: `/projects/:id/papers/:paperId/validation`]**

> "This is where a paper's evidence turns into structured data. Everything
> selected as evidence — text passages, tables, chart data — is summarized
> here: how many of each, and exactly what fields the system will look for —
> product information, treatments and ingredients, storage conditions,
> microbiological and physicochemical measurements, sampling times.
>
> You choose the extraction method here —"

**[Point to the method picker]**

> "— AI extraction, which uses a large language model for full-paper
> understanding including nuance and context, or Fast rules, a deterministic
> engine that reads tables directly with no AI call at all, which is instant
> and fully reproducible. Both write to the same structured schema, so
> you can run either — or both — and compare.
>
> Let's start one."

**[Click Start Extraction, show the live progress card]**

> "Once it completes, you get an immediate readout: how many experiments and
> measurements were structured out of this paper — and right below that,
> two things worth highlighting. This is an automatically computed
> extraction completeness score, combining how many expected fields got
> populated, how confident the extraction was, how much of it has traceable
> source evidence, and how much has been reviewed yet — one honest number
> instead of guessing whether an extraction 'looks complete.'
>
> And next to it — a missing-data detector: it compares what got extracted
> against a checklist of fields a complete experiment record should have —
> storage temperature, packaging, a clearly identified control condition —
> and tells you exactly what's missing, instead of leaving you to notice a
> blank cell three pages into a spreadsheet."

**[Point to both cards]**

> "Below that, you can expand and review exactly which evidence — which text
> passages, tables, and charts — were included in this run, before or after
> the fact."

---

## Part 8 — The Review tab

**[Screen: `/projects/:id/papers/:paperId/review`]**

> "Nothing from extraction becomes part of the permanent dataset without
> passing through review — that's a deliberate design choice. This queue
> groups every extracted measurement by experiment, and for each one shows
> the value, the confidence the system has in it, and where it came from.
>
> This confidence indicator isn't a flat high-or-low badge — it's a
> continuous color scale, so a 92% and a 61% look visibly different, not
> just 'both green.'"

**[Point to a few confidence badges of different colors]**

> "For any row, you can click here — 'why was this extracted' — and see the
> exact source: the sentence or table cell it came from, the page number,
> and, where available, an image crop of that exact spot in the PDF. Nothing
> here should ever feel like a black box."

**[Click Evidence on a row, show the expanded snippet + image]**

> "You can edit a value directly if the extraction got something wrong,
> approve or reject individual rows, or — for a paper with a lot of
> high-confidence results — bulk-approve everything above a threshold in one
> click, which is what makes reviewing a whole paper take minutes instead of
> hours."

**[Show the approve/reject/edit buttons, then the bulk-approve button]**

---

## Part 9 — The Database tab (this paper)

**[Screen: `/projects/:id/papers/:paperId/database`]**

> "This is the structured data for this one paper specifically — every
> approved and pending measurement in a single searchable, filterable table.
> The columns here actually adapt to what this paper reported: if it
> included storage humidity, milk species, packaging type, initial pH — any
> of the dozens of possible experimental-condition fields — those columns
> appear. If a paper didn't report something, that column simply doesn't
> show up here at all, so you're never staring at a wall of empty dashes."

**[Scroll the table horizontally to show several of the dynamic columns]**

> "Every row still carries its confidence score and an evidence link, same
> as the review queue, and you can export straight to CSV from here for a
> single paper's worth of data."

---

## Part 10 — Project-wide Review and Database

**[Navigate to the project's own Review page — the sidebar's "Review" item, no paper filter]**

> "Everything we just saw at the paper level also exists at the project
> level — this is the same review queue, but across every paper in the
> project at once, which is how you'd actually work once you've got a whole
> literature set uploaded rather than reviewing one paper at a time."

**[Navigate to project-level Database — sidebar's "Database" item]**

> "Same story for the database view — this is the full structured dataset
> for the entire project. One addition here worth showing specifically —"

**[Point to the duplicate-detection banner, if any pairs exist]**

> "— possible duplicate detection. When two experiments across the project
> look near-identical — same product, same treatment, same conditions — the
> system flags them with a similarity score, because it's extremely common
> for the same experiment to get extracted twice, from two different tables
> in the same paper, or from two papers citing the same underlying study.
> This surfaces that for a human to confirm rather than silently doubling
> your dataset."

**[Expand the duplicate banner to show a real pair]**

---

## Part 11 — Studies, Experiments, Treatments

**[Screen: `/projects/:id/studies`]**

> "Moving into the Analysis section of the sidebar — this is the canonical
> scientific data model, browsable directly rather than through the raw
> observation table. Studies is the top level: one row per paper, with its
> title, authors, publication year, and review status."

**[Click into one study]**

> "Opening a study shows every experiment extracted from it — a distinct set
> of experimental conditions, like 'Gouda cheese stored at four degrees for
> six weeks.'"

**[Navigate to `/projects/:id/experiments`]**

> "The Experiments page lists these directly, project-wide, with the
> product, storage conditions, and how many treatment arms and observations
> each one has."

**[Navigate to `/projects/:id/treatments`]**

> "And Treatments drills one level further — every individual treatment arm
> within an experiment: the control, and each tested intervention, with its
> ingredient, concentration, and application method."

---

## Part 12 — Normalization

**[Screen: `/projects/:id/normalization`]**

> "Papers rarely agree on terminology — one might say 'Lactobacillus
> plantarum,' another 'L. plantarum,' another just 'lactic acid bacteria.'
> The Normalization page is where those mappings live: a term as it
> literally appeared in a paper, mapped to one canonical term, so that
> analysis downstream can group by the real underlying concept instead of
> being fooled by spelling variance."

**[Show the mapping list, maybe add or point out one existing mapping]**

---

## Part 13 — Export

**[Screen: `/projects/:id/export`]**

> "Once your data's reviewed, Export is where it leaves the platform. You
> can create a named snapshot of the dataset — optionally filtered, optionally
> excluding anything still pending review — and export it as Excel, CSV,
> JSON, or Parquet for downstream statistical analysis."

**[Show the export format options and a completed export run]**

---

## Part 14 — Jobs and Audit

**[Screen: `/projects/:id/jobs`]**

> "Jobs is an operational view of every background task the platform has
> run for this project — every extraction, every export — with its status,
> timing, and any errors, useful when you need to diagnose why something
> didn't finish the way you expected."

**[Screen: `/projects/:id/audit`]**

> "Audit is the full change history — every edit, approval, rejection, and
> data change across the project, who made it and when, which matters a lot
> in a research context where you need to be able to justify exactly how a
> final dataset was arrived at."

---

## Part 15 — Team and Settings

**[Screen: `/projects/:id/team`]**

> "Team is where you manage who else has access to this project and their
> role — owner, admin, reviewer, analyst, or viewer — since most real
> research projects involve more than one person."

**[Screen: `/projects/:id/settings`]**

> "And Settings covers project-level configuration — name, description, and
> other project metadata."

---

## Part 16 — Your profile

**[Click the avatar menu in the top-right corner → View profile]**

> "One last piece, at the account level rather than the project level —
> every user has a full profile: a photo you can drag-and-drop or click to
> upload, your name, job title, organization, and a short bio, all shown
> wherever your identity appears across the platform — reviews you've
> approved, audit history, team member lists."

**[Show uploading or changing the avatar, editing a field, saving]**

---

## Closing

**[Return to the Dashboard or Landing page]**

> "That's the full platform — from a raw PDF to a fully structured, traced,
> and reviewed scientific dataset, without a single manual copy-paste. Every
> number in the final dataset can be traced back to the exact page it came
> from, every extraction method is auditable, and the whole review workflow
> is built so a lab can process a literature set in days instead of months.
>
> Thanks for watching."

---

## Appendix — Page-by-page quick reference

For anyone re-cutting a shorter version, here's every route this script
covers, in case you want to skip straight to one:

| Page | Route | What it shows |
|---|---|---|
| Landing | `/` (signed out) | Marketing page |
| Login / Register | `/login`, `/register` | Auth |
| Dashboard | `/` (signed in) | Project list, create project |
| Project home | `/projects/:id` | Paper library, upload, pipeline overview |
| Paper — Overview | `/projects/:id/papers/:paperId/overview` | Live extraction, evidence gallery, AI summary card, Ask This Paper chat, table preview |
| Paper — Docling | `/projects/:id/papers/:paperId/docling` | Raw Docling parse |
| Paper — Charts | `/projects/:id/papers/:paperId/charts` | Chart-to-table digitization |
| Paper — Extract Data | `/projects/:id/papers/:paperId/validation` | Evidence review, engine choice, run extraction, completeness score, missing-fields |
| Paper — Review | `/projects/:id/papers/:paperId/review` | Per-paper review queue, confidence heatmap, evidence viewer |
| Paper — Database | `/projects/:id/papers/:paperId/database` | Per-paper structured data, dynamic columns |
| Project Review | `/projects/:id/validation` | Review queue, all papers |
| Project Database | `/projects/:id/dataset` | Full dataset, duplicate detection |
| Studies | `/projects/:id/studies` | Canonical study records |
| Experiments | `/projects/:id/experiments` | Canonical experiment records |
| Treatments | `/projects/:id/treatments` | Canonical treatment-arm records |
| Normalization | `/projects/:id/normalization` | Term mapping |
| Export | `/projects/:id/export` | Snapshots + Excel/CSV/JSON/Parquet export |
| Jobs | `/projects/:id/jobs` | Background job history |
| Audit | `/projects/:id/audit` | Full change history |
| Team | `/projects/:id/team` | Members and roles |
| Settings | `/projects/:id/settings` | Project configuration |
| Profile | `/profile` | User profile, avatar upload |
