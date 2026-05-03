from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

import numpy as np
from ultralytics import YOLO


@dataclass(frozen=True)
class Detection:
    xyxy: tuple[float, float, float, float]
    conf: float

    @property
    def center(self) -> tuple[int, int]:
        x1, y1, x2, y2 = self.xyxy
        return (int((x1 + x2) / 2), int((y1 + y2) / 2))


class YoloPersonDetector:
    # COCO person class id
    PERSON_CLASS_ID = 0

    def __init__(self, model_path: str, device: str = "cpu", conf: float = 0.35, iou: float = 0.45):
        self._model = YOLO(model_path)
        self._device = device
        self._conf = conf
        self._iou = iou

    def detect(self, frame_bgr: "np.ndarray") -> list[Detection]:
        # Ultralytics accepts BGR numpy images.
        results = self._model.predict(
            source=frame_bgr,
            device=self._device,
            conf=self._conf,
            iou=self._iou,
            verbose=False,
        )
        if not results:
            return []

        r0 = results[0]
        if r0.boxes is None or len(r0.boxes) == 0:
            return []

        boxes = r0.boxes
        cls = boxes.cls.detach().cpu().numpy().astype(int)
        confs = boxes.conf.detach().cpu().numpy().astype(float)
        xyxy = boxes.xyxy.detach().cpu().numpy().astype(float)

        dets: list[Detection] = []
        for c, cf, bb in zip(cls, confs, xyxy):
            if int(c) != self.PERSON_CLASS_ID:
                continue
            x1, y1, x2, y2 = (float(bb[0]), float(bb[1]), float(bb[2]), float(bb[3]))
            dets.append(Detection(xyxy=(x1, y1, x2, y2), conf=float(cf)))
        return dets

    @staticmethod
    def centers(dets: Iterable[Detection]) -> list[tuple[int, int]]:
        return [d.center for d in dets]
