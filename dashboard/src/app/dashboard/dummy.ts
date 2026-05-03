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

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function pseudoRand(seed: number) {
  // deterministic-ish PRNG for demo charts
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export function buildDummyDaySamples(day: Date): MinuteSample[] {
  const start = new Date(day);
  start.setHours(9, 0, 0, 0);
  const end = new Date(day);
  end.setHours(22, 0, 0, 0);

  const samples: MinuteSample[] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += 60_000) {
    const hour = new Date(t).getHours() + new Date(t).getMinutes() / 60;
    const lunch = Math.exp(-Math.pow(hour - 12.5, 2) / 2.2);
    const dinner = Math.exp(-Math.pow(hour - 18.5, 2) / 3.0);

    const base = 10 + lunch * 35 + dinner * 45;
    const noise = (k: number) => (pseudoRand(t + k * 9973) - 0.5) * 6;

    const prepMotion = clamp(base * 0.9 + noise(1), 0, 80);
    const packMotion = clamp(base * 0.75 + noise(3) + (hour > 18 ? 8 : 0), 0, 85);

    // Inject idle plateaus (global-ish drop)
    const idleWave = Math.sin(t / 1_200_000) * 6;
    const globalIdle = lunch < 0.12 && hour < 11.5 ? -18 : idleWave;

    const motions = {
      cooking_zone: clamp(prepMotion + globalIdle, 0, 100),
      packing_zone: clamp(packMotion + globalIdle * 0.85, 0, 100),
    };

    const toPerson = (m: number) => clamp(Math.round(m / 14 + (pseudoRand(t + m) - 0.45) * 2), 0, 4);

    samples.push({
      t,
      zones: {
        cooking_zone: {
          motion: motions.cooking_zone,
          active: motions.cooking_zone >= IDLE_THRESHOLD,
          personCount: toPerson(motions.cooking_zone),
        },
        packing_zone: {
          motion: motions.packing_zone,
          active: motions.packing_zone >= IDLE_THRESHOLD,
          personCount: toPerson(motions.packing_zone),
        },
      },
    });
  }

  return samples;
}

export function summarize(samples: MinuteSample[]) {
  let workMin = 0;
  let idleMin = 0;
  const zoneAvg: Record<string, number> = Object.fromEntries(ZONE_DEFS.map((z) => [z.id, 0]));

  for (const s of samples) {
    const anyActive = ZONE_DEFS.some((z) => s.zones[z.id].active);
    if (anyActive) workMin += 1;
    else idleMin += 1;

    for (const z of ZONE_DEFS) {
      zoneAvg[z.id] += s.zones[z.id].motion;
    }
  }

  const n = samples.length || 1;
  for (const z of ZONE_DEFS) zoneAvg[z.id] /= n;

  const busiest =
    (Object.entries(zoneAvg) as [string, number][]).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ZONE_DEFS[0]?.id ?? "";
  const busiestLabel = ZONE_DEFS.find((z) => z.id === busiest)?.labelKo ?? "—";

  return {
    workHours: workMin / 60,
    idleHours: idleMin / 60,
    busiestZoneKo: busiestLabel,
    zoneAvg,
  };
}

export type LogRow = {
  id: string;
  start: number;
  end: number;
  zoneKo: string;
  kind: "active" | "idle";
};

export function buildActivityLogs(samples: MinuteSample[]): LogRow[] {
  const rows: LogRow[] = [];

  for (const z of ZONE_DEFS) {
    let segStart = samples[0]?.t ?? 0;
    let segKind: "active" | "idle" = samples[0]?.zones[z.id].active ? "active" : "idle";

    for (let i = 1; i < samples.length; i++) {
      const kind = samples[i].zones[z.id].active ? "active" : "idle";
      if (kind !== segKind) {
        rows.push({
          id: `${z.id}-${segStart}-${i}`,
          start: segStart,
          end: samples[i].t,
          zoneKo: z.labelKo,
          kind: segKind,
        });
        segStart = samples[i].t;
        segKind = kind;
      }
    }

    const last = samples[samples.length - 1];
    if (last) {
      rows.push({
        id: `${z.id}-${segStart}-end`,
        start: segStart,
        end: last.t + 60_000,
        zoneKo: z.labelKo,
        kind: segKind,
      });
    }
  }

  return rows
    .filter((r) => r.end - r.start >= 2 * 60_000) // ignore ultra-short flickers for readability
    .sort((a, b) => b.start - a.start)
    .slice(0, 18);
}

export function findGlobalIdleBands(samples: MinuteSample[]) {
  const bands: { x1: number; x2: number }[] = [];
  let runStart: number | null = null;

  for (const s of samples) {
    const allIdle = ZONE_DEFS.every((z) => !s.zones[z.id].active);
    if (allIdle && runStart === null) runStart = s.t;
    if (!allIdle && runStart !== null) {
      bands.push({ x1: runStart, x2: s.t });
      runStart = null;
    }
  }
  if (runStart !== null && samples.length) {
    bands.push({ x1: runStart, x2: samples[samples.length - 1].t + 60_000 });
  }
  return bands;
}
