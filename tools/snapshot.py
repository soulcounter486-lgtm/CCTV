"""
tools/snapshot.py — Capture one frame from the RTSP stream and save as JPEG.

Usage:
    python tools/snapshot.py                      # saves to snapshot.jpg
    python tools/snapshot.py --out /tmp/frame.jpg
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
import cv2

load_dotenv(override=False)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="snapshot.jpg", help="Output JPEG path")
    args = parser.parse_args()

    rtsp_url = os.getenv("RTSP_URL", "")
    if not rtsp_url:
        sys.exit("[snapshot] RTSP_URL is not set in .env")

    transport = os.getenv("RTSP_TRANSPORT", "tcp").strip().lower()
    timeout_ms = int(os.getenv("RTSP_READ_TIMEOUT_MS", "15000"))

    cap_opts = f"rtsp_transport;{transport};stimeout;{timeout_ms * 1000}"
    os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = cap_opts
    os.environ["OPENCV_FFMPEG_READ_TIMEOUT"] = str(timeout_ms)

    cap = cv2.VideoCapture(rtsp_url, cv2.CAP_FFMPEG)
    if not cap.isOpened():
        sys.exit(f"[snapshot] Could not open RTSP stream: {rtsp_url}")

    # Skip a few frames to get a clean frame
    for _ in range(5):
        cap.read()

    ok, frame = cap.read()
    cap.release()

    if not ok or frame is None:
        sys.exit("[snapshot] Failed to read frame from stream")

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(out_path), frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
    print(f"[snapshot] Saved {frame.shape[1]}x{frame.shape[0]} → {out_path}")


if __name__ == "__main__":
    main()
