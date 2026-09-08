# App walkthrough video

`app_walkthrough.mp4` is a real, narrated screen recording of the live application — not a mockup,
not staged data. It shows project "Gouda SHelf life" / paper *CHE 0002 — Bee venom* (Heliyon, 2024)
in the dev database: dashboard, paper overview, Evidence, Extract data, Review (including a real
approve action), Research Structure, and the Scientific Database with its Export menu.

- Resolution: 1920×1080, ~1:49 long.
- Narration: Microsoft Edge neural TTS (`en-US-EricNeural`), generated with `edge-tts`.
- Script: `demo_voiceover_script.md`.
- Captions: `app_walkthrough.vtt` (WebVTT, one cue per scene).

## How it was built

1. Playwright (Python, Chromium) drove the real running app (authenticated via a JWT injected into
   `localStorage`), navigating scene by scene with smooth mouse movement and deliberate on-screen
   dwell time, recording native 1920×1080 video the whole time.
2. `edge-tts` generated one narration clip per scene from the script above.
3. ffmpeg placed each narration clip at its scene's actual (measured) start time in the recording
   with `adelay`, mixed them into one track, applied `loudnorm`, and muxed it against the video.

No intermediate recordings, audio chunks or debug screenshots are committed — only the final
video, script and captions.
