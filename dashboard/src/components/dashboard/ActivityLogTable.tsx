import type { LogRow } from "@/app/dashboard/dummy";

function fmt(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function dur(ms: number) {
  const m = Math.round(ms / 60_000);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h <= 0) return `${mm}분`;
  return `${h}시간 ${mm}분`;
}

export function ActivityLogTable({ rows }: { rows: LogRow[] }) {
  return (
    <div className="rounded-3xl border bg-white p-5 shadow-sm">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-zinc-950">활동 로그</div>
          <div className="text-xs text-zinc-600">구역별 Active/Idle 전환 기록 (Supabase 기반)</div>
        </div>
        <div className="text-xs text-zinc-600">
          최근 <span className="font-semibold text-zinc-950">{rows.length}</span>건
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[860px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-left text-xs text-zinc-600">
              <th className="border-b py-2 pr-4">구역</th>
              <th className="border-b py-2 pr-4">상태</th>
              <th className="border-b py-2 pr-4">시작</th>
              <th className="border-b py-2 pr-4">종료</th>
              <th className="border-b py-2">지속</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-sm text-zinc-500">
                  로그 데이터가 없습니다.
                </td>
              </tr>
            ) : null}
          {rows.map((r) => (
              <tr key={r.id} className="text-zinc-900">
                <td className="border-b border-zinc-100 py-3 pr-4 font-medium">{r.zoneKo}</td>
                <td className="border-b border-zinc-100 py-3 pr-4">
                  <span
                    className={[
                      "inline-flex rounded-full px-2 py-1 text-xs font-semibold",
                      r.kind === "active" ? "bg-emerald-50 text-emerald-800" : "bg-zinc-100 text-zinc-700",
                    ].join(" ")}
                  >
                    {r.kind === "active" ? "Working" : "Idle"}
                  </span>
                </td>
                <td className="border-b border-zinc-100 py-3 pr-4 tabular-nums text-zinc-700">{fmt(r.start)}</td>
                <td className="border-b border-zinc-100 py-3 pr-4 tabular-nums text-zinc-700">{fmt(r.end)}</td>
                <td className="border-b border-zinc-100 py-3 tabular-nums text-zinc-700">{dur(r.end - r.start)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
