import subprocess
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import imageio_ffmpeg

# Run capture_demo_screenshots.cjs first (see that file's header) to
# populate SHOTS_DIR, then run this script to caption each frame and
# assemble them into the walkthrough video. Requires `pip install
# imageio-ffmpeg pillow` (imageio-ffmpeg bundles a static ffmpeg binary, so
# no system ffmpeg install is needed).
HERE = Path(__file__).resolve().parent
SHOTS_DIR = HERE / "shots"
OUT_DIR = HERE / "shots_captioned"
OUT_DIR.mkdir(exist_ok=True)
VIDEO_OUT = HERE / "app_walkthrough.mp4"

PAGES = [
    ("00_landing_signed_out", "Landing Page",
     "The marketing homepage for signed-out visitors: turn cheese research papers into structured, validated evidence."),
    ("01_login", "Sign In",
     "Standard authenticated login. Every project supports multiple team members with different roles."),
    ("02_dashboard", "Dashboard",
     "Every research project you belong to, shown as a card with a live paper count. Projects are the top-level container for everything."),
    ("03_project_home", "Project Home — Paper Library",
     "Every uploaded PDF lives here with a live thumbnail and real extraction progress, plus a pipeline overview and recent activity."),
    ("04_paper_overview", "Paper Overview",
     "An AI-generated summary of the paper, a mini-chat scoped to this paper's text, and the full gallery of tables, charts and figures found."),
    ("05_paper_docling", "Evidence",
     "Every table, chart, and figure extracted from the PDF, filterable by type, each traceable back to its exact page."),
    ("06_paper_charts", "Charts",
     "Scientific charts are digitized back into data tables: the original figure next to the reconstructed values, with validation checks."),
    ("07_paper_extract_data", "Extract Data",
     "Choose an extraction engine, AI-based or deterministic rule-based, and turn the paper's evidence into structured experiments."),
    ("08_paper_review", "Review",
     "Every extracted measurement is queued for human review before becoming permanent data: approve, edit, or reject, with confidence scoring."),
    ("09_paper_database", "Database — this paper",
     "The structured dataset for one paper. Columns adapt to what that paper actually reported, plus a duplicate-experiment detector."),
    ("10_project_studies", "Studies",
     "The canonical scientific data model, browsable directly — one row per source paper."),
    ("11_project_experiments", "Experiments",
     "Every distinct set of experimental conditions extracted across the whole project, in one place."),
    ("12_project_treatments", "Treatments",
     "Every individual treatment arm — control and each tested intervention — with ingredient, concentration and method."),
    ("13_project_normalization", "Normalization",
     "Maps inconsistent terminology across papers to one canonical term, so analysis isn't fooled by spelling variance."),
    ("14_project_export", "Export",
     "Push the reviewed dataset out as Excel, CSV, JSON, or Parquet for downstream analysis."),
    ("15_project_jobs", "Jobs",
     "An operational view of every background extraction job: real progress, real status, real errors."),
    ("16_project_audit", "Audit History",
     "A full, permanent change log of every edit and review decision across the project."),
    ("17_project_team", "Team",
     "Manage who has access to a project and their role — owner, admin, reviewer, analyst, or viewer."),
    ("18_project_settings", "Project Settings",
     "Project-level configuration, including project deletion."),
    ("19_profile", "User Profile",
     "Every user gets a full profile: an uploaded photo, job title, organization, and bio, shown across the platform."),
]

W, H = 1600, 1000
BAR_H = 140
CANVAS_H = H + BAR_H

try:
    title_font = ImageFont.truetype("segoeuib.ttf", 34)
    body_font = ImageFont.truetype("segoeui.ttf", 22)
except Exception:
    title_font = ImageFont.load_default()
    body_font = ImageFont.load_default()

MAROON = (139, 23, 48)
DARKTXT = (30, 24, 27)
BODYTXT = (90, 80, 85)


def wrap(text, font, max_width, draw):
    words = text.split()
    lines, cur = [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if draw.textlength(trial, font=font) <= max_width:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


frame_paths = []
for i, (name, title, caption) in enumerate(PAGES):
    src = SHOTS_DIR / f"{name}.png"
    img = Image.open(src).convert("RGB")
    canvas = Image.new("RGB", (W, CANVAS_H), (255, 253, 253))
    canvas.paste(img, (0, 0))
    draw = ImageDraw.Draw(canvas)
    draw.rectangle([0, H, W, CANVAS_H], fill=(255, 255, 255))
    draw.line([0, H, W, H], fill=(234, 221, 225), width=2)

    pad = 34
    draw.text((pad, H + 18), f"{i+1:02d} / {len(PAGES)}", font=body_font, fill=MAROON)
    draw.text((pad, H + 44), title, font=title_font, fill=DARKTXT)
    lines = wrap(caption, body_font, W - 2 * pad, draw)
    y = H + 88
    for line in lines[:2]:
        draw.text((pad, y), line, font=body_font, fill=BODYTXT)
        y += 26

    out_path = OUT_DIR / f"{i:02d}.png"
    canvas.save(out_path)
    frame_paths.append(out_path)

print(f"Captioned {len(frame_paths)} frames -> {OUT_DIR}")

# Build an ffmpeg concat file: each frame held for 4.5s, last frame held a bit longer.
concat_file = OUT_DIR / "concat.txt"
DURATION = 4.5
with open(concat_file, "w") as f:
    for p in frame_paths:
        f.write(f"file '{p.as_posix()}'\n")
        f.write(f"duration {DURATION}\n")
    # ffmpeg concat demuxer needs the last file repeated without a duration line
    f.write(f"file '{frame_paths[-1].as_posix()}'\n")

ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
cmd = [
    ffmpeg, "-y",
    "-f", "concat", "-safe", "0", "-i", str(concat_file),
    "-vf", "fps=24,format=yuv420p",
    "-c:v", "libx264", "-crf", "23", "-preset", "medium",
    str(VIDEO_OUT),
]
print("Running:", " ".join(cmd))
result = subprocess.run(cmd, capture_output=True, text=True)
print(result.returncode)
print(result.stderr[-3000:])
