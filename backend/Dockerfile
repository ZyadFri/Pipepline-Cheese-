# Build context is the repository root (pipeline/), not backend/, so this
# image can include docs/demo/app_walkthrough.mp4 at the same relative
# position main.py already expects (parents[2]/docs/demo/...) without any
# code changes:  build with `docker build -f backend/Dockerfile .`
FROM python:3.11-slim

WORKDIR /app

# opencv-python (a Docling dependency) needs libGL/libglib at runtime on
# slim/minimal base images, or `import cv2` fails with "libGL.so.1: cannot
# open shared object file". curl is only for the container health probe.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 libglib2.0-0 curl \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/app ./backend/app
COPY docs ./docs

RUN mkdir -p backend/uploads

WORKDIR /app/backend

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8000}/api/health || exit 1

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
