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
When the RTSP camera is offline, a grey "Camera Offline" placeholder is served
so the browser <img> tag always receives valid JPEG data (never hangs blank).

Endpoints:
    GET /stream    — MJPEG multipart stream
    GET /status    — JSON: {"connected": bool, "url": str, "fps": float}
"""
from __future__ import annotations

import argparse
import json
import os
import socket
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
_is_connected = False
_fps_actual = 0.0


def _make_offline_frame(message: str = "카메라 오프라인 / Camera Offline") -> bytes:
    """Create a dark-grey placeholder JPEG shown when RTSP is unavailable."""
    h, w = 360, 640
    img = np.full((h, w, 3), 30, dtype=np.uint8)
    # Camera icon outline
    cv2.rectangle(img, (w // 2 - 60, h // 2 - 45), (w // 2 + 60, h // 2 + 10), (80, 80, 80), 2)
    cv2.circle(img, (w // 2, h // 2 - 18), 15, (80, 80, 80), 2)
    # Status text
    cv2.putText(img, message, (w // 2 - 160, h // 2 + 45),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (140, 140, 140), 1, cv2.LINE_AA)
    cv2.putText(img, "RTSP connecting...", (w // 2 - 95, h // 2 + 75),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (90, 90, 90), 1, cv2.LINE_AA)
    _, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 70])
    return bytes(buf)


_OFFLINE_FRAME = _make_offline_frame()


def _try_rtsp_ips(base_url: str) -> list[str]:
    """
    If the configured RTSP host is unreachable, scan the same /24 subnet for
    hosts that have port 554 open and return alternative candidate URLs.
    """
    try:
        import urllib.parse
        parsed = urllib.parse.urlparse(base_url)
        host = parsed.hostname or ""
        if not host:
            return []

        # Check if original IP has port 554 open
        s = socket.socket()
        s.settimeout(2)
        orig_ok = s.connect_ex((host, 554)) == 0
        s.close()
        if orig_ok:
            return []  # original is fine, no need to scan

        # Derive /24 subnet
        parts = host.rsplit(".", 1)
        if len(parts) != 2:
            return []
        subnet_prefix = parts[0]

        print(f"[stream] {host}:554 unreachable — scanning {subnet_prefix}.x for RTSP…")
        found = []

        def _check(i: int) -> None:
            ip = f"{subnet_prefix}.{i}"
            if ip == host:
                return
            sock = socket.socket()
            sock.settimeout(0.8)
            if sock.connect_ex((ip, 554)) == 0:
                found.append(ip)
            sock.close()

        threads = [threading.Thread(target=_check, args=(i,), daemon=True) for i in range(1, 255)]
        for th in threads:
            th.start()
        for th in threads:
            th.join(timeout=2)

        if found:
            print(f"[stream] Found RTSP hosts: {found}")
            # Build candidate URLs with discovered IPs
            candidates = []
            for ip in sorted(found):
                new_url = base_url.replace(f"@{host}:", f"@{ip}:")
                candidates.append(new_url)
            return candidates

    except Exception as e:
        print(f"[stream] IP scan error: {e}")
    return []


def _capture_loop(rtsp_url: str, transport: str, timeout_ms: int, fps_limit: float) -> None:
    """Background thread: continuously reads RTSP frames."""
    global _latest_jpeg, _is_connected, _fps_actual

    transport = transport.strip().lower()

    backoff = 3.0
    interval = 1.0 / fps_limit
    candidate_urls = [rtsp_url]  # may expand after first failure

    while True:
        for url in candidate_urls:
            cap_opts = f"rtsp_transport;{transport};stimeout;{timeout_ms * 1000}"
            os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = cap_opts
            os.environ["OPENCV_FFMPEG_READ_TIMEOUT"] = str(timeout_ms)

            cap = cv2.VideoCapture(url, cv2.CAP_FFMPEG)
            if not cap.isOpened():
                cap.release()
                continue

            print(f"[stream] Connected → {url}")
            _is_connected = True
            t_next = time.monotonic()
            fps_counter = 0
            fps_t0 = time.monotonic()

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

                fps_counter += 1
                elapsed = time.monotonic() - fps_t0
                if elapsed >= 5.0:
                    _fps_actual = fps_counter / elapsed
                    fps_counter = 0
                    fps_t0 = time.monotonic()

            cap.release()
            _is_connected = False
            break  # restart outer loop to re-check all candidates

        # All candidates failed — scan subnet once for alternatives
        if len(candidate_urls) == 1:
            extra = _try_rtsp_ips(rtsp_url)
            if extra:
                candidate_urls = [rtsp_url] + extra

        # Ensure offline placeholder is shown while reconnecting
        with _frame_lock:
            _latest_jpeg = None  # will cause placeholder to be served

        print(f"[stream] Retrying in {backoff}s …")
        time.sleep(backoff)
        backoff = min(backoff * 1.5, 30.0)


# ── HTTP handler ──────────────────────────────────────────────────────────────

BOUNDARY = b"--mjpeg_boundary"


class MjpegHandler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass  # suppress per-request logs

    def do_GET(self):
        if self.path == "/status":
            self._serve_status()
        elif self.path in ("/stream", "/stream.mjpg"):
            self._serve_mjpeg()
        else:
            self.send_response(404)
            self.end_headers()

    def _serve_status(self) -> None:
        body = json.dumps({
            "connected": _is_connected,
            "fps": round(_fps_actual, 1),
        }).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _serve_mjpeg(self) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=mjpeg_boundary")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

        try:
            while True:
                with _frame_lock:
                    jpeg = _latest_jpeg

                # Serve offline placeholder when RTSP has no frames yet
                frame_data = jpeg if jpeg is not None else _OFFLINE_FRAME

                frame_header = (
                    BOUNDARY + b"\r\n"
                    b"Content-Type: image/jpeg\r\n"
                    b"Content-Length: " + str(len(frame_data)).encode() + b"\r\n\r\n"
                )
                self.wfile.write(frame_header + frame_data + b"\r\n")
                self.wfile.flush()

                # Slower refresh when offline to save CPU
                time.sleep(0.033 if jpeg is not None else 1.0)

        except (BrokenPipeError, ConnectionResetError, OSError):
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

    print(f"[stream] RTSP target : {rtsp_url}")
    print(f"[stream] Transport   : {transport}")
    print(f"[stream] Timeout     : {timeout_ms}ms")

    # Start capture thread
    t = threading.Thread(
        target=_capture_loop,
        args=(rtsp_url, transport, timeout_ms, args.fps),
        daemon=True,
    )
    t.start()

    server = HTTPServer(("0.0.0.0", args.port), MjpegHandler)
    print(f"[stream] MJPEG server → http://0.0.0.0:{args.port}/stream")
    print(f"[stream] Status API  → http://localhost:{args.port}/status")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[stream] Stopped.")


if __name__ == "__main__":
    main()
