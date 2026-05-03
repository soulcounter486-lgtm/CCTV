export type ZoneKey = string;

export type ZoneDef = {
  id: ZoneKey;
  labelKo: string;
  labelEn: string;
  color: string;
  polygonPct: [number, number][]; // normalized [0..1] polygon points in video frame space
};

export type MinuteSample = {
  t: number; // epoch ms
  zones: Record<
    string,
    {
      motion: number;
      active: boolean;
      personCount: number;
    }
  >;
};

// NOTE: polygonPct is an approximation based on `config/zones.yaml` pixel polygons.
// If your camera resolution differs, adjust normalization (currently assumes 1280x720).
export const ZONE_DEFS: ZoneDef[] = [
  {
    id: "cooking_zone",
    labelKo: "조리대",
    labelEn: "Cooking",
    color: "#2563eb",
    polygonPct: [
      [100 / 1280, 120 / 720],
      [520 / 1280, 120 / 720],
      [560 / 1280, 360 / 720],
      [120 / 1280, 380 / 720],
    ],
  },
  {
    id: "packing_zone",
    labelKo: "포장대",
    labelEn: "Packing",
    color: "#16a34a",
    polygonPct: [
      [600 / 1280, 140 / 720],
      [980 / 1280, 140 / 720],
      [980 / 1280, 520 / 720],
      [610 / 1280, 520 / 720],
    ],
  },
];

export const IDLE_THRESHOLD = 12;

export type LogRow = {
  id: string;
  start: number;
  end: number;
  zoneKo: string;
  kind: "active" | "idle";
};
