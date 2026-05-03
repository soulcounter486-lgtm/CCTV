import type { KitchenActivityRow } from "@/lib/types";

import type { LogRow, MinuteSample, ZoneDef } from "./dummy";

export function localDayRangeIso(dayStr: string) {
  const [y, m, d] = dayStr.split("-").map((x) => Number(x));
  const start = new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

export function rowsToMinuteSamples(rows: KitchenActivityRow[], zones: ZoneDef[]): MinuteSample[] {
  const zoneIds = new Set(zones.map((z) => z.id));

  const buckets = new Map<
    number,
    Partial<
      Record<
        string,
        {
          motionSum: number;
          motionN: number;
          activeVotes: boolean[];
        }
      >
    >
  >();

  for (const r of rows) {
    if (!zoneIds.has(r.zone_name)) continue;
    if (r.zone_name.startsWith("__")) continue;

    const t = new Date(r.created_at).getTime();
    if (Number.isNaN(t)) continue;
    const bucket = Math.floor(t / 60_000) * 60_000;

    const cur = buckets.get(bucket) ?? {};
    const z = cur[r.zone_name] ?? { motionSum: 0, motionN: 0, activeVotes: [] };
    z.motionSum += Number(r.motion_score);
    z.motionN += 1;
    z.activeVotes.push(Boolean(r.is_active));
    cur[r.zone_name] = z;
    buckets.set(bucket, cur);
  }

  const keys = Array.from(buckets.keys()).sort((a, b) => a - b);

  return keys.map((bucket) => {
    const b = buckets.get(bucket) ?? {};
    const zonesState = Object.fromEntries(
      zones.map((z) => {
        const cell = b[z.id];
        const motion = cell && cell.motionN > 0 ? cell.motionSum / cell.motionN : 0;
        const active =
          cell && cell.activeVotes.length
            ? cell.activeVotes.filter(Boolean).length >= Math.ceil(cell.activeVotes.length / 2)
            : false;
        const personCount = Math.max(0, Math.min(4, Math.round(motion / 14)));
        return [
          z.id,
          {
            motion,
            active,
            personCount,
          },
        ];
      }),
    ) as MinuteSample["zones"];

    return { t: bucket, zones: zonesState };
  });
}

export function summarizeFromSamples(samples: MinuteSample[], zones: ZoneDef[]) {
  let workMin = 0;
  let idleMin = 0;
  const zoneAvg: Record<string, number> = Object.fromEntries(zones.map((z) => [z.id, 0]));

  for (const s of samples) {
    const anyActive = zones.some((z) => s.zones[z.id]?.active);
    if (anyActive) workMin += 1;
    else idleMin += 1;

    for (const z of zones) {
      zoneAvg[z.id] += s.zones[z.id]?.motion ?? 0;
    }
  }

  const n = samples.length || 1;
  for (const z of zones) zoneAvg[z.id] /= n;

  const busiestId = zones
    .map((z) => ({ id: z.id, avg: zoneAvg[z.id] ?? 0 }))
    .sort((a, b) => b.avg - a.avg)[0]?.id;

  const busiestZoneKo = zones.find((z) => z.id === busiestId)?.labelKo ?? "—";

  return {
    workHours: workMin / 60,
    idleHours: idleMin / 60,
    busiestZoneKo,
    zoneAvg,
  };
}

export function findGlobalIdleBandsFromSamples(samples: MinuteSample[], zones: ZoneDef[]) {
  const bands: { x1: number; x2: number }[] = [];
  let runStart: number | null = null;

  for (const s of samples) {
    const allIdle = zones.every((z) => !s.zones[z.id]?.active);
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

export function buildDbLogs(rows: KitchenActivityRow[], zones: ZoneDef[]): LogRow[] {
  const zoneIds = new Set(zones.map((z) => z.id));
  const labelById = Object.fromEntries(zones.map((z) => [z.id, z.labelKo])) as Record<string, string>;

  const byZone = new Map<string, KitchenActivityRow[]>();
  for (const z of zones) byZone.set(z.id, []);

  for (const r of rows) {
    if (!zoneIds.has(r.zone_name)) continue;
    if (r.zone_name.startsWith("__")) continue;
    byZone.get(r.zone_name)?.push(r);
  }

  const out: LogRow[] = [];

  for (const z of zones) {
    const list = (byZone.get(z.id) ?? []).sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    if (!list.length) continue;

    let segStart = new Date(list[0].created_at).getTime();
    let segKind: "active" | "idle" = list[0].is_active ? "active" : "idle";

    for (let i = 1; i < list.length; i++) {
      const kind = list[i].is_active ? "active" : "idle";
      const t = new Date(list[i].created_at).getTime();
      if (kind !== segKind) {
        out.push({
          id: `${z.id}-${segStart}-${i}`,
          start: segStart,
          end: t,
          zoneKo: labelById[z.id] ?? z.id,
          kind: segKind,
        });
        segStart = t;
        segKind = kind;
      }
    }

    const last = list[list.length - 1];
    const lastT = new Date(last.created_at).getTime();
    out.push({
      id: `${z.id}-${segStart}-end`,
      start: segStart,
      end: lastT + 60_000,
      zoneKo: labelById[z.id] ?? z.id,
      kind: segKind,
    });
  }

  return out
    .filter((r) => r.end - r.start >= 2 * 60_000)
    .sort((a, b) => b.start - a.start)
    .slice(0, 18);
}
