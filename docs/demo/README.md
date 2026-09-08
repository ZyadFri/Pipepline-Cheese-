# App walkthrough video

`app_walkthrough.mp4` is an automated, captioned tour of every major page in
the platform — real screenshots of the live app with real data (project 43 /
paper 30 in the dev database), not mockups. There's no spoken narration
(no text-to-speech was available when this was generated); each page has a
short on-screen caption explaining what it does instead. For a full spoken
narration script covering the same ground in more depth, see
`../demo_video_script.md` — read it aloud over a screen recording (OBS, Loom,
QuickTime) for a proper voiced version.

## How it was built

1. **`capture_demo_screenshots.cjs`** — drives a real Chrome instance via
   Puppeteer, authenticated by injecting a JWT into `localStorage` (same
   shape zustand's `persist` middleware writes), and screenshots every route
   listed in its `PAGES` array. See the file's header comment for the exact
   env vars and setup (`npm install --no-save puppeteer-core` in
   `pipeline/frontend`, both dev servers running, a valid JWT for a user with
   real project data).
2. **`build_demo_video.py`** — reads the screenshots, burns a caption bar
   (page number, title, one-sentence explanation) onto each frame with
   Pillow, and assembles them into an MP4 slideshow (~4.5s per page) with
   ffmpeg (via `imageio-ffmpeg`, which bundles its own binary — no system
   ffmpeg install needed).

To regenerate after a UI change: re-run both scripts in order. Neither
`shots/` nor `shots_captioned/` (the intermediate PNGs) are committed —
only the final video.
