"use client";

import { useMemo, useState } from "react";

import {
  IDLE_THRESHOLD,
  ZONE_DEFS,
  buildActivityLogs,
  buildDummyDaySamples,
  findGlobalIdleBands,
  summarize,
} from "./dummy";

import { ActivityChart } from "@/components/dashboard/ActivityChart";
import { ActivityLogTable } from "@/components/dashboard/ActivityLogTable";
import { ControlBar } from "@/components/dashboard/ControlBar";
import { SummaryCards } from "@/components/dashboard/SummaryCards";
import { ZoneMonitor } from "@/components/dashboard/ZoneMonitor";

function parseLocalDay(dayStr: string) {
  const [y, m, d] = dayStr.split("-").map((x) => Number(x));
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export default function KitchenDashboardPage() {
  const todayStr = useMemo(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  const [day, setDay] = useState(todayStr);

  const samples = useMemo(() => buildDummyDaySamples(parseLocalDay(day)), [day]);
  const summary = useMemo(() => summarize(samples), [samples]);
  const idleBands = useMemo(() => findGlobalIdleBands(samples), [samples]);
  const logs = useMemo(() => buildActivityLogs(samples), [samples]);

  const live = useMemo(() => {
    const last = samples[samples.length - 1];
    if (!last) {
      return {
        prep: { personCount: 0, active: false, motion: 0 },
        stove: { personCount: 0, active: false, motion: 0 },
        pack: { personCount: 0, active: false, motion: 0 },
      };
    }
    return {
      prep: {
        personCount: last.zones.prep.personCount,
        active: last.zones.prep.active,
        motion: last.zones.prep.motion,
      },
      stove: {
        personCount: last.zones.stove.personCount,
        active: last.zones.stove.active,
        motion: last.zones.stove.motion,
      },
      pack: {
        personCount: last.zones.pack.personCount,
        active: last.zones.pack.active,
        motion: last.zones.pack.motion,
      },
    };
  }, [samples]);

  const kitchenStill =
    "https://images.unsplash.com/photo-1556910103-1c02745aae4d?q=80&w=1600&auto=format&fit=crop";

  return (
    <div className="min-h-screen bg-zinc-50">
      <ControlBar
        title="주방 활동 관리 대시보드"
        subtitle="더미 데이터로 UI를 먼저 검증합니다 (Supabase 연결 없이 동작)."
        value={day}
        onChange={setDay}
        idleThreshold={IDLE_THRESHOLD}
      />

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        <SummaryCards
          workHours={summary.workHours}
          idleHours={summary.idleHours}
          busiestZoneKo={summary.busiestZoneKo}
          zoneAvg={summary.zoneAvg}
        />

        <div className="grid gap-6 lg:grid-cols-5">
          <div className="space-y-6 lg:col-span-3">
            <ActivityChart samples={samples} zones={ZONE_DEFS} idleBands={idleBands} idleThreshold={IDLE_THRESHOLD} />
          </div>
          <div className="space-y-6 lg:col-span-2">
            <ZoneMonitor zones={ZONE_DEFS} live={live} imageUrl={kitchenStill} />
          </div>
        </div>

        <ActivityLogTable rows={logs} />

        <footer className="pb-10 text-center text-xs text-zinc-500">
          데모 목적의 합성 데이터입니다. 실제 서비스에서는 Supabase의 시계열 데이터로 교체합니다.
        </footer>
      </main>
    </div>
  );
}
