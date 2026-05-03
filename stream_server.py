"""
stream_server.py — Lightweight MJPEG HTTP server for the dashboard.

Reads frames from the RTSP camera and serves them as MJPEG over HTTP so the
Next.js dashboard can display a live feed in the Zone Monitor section.

Usage:
    python stream_server.py            # streams on http://0.0.0.0:8090/stream
    python stream_server.py --port 8090

Then set the dashboard env var:
    NEXT_PUBLIC_STREAM_URL=http://localhost:8090/stream

The dashboard <img src="..."> tag points to this URL.
"""
from __future__ import annotations

import argparse
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

import cv2
import numpy as np
from dotenv import load_dotenv

load_dotenv(override=False)

# ── Shared frame state ────────────────────────────────────────────────────────

_frame_lock = threading.Lock()
_latest_jpeg: bytes | None = None


def _capture_loop(rtsp_url: str, transport: str, timeout_ms: int, fps_limit: float) -> None:
    """Background thread: continuously reads RTSP frames."""
    global _latest_jpeg

    transport = transport.strip().lower()
    cap_opts = f"rtsp_transport;{transport};stimeout;{timeout_ms * 1000}"
    os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = cap_opts
    os.environ["OPENCV_FFMPEG_READ_TIMEOUT"] = str(timeout_ms)

    backoff = 2.0
    interval = 1.0 / fps_limit

    while True:
        cap = cv2.VideoCapture(rtsp_url, cv2.CAP_FFMPEG)
        if not cap.isOpened():
            print(f"[stream] Cannot open {rtsp_url}, retrying in {backoff}s …")
            time.sleep(backoff)
            continue

        print(f"[stream] Connected to RTSP stream")
        t_next = time.monotonic()

        while True:
            ok, frame = cap.read()
            if not ok or frame is None:
                print("[stream] Frame read failed, reconnecting …")
                break

            now = time.monotonic()
            if now < t_next:
                time.sleep(t_next - now)
            t_next = time.monotonic() + interval

            _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
            with _frame_lock:
                _latest_jpeg = bytes(buf)

        cap.release()
        time.sleep(backoff)


# ── HTTP handler ──────────────────────────────────────────────────────────────

BOUNDARY = b"--mjpeg_boundary"


class MjpegHandler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass  # suppress per-request logs

    def do_GET(self):
        if self.path not in ("/stream", "/stream.mjpg"):
            self.send_response(404)
            self.end_headers()
            return

        self.send_response(200)
        self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=mjpeg_boundary")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

        try:
            while True:
                with _frame_lock:
                    jpeg = _latest_jpeg

                if jpeg is None:
                    time.sleep(0.1)
                    continue

                frame_header = (
                    BOUNDARY + b"\r\n"
                    b"Content-Type: image/jpeg\r\n"
                    b"Content-Length: " + str(len(jpeg)).encode() + b"\r\n\r\n"
                )
                self.wfile.write(frame_header + jpeg + b"\r\n")
                self.wfile.flush()
                time.sleep(0.033)  # ~30 fps max send rate
        except (BrokenPipeError, ConnectionResetError):
            pass


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="MJPEG stream server")
    parser.add_argument("--port", type=int, default=8090, help="HTTP port (default 8090)")
    parser.add_argument("--fps", type=float, default=10.0, help="Max FPS to capture (default 10)")
    args = parser.parse_args()

    rtsp_url = os.getenv("RTSP_URL", "")
    if not rtsp_url:
        sys.exit("[stream] RTSP_URL is not set in .env")

    transport = os.getenv("RTSP_TRANSPORT", "tcp")
    timeout_ms = int(os.getenv("RTSP_READ_TIMEOUT_MS", "15000"))

    # Start capture thread
    t = threading.Thread(
        target=_capture_loop,
        args=(rtsp_url, transport, timeout_ms, args.fps),
        daemon=True,
    )
    t.start()

    server = HTTPServer(("0.0.0.0", args.port), MjpegHandler)
    print(f"[stream] MJPEG server running on http://0.0.0.0:{args.port}/stream")
    print(f"[stream] Set in dashboard/.env.local:")
    print(f"[stream]   NEXT_PUBLIC_STREAM_URL=http://localhost:{args.port}/stream")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[stream] Stopped.")


if __name__ == "__main__":
    main()
