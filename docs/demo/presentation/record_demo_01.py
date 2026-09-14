"""
Video 1 — Landing -> Login -> Dashboard -> Project -> real PDF upload ->
extraction begins.

Usage: python record_demo_01.py
Requires: backend on :8000, frontend on :5173, the researcher@mcgill.ca demo
account and its project already seeded (see DEMO_RECORDING_NOTES.md).
"""
import base64
import json
import sys
import time

from playwright.sync_api import sync_playwright

sys.path.insert(0, ".")
from record_helpers import SceneTimer, eased_click_center, eased_move, smooth_scroll_to, type_into

FRONTEND = "http://localhost:5173"
DEMO_EMAIL = "researcher@mcgill.ca"
DEMO_PASSWORD = "McGillDemo2026!"  # seeded demo-only account, not a real credential
PDF_PATH = r"C:\Users\lenovo\Desktop\Mcgill-Canada\pipeline\backend\uploads\44\97240b46a9c4_CHE 0002-BeeVenon.pdf"
PDF_FILENAME = "CHE 0002-BeeVenon.pdf"
OUT_DIR = "raw_video1"
VIEWPORT = {"width": 1920, "height": 1080}


def drop_pdf_file(page, dropzone_selector: str, file_path: str, filename: str) -> None:
    """Real drag-and-drop simulation: a genuine File (real PDF bytes) carried
    by a synthetic DataTransfer dispatched as dragenter/dragover/drop on the
    react-dropzone root. The upload itself is 100% real — only the low-level
    OS drag gesture is simulated, which is the standard way to drive an
    HTML5 drop zone from outside a real desktop drag."""
    with open(file_path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("ascii")
    page.eval_on_selector(
        dropzone_selector,
        """
        (el, {b64, filename}) => {
            const byteChars = atob(b64);
            const bytes = new Uint8Array(byteChars.length);
            for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
            const file = new File([bytes], filename, { type: 'application/pdf' });
            const dt = new DataTransfer();
            dt.items.add(file);
            const opts = { bubbles: true, cancelable: true, dataTransfer: dt };
            el.dispatchEvent(new DragEvent('dragenter', opts));
            el.dispatchEvent(new DragEvent('dragover', opts));
            el.dispatchEvent(new DragEvent('drop', opts));
        }
        """,
        {"b64": b64, "filename": filename},
    )


def main():
    timer = SceneTimer()
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(
            viewport=VIEWPORT,
            record_video_dir=OUT_DIR,
            record_video_size=VIEWPORT,
        )
        page = ctx.new_page()

        # ---------------- Scene 1: Landing ----------------
        timer.start("landing")
        page.goto(FRONTEND + "/", wait_until="load")
        page.wait_for_timeout(900)
        smooth_scroll_to(page, 650, 1100)
        smooth_scroll_to(page, 1500, 1200)
        smooth_scroll_to(page, 2400, 1200)
        page.wait_for_timeout(500)
        smooth_scroll_to(page, 0, 900)
        page.wait_for_timeout(400)
        timer.end()

        # ---------------- Scene 2: Login ----------------
        timer.start("login")
        eased_click_center(page, page.get_by_role("link", name="Log in").first)
        page.wait_for_timeout(500)
        type_into(page, 'input[type="email"]', DEMO_EMAIL, char_delay_ms=45)
        page.wait_for_timeout(300)
        type_into(page, 'input[type="password"]', DEMO_PASSWORD, char_delay_ms=45)
        page.wait_for_timeout(400)
        eased_click_center(page, page.locator('button[type="submit"]'))
        page.wait_for_url("**/", timeout=15000)
        page.wait_for_timeout(900)
        timer.end()

        # ---------------- Scene 3: Dashboard ----------------
        timer.start("dashboard")
        page.wait_for_timeout(1200)
        smooth_scroll_to(page, 500, 900)
        page.wait_for_timeout(800)
        smooth_scroll_to(page, 0, 700)
        timer.end()

        # ---------------- Scene 4: Open project ----------------
        timer.start("open_project")
        project_card = page.get_by_text("Cheese Shelf-Life Research", exact=False).first
        eased_click_center(page, project_card)
        page.wait_for_timeout(1400)
        timer.end()

        # ---------------- Scene 5: Upload real PDF ----------------
        timer.start("upload")
        upload_link = page.get_by_role("link", name="Upload your first paper")
        if upload_link.count() == 0:
            upload_link = page.get_by_role("link", name="Upload PDFs").first
        eased_click_center(page, upload_link)
        page.wait_for_url("**/upload", timeout=10000)
        page.wait_for_timeout(700)

        dropzone = page.locator("input[type=file]").locator("..")
        eased_move(page, 960, 300, steps=15)
        page.wait_for_timeout(300)
        eased_move(page, 960, 620, steps=25)
        page.wait_for_timeout(250)
        drop_pdf_file(page, "input[type=file]", PDF_PATH, PDF_FILENAME)
        page.wait_for_timeout(1200)

        submit_btn = page.get_by_role("button", name="Standard extraction", exact=True)
        eased_click_center(page, submit_btn)
        page.wait_for_url("**/overview", timeout=20000)
        page.wait_for_timeout(1500)
        timer.end()

        # ---------------- Scene 6: Extraction begins ----------------
        timer.start("extraction_begins")
        for _ in range(6):
            page.wait_for_timeout(1500)
        timer.end()

        video_path = page.video.path()
        ctx.close()
        browser.close()

        print("\n=== VIDEO 1 TIMING ===")
        print(timer.report())
        print("raw video:", video_path)

        with open("video1_timing.json", "w") as f:
            json.dump({"log": timer.log, "video_path": video_path}, f, indent=2)


if __name__ == "__main__":
    main()
