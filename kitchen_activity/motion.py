from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass
class MotionState:
    prev_centers: dict[str, list[tuple[int, int]]]


def _avg_min_distance(curr: list[tuple[int, int]], prev: list[tuple[int, int]]) -> float:
    """
    Simple, ID-free motion heuristic:
    For each current center, find nearest previous center distance; average.
    If no prev or no curr -> 0.
    """
    if not curr or not prev:
        return 0.0
    prev_np = np.array(prev, dtype=np.float32)
    total = 0.0
    for (x, y) in curr:
        c = np.array([[x, y]], dtype=np.float32)
        d = np.sqrt(((prev_np - c) ** 2).sum(axis=1))
        total += float(d.min())
    return total / float(len(curr))


def compute_motion_score(
    state: MotionState,
    zone_name: str,
    centers_in_zone: list[tuple[int, int]],
) -> float:
    prev = state.prev_centers.get(zone_name, [])
    score = _avg_min_distance(centers_in_zone, prev)
    state.prev_centers[zone_name] = centers_in_zone
    return float(score)
