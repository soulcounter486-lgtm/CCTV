from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

import yaml


Point = tuple[int, int]


@dataclass(frozen=True)
class Zone:
    name: str
    polygon: list[Point]
    motion_active_threshold: float | None = None


def load_zones(path: str) -> list[Zone]:
    with open(path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}

    zones_raw = data.get("zones", [])
    zones: list[Zone] = []
    for z in zones_raw:
        name = str(z["name"])
        poly_raw = z["polygon"]
        polygon: list[Point] = [(int(p[0]), int(p[1])) for p in poly_raw]
        if len(polygon) < 3:
            raise ValueError(f"Zone '{name}' polygon must have >= 3 points")
        thr_raw = z.get("motion_active_threshold", None)
        thr = float(thr_raw) if thr_raw is not None else None
        zones.append(Zone(name=name, polygon=polygon, motion_active_threshold=thr))
    return zones


def point_in_polygon(point: Point, polygon: Iterable[Point]) -> bool:
    # Ray casting algorithm.
    x, y = point
    poly = list(polygon)
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        intersects = ((yi > y) != (yj > y)) and (
            x < (xj - xi) * (y - yi) / (yj - yi + 1e-9) + xi
        )
        if intersects:
            inside = not inside
        j = i
    return inside
