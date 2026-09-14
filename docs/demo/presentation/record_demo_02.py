"""
Video 2 -- Evidence workspace -> structured extraction -> researcher review ->
Research Structure -> Scientific Database -> Export.

Continues directly from record_demo_01.py: same real seeded account
(researcher@mcgill.ca) and the same real project/paper (id 46 / 33), which by
the time this script runs has already gone through real standard-mode Docling
extraction AND real LLM-engine extraction (see DEMO_RECORDING_NOTES.md for the
exact promotion counts). No login scene here -- continuity with Video 1's last
frame (paper overview, mid-analysis) is achieved by opening on the same
paper's Overview tab, now completed, before moving into Evidence.

Usage: python record_demo_02.py
Requires: backend on :8000, frontend on :5173, and the project 46 / paper 33
LLM extraction already completed (record_demo_01.py + the LLM-extract step
documented in DEMO_RECORDING_NOTES.md).
"""
import json
import sys
import urllib.request

from playwright.sync_api import sync_playwright

sys.path.insert(0, ".")
from record_helpers import SceneTimer, eased_click_center, eased_move, smooth_scroll_to

FRONTEND = "http://localhost:5173"
BACKEND = "http://localhost:8000"
DEMO_EMAIL = "researcher@mcgill.ca"
DEMO_PASSWORD = "McGillDemo2026!"  # seeded demo-only account, not a real credential
PROJECT_ID = 46
PAPER_ID = 33
OUT_DIR = "raw_video2"
VIEWPORT = {"width": 1920, "height": 1080}


def get_token() -> str:
    req = urllib.request.Request(
        BACKEND + "/api/auth/login",
        data=json.dumps({"email": DEMO_EMAIL, "password": DEMO_PASSWORD}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        return json.load(resp)["access_token"]


def seed_auth(page, token: str) -> None:
    """Pre-seed the zustand auth store (localStorage key 'food-research-auth')
    so the app opens already authenticated -- Video 2 is a continuation, not
    a second login scene."""
    payload = json.dumps({
        "state": {
            "token": token,
            "user": {"id": 30, "email": DEMO_EMAIL, "full_name": "Researcher"},
        },
        "version": 0,
    })
    page.add_init_script(
        f"window.localStorage.setItem('food-research-auth', {json.dumps(payload)});"
    )


def main():
    token = get_token()
    timer = SceneTimer()
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(
            viewport=VIEWPORT,
            record_video_dir=OUT_DIR,
            record_video_size=VIEWPORT,
        )
        page = ctx.new_page()
        seed_auth(page, token)

        base = f"{FRONTEND}/projects/{PROJECT_ID}/papers/{PAPER_ID}"

        # ---------------- Scene 1a: resume on Overview (continuity bridge) ----------------
        timer.start("resume_overview")
        page.goto(base + "/overview", wait_until="load")
        page.wait_for_timeout(1600)
        timer.end()

        # ---------------- Scene 1b: Evidence workspace ----------------
        timer.start("evidence")
        eased_click_center(page, page.get_by_role("link", name="Evidence", exact=True))
        page.wait_for_timeout(900)
        eased_click_center(page, page.get_by_role("button", name="Tables (", exact=False))
        page.wait_for_timeout(900)
        first_card = page.locator("[class*='cursor-pointer']").first
        eased_click_center(page, first_card)
        page.wait_for_timeout(1600)
        page.keyboard.press("Escape")
        page.wait_for_timeout(500)
        eased_click_center(page, page.get_by_role("button", name="Charts (", exact=False))
        page.wait_for_timeout(900)
        eased_click_center(page, page.get_by_role("button", name="All (", exact=False))
        page.wait_for_timeout(600)
        timer.end()

        # ---------------- Scene 2: Evidence -> structured info ----------------
        timer.start("extract_data")
        eased_click_center(page, page.get_by_role("link", name="Extract data", exact=True))
        page.wait_for_timeout(1200)
        smooth_scroll_to(page, 500, 900)
        page.wait_for_timeout(700)
        smooth_scroll_to(page, 0, 700)
        timer.end()

        # ---------------- Scene 3: Researcher review ----------------
        timer.start("review")
        eased_click_center(page, page.locator("a[href$='/papers/33/review']"))
        page.wait_for_url("**/review", timeout=10000)
        page.wait_for_timeout(1000)
        show_evidence_btn = page.get_by_title("Show evidence").first
        if show_evidence_btn.count() > 0:
            eased_click_center(page, show_evidence_btn)
            page.wait_for_timeout(1200)
        approve_btn = page.get_by_title("Approve").first
        eased_click_center(page, approve_btn)
        page.wait_for_timeout(1200)
        timer.end()

        # ---------------- Scene 4: Research Structure ----------------
        timer.start("research_structure")
        eased_click_center(page, page.get_by_role("link", name="Research Structure", exact=True))
        page.wait_for_url("**/research-structure", timeout=10000)
        page.wait_for_timeout(1200)
        smooth_scroll_to(page, 500, 1000)
        page.wait_for_timeout(700)
        smooth_scroll_to(page, 1100, 1000)
        page.wait_for_timeout(700)
        smooth_scroll_to(page, 0, 900)
        timer.end()

        # ---------------- Scene 5: Scientific database ----------------
        timer.start("database")
        eased_click_center(page, page.get_by_role("link", name="Database", exact=True))
        page.wait_for_url("**/dataset", timeout=10000)
        page.wait_for_timeout(1200)
        smooth_scroll_to(page, 400, 900)
        page.wait_for_timeout(600)
        smooth_scroll_to(page, 0, 700)
        timer.end()

        # ---------------- Scene 6: Export ----------------
        timer.start("export")
        eased_click_center(page, page.get_by_role("button", name="Export", exact=True))
        page.wait_for_timeout(800)
        try:
            with page.expect_download(timeout=15000):
                eased_click_center(page, page.get_by_text("Excel workbook", exact=True))
        except Exception:
            pass
        page.wait_for_timeout(2500)
        timer.end()

        # ---------------- Scene 7: Final closing shot ----------------
        timer.start("closing")
        page.wait_for_timeout(1800)
        timer.end()

        video_path = page.video.path()
        ctx.close()
        browser.close()

        print("\n=== VIDEO 2 TIMING ===")
        print(timer.report())
        print("raw video:", video_path)

        with open("video2_timing.json", "w") as f:
            json.dump({"log": timer.log, "video_path": video_path}, f, indent=2)


if __name__ == "__main__":
    main()
