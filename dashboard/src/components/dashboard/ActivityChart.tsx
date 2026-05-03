"use client";

import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { MinuteSample, ZoneDef } from "@/app/dashboard/dummy";

export function ActivityChart({
  samples,
  zones,
  idleBands,
  idleThreshold,
}: {
  samples: MinuteSample[];
  zones: ZoneDef[];
  idleBands: { x1: number; x2: number }[];
  idleThreshold: number;
}) {
  const data = samples.map((s) => {
    const row: Record<string, number | string> = { t: s.t };
    for (const z of zones) {
      const m = s.zones[z.id]?.motion ?? 0;
      row[z.id] = Math.round(m * 10) / 10;
    }
    return row;
  });

  const tickTs =
    data.length <= 14
      ? data.map((d) => d.t)
      : data.filter((_, idx) => idx % Math.max(1, Math.floor(data.length / 12)) === 0).map((d) => d.t);

  const fmtTime = (ts: number) =>
    new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

  return (
    <div className="rounded-3xl border bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-zinc-950">시간대별 활동 흐름</div>
          <div className="text-xs text-zinc-600">
            붉은 배경은 <span className="font-medium text-zinc-950">전 구역 Idle</span> 구간
          </div>
        </div>
        <div className="text-xs text-zinc-600">
          임계값 <span className="font-semibold text-zinc-950">{idleThreshold}</span> 미만은 Idle로 간주
        </div>
      </div>

      <div className="mt-4 h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
            <XAxis
              dataKey="t"
              type="number"
              domain={["dataMin", "dataMax"]}
              ticks={tickTs}
              tickFormatter={fmtTime}
              tick={{ fontSize: 11 }}
            />
            <YAxis tick={{ fontSize: 11 }} domain={[0, "auto"]} />
            <Tooltip
              contentStyle={{
                borderRadius: 16,
                border: "1px solid #e4e4e7",
              }}
              labelFormatter={(ts) => fmtTime(Number(ts))}
              labelStyle={{ fontWeight: 600 }}
            />
            <Legend />

            {idleBands.map((b, idx) => (
              <ReferenceArea
                key={`idle-${idx}`}
                x1={b.x1}
                x2={b.x2}
                fill="#fecaca"
                fillOpacity={0.35}
                strokeOpacity={0}
              />
            ))}

            <ReferenceLine y={idleThreshold} stroke="#ef4444" strokeDasharray="4 4" />
            {zones.map((z) => (
              <Line
                key={z.id}
                type="monotone"
                dataKey={z.id}
                name={`${z.labelKo}`}
                stroke={z.color}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
