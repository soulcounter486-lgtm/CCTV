from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Iterator

import cv2


@dataclass(frozen=True)
class RtspConfig:
    url: str
    reconnect_backoff_seconds: float = 2.0
    buffer_size: int = 1


class RtspStream:
    def __init__(self, cfg: RtspConfig):
        self._cfg = cfg
        self._cap: cv2.VideoCapture | None = None

    def _open(self) -> cv2.VideoCapture:
        cap = cv2.VideoCapture(self._cfg.url, cv2.CAP_FFMPEG)
        # Try to reduce latency.
        try:
            cap.set(cv2.CAP_PROP_BUFFERSIZE, float(self._cfg.buffer_size))
        except Exception:
            pass
        return cap

    def _ensure_open(self) -> cv2.VideoCapture:
        if self._cap is not None and self._cap.isOpened():
            return self._cap
        if self._cap is not None:
            try:
                self._cap.release()
            except Exception:
                pass
        self._cap = self._open()
        return self._cap

    def frames(self) -> Iterator[tuple[float, "cv2.Mat"]]:
        if not self._cfg.url:
            raise ValueError("RTSP url is empty. Set RTSP_URL in .env")

        while True:
            cap = self._ensure_open()
            ok, frame = cap.read()
            if not ok or frame is None:
                try:
                    cap.release()
                except Exception:
                    pass
                self._cap = None
                time.sleep(self._cfg.reconnect_backoff_seconds)
                continue
            yield (time.time(), frame)

    def close(self) -> None:
        if self._cap is not None:
            try:
                self._cap.release()
            except Exception:
                pass
            self._cap = None
