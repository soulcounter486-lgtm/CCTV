from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from kitchen_activity.motion import MotionState
from kitchen_activity.motion import compute_motion_score
from kitchen_activity.yolo_person import YoloPersonDetector
from kitchen_activity.zones import Zone
from kitchen_activity.zones import point_in_polygon


@dataclass(frozen=True)
class FrameResult:
    motion_by_zone: dict[str, float]


class ActivityPipeline:
    def __init__(self, zones: list[Zone], detector: YoloPersonDetector):
        self._zones = zones
        self._detector = detector
        self._motion_state = MotionState(prev_centers={z.name: [] for z in zones})

    def process_frame(self, frame_bgr: "np.ndarray") -> FrameResult:
        dets = self._detector.detect(frame_bgr)
        centers = [d.center for d in dets]

        centers_by_zone: dict[str, list[tuple[int, int]]] = {z.name: [] for z in self._zones}
        for (cx, cy) in centers:
            for z in self._zones:
                if point_in_polygon((cx, cy), z.polygon):
                    centers_by_zone[z.name].append((cx, cy))

        motion_by_zone: dict[str, float] = {}
        for z in self._zones:
            motion_by_zone[z.name] = compute_motion_score(
                state=self._motion_state,
                zone_name=z.name,
                centers_in_zone=centers_by_zone[z.name],
            )
        return FrameResult(motion_by_zone=motion_by_zone)
