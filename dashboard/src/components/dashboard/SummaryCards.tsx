export function SummaryCards({
  workHours,
  idleHours,
  busiestZoneKo,
  zoneAvg,
}: {
  workHours: number;
  idleHours: number;
  busiestZoneKo: string;
  zoneAvg: Record<string, number>;
}) {
  const peakMotion = Math.max(...Object.values(zoneAvg), 1);

  const cards = [
    {
      title: "총 근무 시간",
      value: `${workHours.toFixed(1)}h`,
      hint: "한 구역이라도 활동이 감지된 시간",
    },
    {
      title: "총 유휴 시간",
      value: `${idleHours.toFixed(1)}h`,
      hint: "모든 구역이 Idle로 동시에 유지된 시간",
    },
    {
      title: "현재 가장 붐비는 구역",
      value: busiestZoneKo,
      hint: "평균 motion_score 기준",
    },
    {
      title: "피크 활동도",
      value: `${peakMotion.toFixed(1)}`,
      hint: "구역 평균 중 최대값",
    },
  ] as const;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <div key={c.title} className="rounded-3xl border bg-white p-5 shadow-sm">
          <div className="text-xs font-medium text-zinc-500">{c.title}</div>
          <div className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">{c.value}</div>
          <div className="mt-2 text-xs leading-relaxed text-zinc-600">{c.hint}</div>
        </div>
      ))}
    </div>
  );
}
