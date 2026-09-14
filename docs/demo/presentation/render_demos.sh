#!/usr/bin/env bash
# Render the final presentation deliverables from the raw Playwright webm
# masters (1920x1080, ~25fps -- Playwright's own hard cap, see
# DEMO_RECORDING_NOTES.md). Produces, for each of Video 1 and Video 2:
#   - a 1080p H.264 High Profile / yuv420p PowerPoint-friendly MP4 (native
#     resolution, just re-encoded to a broadly-compatible profile+bitrate)
#   - a 4K MP4 upscaled from the same 1080p master via a high-quality lanczos
#     scale, per the brief's own fallback clause ("if 4K60 not feasible,
#     upscale afterward -- never sacrifice UI smoothness for nominal
#     resolution").
#
# Usage: ./render_demos.sh <raw_video1.webm> <raw_video2.webm>
set -euo pipefail

FF="/c/Users/lenovo/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0.1-full_build/bin/ffmpeg.exe"

V1_RAW="${1:?usage: render_demos.sh <video1.webm> <video2.webm>}"
V2_RAW="${2:?usage: render_demos.sh <video1.webm> <video2.webm>}"

encode_1080p() {
  local src="$1" dst="$2"
  "$FF" -y -i "$src" \
    -vf "scale=1920:1080:flags=lanczos,setsar=1" \
    -c:v libx264 -profile:v high -pix_fmt yuv420p -preset slow \
    -b:v 16M -maxrate 20M -bufsize 32M \
    -movflags +faststart -an \
    "$dst"
}

encode_4k_upscale() {
  local src="$1" dst="$2"
  "$FF" -y -i "$src" \
    -vf "scale=3840:2160:flags=lanczos,setsar=1" \
    -c:v libx264 -profile:v high -pix_fmt yuv420p -preset slow \
    -b:v 45M -maxrate 55M -bufsize 80M \
    -movflags +faststart -an \
    "$dst"
}

echo "== Video 1: 1080p =="
encode_1080p "$V1_RAW" "presentation_demo_01_upload_and_extraction_1080p.mp4"
echo "== Video 1: 4K (upscaled) =="
encode_4k_upscale "$V1_RAW" "presentation_demo_01_upload_and_extraction_4k.mp4"

echo "== Video 2: 1080p =="
encode_1080p "$V2_RAW" "presentation_demo_02_evidence_to_database_1080p.mp4"
echo "== Video 2: 4K (upscaled) =="
encode_4k_upscale "$V2_RAW" "presentation_demo_02_evidence_to_database_4k.mp4"

echo "Done."
