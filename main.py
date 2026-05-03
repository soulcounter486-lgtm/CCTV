from __future__ import annotations

import time

import cv2
import numpy as np
from ultralytics import YOLO

from config import load_config
from kitchen_activity.rtsp import RtspConfig
from kitchen_activity.rtsp import RtspStream
from kitchen_activity.supabase_sink import SupabaseConfig
from kitchen_activity.supabase_sink import SupabaseSink
from kitchen_activity.zones import load_zones


def _mask_from_polygon(w: int, h: int, poly_xy: np.ndarray) -> np.ndarray:
    mask = np.zeros((h, w), dtype=np.uint8)
    cv2.fillPoly(mask, [poly_xy], 255)
    return mask


def _mean_absdiff_in_mask(prev_gray: np.ndarray, gray: np.ndarray, mask: np.ndarray) -> float:
    diff = cv2.absdiff(prev_gray, gray)
    # diff is uint8 [0..255], mean over mask area
    mean_val = cv2.mean(diff, mask=mask)[0]
    return float(mean_val)


def main() -> None:
    c = load_config()
    if not c.rtsp_url:
        raise ValueError("RTSP_URL is empty in .env")

    model = YOLO(c.yolo_model)
    sink = SupabaseSink(SupabaseConfig(url=c.supabase_url, key=c.supabase_key, table=c.supabase_table))

    stream = RtspStream(
        RtspConfig(
            url=c.rtsp_url,
            reconnect_backoff_seconds=c.reconnect_backoff_seconds,
            rtsp_transport=c.rtsp_transport,
            ffmpeg_read_timeout_ms=c.rtsp_read_timeout_ms,
        )
    )

    zones = load_zones(c.zones_config_path)
    zone_names = [z.name for z in zones]
    zone_thresholds: dict[str, float] = {
        z.name: (z.motion_active_threshold if z.motion_active_threshold is not None else c.motion_active_threshold)
        for z in zones
    }

    window_start = time.time()
    motion_sum_by_zone: dict[str, float] = {zn: 0.0 for zn in zone_names}
    motion_samples_by_zone: dict[str, int] = {zn: 0 for zn in zone_names}

    prev_gray = None
    zone_masks: dict[str, np.ndarray] | None = None

    try:
        for _, frame in stream.frames():
            h, w = frame.shape[:2]
            if zone_masks is None:
                zone_masks = {}
                for z in zones:
                    poly_xy = np.array(z.polygon, dtype=np.int32)
                    zone_masks[z.name] = _mask_from_polygon(w, h, poly_xy)

            # YOLO person detection (COCO person class=0)
            results = model.predict(
                source=frame,
                device=c.device,
                conf=c.conf_thres,
                iou=c.iou_thres,
                verbose=False,
            )
            r0 = results[0] if results else None

            # Build a dynamic mask = ROI polygon AND union of person bboxes
            # (movement score only counts where a person exists inside ROI)
            person_mask = np.zeros((h, w), dtype=np.uint8)
            if r0 is not None and r0.boxes is not None and len(r0.boxes) > 0:
                cls = r0.boxes.cls.detach().cpu().numpy().astype(int)
                xyxy = r0.boxes.xyxy.detach().cpu().numpy().astype(int)
                for c_id, bb in zip(cls, xyxy):
                    if int(c_id) != 0:
                        continue
                    x1, y1, x2, y2 = int(bb[0]), int(bb[1]), int(bb[2]), int(bb[3])
                    x1 = max(0, min(w - 1, x1))
                    x2 = max(0, min(w - 1, x2))
                    y1 = max(0, min(h - 1, y1))
                    y2 = max(0, min(h - 1, y2))
                    if x2 <= x1 or y2 <= y1:
                        continue
                    person_mask[y1:y2, x1:x2] = 255

            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            gray = cv2.GaussianBlur(gray, (5, 5), 0)

            if prev_gray is not None:
                assert zone_masks is not None
                for zone_name, zone_mask in zone_masks.items():
                    motion_mask = cv2.bitwise_and(zone_mask, person_mask)

                    if cv2.countNonZero(motion_mask) > 0:
                        score = _mean_absdiff_in_mask(prev_gray, gray, motion_mask)
                        motion_sum_by_zone[zone_name] = motion_sum_by_zone.get(zone_name, 0.0) + float(score)
                        motion_samples_by_zone[zone_name] = motion_samples_by_zone.get(zone_name, 0) + 1

            prev_gray = gray

            now = time.time()
            if now - window_start >= c.aggregation_seconds:
                for zone_name in zone_names:
                    samples = motion_samples_by_zone.get(zone_name, 0)
                    total = motion_sum_by_zone.get(zone_name, 0.0)
                    mean_motion = (total / samples) if samples > 0 else 0.0
                    # If no person was seen in this zone during the window, treat as idle.
                    thr = zone_thresholds.get(zone_name, c.motion_active_threshold)
                    is_active = (samples > 0) and (mean_motion >= thr)
                    sink.insert_activity(zone_name=zone_name, is_active=is_active, motion_score=mean_motion)

                window_start = now
                motion_sum_by_zone = {zn: 0.0 for zn in zone_names}
                motion_samples_by_zone = {zn: 0 for zn in zone_names}
    finally:
        stream.close()


if __name__ == "__main__":
    main()
