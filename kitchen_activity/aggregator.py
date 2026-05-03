from __future__ import annotations

import time
from dataclasses import dataclass


@dataclass
class ZoneAggregate:
    zone_name: str
    samples: int = 0
    motion_sum: float = 0.0

    def add(self, motion_score: float) -> None:
        self.samples += 1
        self.motion_sum += float(motion_score)

    def mean_motion(self) -> float:
        if self.samples <= 0:
            return 0.0
        return float(self.motion_sum) / float(self.samples)


class MinuteAggregator:
    def __init__(self, zone_names: list[str], aggregation_seconds: int = 60):
        self._aggregation_seconds = int(aggregation_seconds)
        self._zone_names = list(zone_names)
        self.reset()

    def reset(self) -> None:
        self._window_start = time.time()
        self._zones: dict[str, ZoneAggregate] = {
            name: ZoneAggregate(zone_name=name) for name in self._zone_names
        }

    def add_sample(self, zone_name: str, motion_score: float) -> None:
        if zone_name not in self._zones:
            self._zones[zone_name] = ZoneAggregate(zone_name=zone_name)
        self._zones[zone_name].add(motion_score)

    def should_flush(self) -> bool:
        return (time.time() - self._window_start) >= self._aggregation_seconds

    def flush(self) -> dict[str, float]:
        out = {zn: agg.mean_motion() for zn, agg in self._zones.items()}
        self.reset()
        return out
