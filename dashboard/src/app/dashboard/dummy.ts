export type ZoneKey = "prep" | "stove" | "pack";

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
    ZoneKey,
    {
      motion: number;
      active: boolean;
      personCount: number;
    }
  >;
};

export const ZONE_DEFS: ZoneDef[] = [
  {
    id: "prep",
    labelKo: "조리대",
    labelEn: "Prep",
    color: "#2563eb",
    polygonPct: [
      [0.08, 0.62],
      [0.42, 0.52],
      [0.46, 0.92],
      [0.12, 0.96],
    ],
  },
  {
    id: "stove",
    labelKo: "화구",
    labelEn: "Stove",
    color: "#ea580c",
    polygonPct: [
      [0.44, 0.48],
      [0.72, 0.42],
      [0.76, 0.82],
      [0.48, 0.88],
    ],
  },
  {
    id: "pack",
    labelKo: "포장대",
    labelEn: "Packing",
    color: "#16a34a",
    polygonPct: [
      [0.72, 0.46],
      [0.94, 0.42],
      [0.96, 0.88],
      [0.76, 0.86],
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
    const stoveMotion = clamp(base * 1.05 + noise(2) + (hour > 17 ? 6 : 0), 0, 90);
    const packMotion = clamp(base * 0.75 + noise(3) + (hour > 18 ? 8 : 0), 0, 85);

    // Inject idle plateaus (global-ish drop)
    const idleWave = Math.sin(t / 1_200_000) * 6;
    const globalIdle = lunch < 0.12 && hour < 11.5 ? -18 : idleWave;

    const motions = {
      prep: clamp(prepMotion + globalIdle, 0, 100),
      stove: clamp(stoveMotion + globalIdle * 0.9, 0, 100),
      pack: clamp(packMotion + globalIdle * 0.85, 0, 100),
    };

    const toPerson = (m: number) => clamp(Math.round(m / 14 + (pseudoRand(t + m) - 0.45) * 2), 0, 4);

    samples.push({
      t,
      zones: {
        prep: {
          motion: motions.prep,
          active: motions.prep >= IDLE_THRESHOLD,
          personCount: toPerson(motions.prep),
        },
        stove: {
          motion: motions.stove,
          active: motions.stove >= IDLE_THRESHOLD,
          personCount: toPerson(motions.stove),
        },
        pack: {
          motion: motions.pack,
          active: motions.pack >= IDLE_THRESHOLD,
          personCount: toPerson(motions.pack),
        },
      },
    });
  }

  return samples;
}

export function summarize(samples: MinuteSample[]) {
  let workMin = 0;
  let idleMin = 0;
  const zoneAvg: Record<ZoneKey, number> = { prep: 0, stove: 0, pack: 0 };

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

  const busiest = (Object.entries(zoneAvg) as [ZoneKey, number][]).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "prep";
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
