import type { ZoneDef } from "@/app/dashboard/dummy";

export function ZoneMonitor({
  zones,
  live,
  imageUrl,
}: {
  zones: ZoneDef[];
  live: Record<string, { personCount: number; active: boolean; motion: number }>;
  imageUrl: string;
}) {
  return (
    <div className="rounded-3xl border bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-zinc-950">구역 모니터링</div>
          <div className="text-xs text-zinc-600">가장 최근 1분 집계 기준으로 Zone별 상태를 표시합니다.</div>
        </div>
        <div className="rounded-full border bg-zinc-50 px-3 py-1 text-xs text-zinc-700">
          실시간 갱신
        </div>
      </div>

      <div className="mt-4">
        <div className="relative w-full overflow-hidden rounded-2xl border bg-zinc-950/5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="Kitchen still frame (placeholder)"
            className="h-auto w-full max-h-[420px] object-cover"
          />

          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox="0 0 1000 560"
            preserveAspectRatio="none"
          >
            {zones.map((z) => {
              const poly = z.polygonPct.map(([px, py]) => [px * 1000, py * 560] as [number, number]);
              const points = poly.map((p) => p.join(",")).join(" ");
              return (
                <polygon
                  key={z.id}
                  points={points}
                  fill={z.color}
                  fillOpacity={0.12}
                  stroke={z.color}
                  strokeOpacity={0.8}
                  strokeWidth={2}
                />
              );
            })}
          </svg>

          {zones.map((z) => {
            const c = live[z.id] ?? { personCount: 0, active: false, motion: 0 };
            // anchor badge near polygon bbox center (very rough for demo)
            const xs = z.polygonPct.map((p) => p[0]);
            const ys = z.polygonPct.map((p) => p[1]);
            const cx = ((Math.min(...xs) + Math.max(...xs)) / 2) * 100;
            const cy = ((Math.min(...ys) + Math.max(...ys)) / 2) * 100;

            return (
              <div
                key={z.id}
                className="absolute"
                style={{
                  left: `${cx}%`,
                  top: `${cy}%`,
                  transform: "translate(-50%, -55%)",
                }}
              >
                <div className="flex min-w-[170px] flex-col gap-2 rounded-2xl border bg-white/95 p-2 shadow-sm backdrop-blur">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-zinc-950">{z.labelKo}</div>
                    <span
                      className={[
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        c.active ? "bg-emerald-50 text-emerald-800" : "bg-zinc-100 text-zinc-700",
                      ].join(" ")}
                    >
                      {c.active ? "Active" : "Idle"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-zinc-700">
                    <span className="rounded-full bg-zinc-50 px-2 py-1 font-semibold text-zinc-900">
                      추정 인원 {c.personCount}명
                    </span>
                    <span className="rounded-full bg-zinc-50 px-2 py-1 font-semibold text-zinc-900">
                      motion {c.motion.toFixed(1)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
