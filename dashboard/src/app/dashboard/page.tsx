"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  IDLE_THRESHOLD,
  ZONE_DEFS,
  buildActivityLogs,
  buildDummyDaySamples,
  findGlobalIdleBands,
  summarize,
} from "./dummy";
import {
  buildDbLogs,
  findGlobalIdleBandsFromSamples,
  localDayRangeIso,
  rowsToMinuteSamples,
  summarizeFromSamples,
} from "./supabase";

import { ActivityChart } from "@/components/dashboard/ActivityChart";
import { ActivityLogTable } from "@/components/dashboard/ActivityLogTable";
import { ControlBar } from "@/components/dashboard/ControlBar";
import { SummaryCards } from "@/components/dashboard/SummaryCards";
import { ZoneMonitor } from "@/components/dashboard/ZoneMonitor";
import { supabase } from "@/lib/supabase/client";
import type { KitchenActivityRow } from "@/lib/types";

function parseLocalDay(dayStr: string) {
  const [y, m, d] = dayStr.split("-").map((x) => Number(x));
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export default function KitchenDashboardPage() {
  const router = useRouter();

  const todayStr = useMemo(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  const [day, setDay] = useState(todayStr);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [useDemo, setUseDemo] = useState(false);

  const [rawRows, setRawRows] = useState<KitchenActivityRow[]>([]);

  const fetchDay = useCallback(async (dayStr: string) => {
    setLoading(true);
    setError(null);

    const { data: sess, error: sErr } = await supabase.auth.getSession();
    if (sErr) {
      setError(sErr.message);
      setLoading(false);
      return;
    }
    if (!sess.session) {
      router.replace(`/login?next=${encodeURIComponent("/dashboard")}`);
      return;
    }

    const { startIso, endIso } = localDayRangeIso(dayStr);
    const { data, error: qErr } = await supabase
      .from("kitchen_activity")
      .select("id, created_at, zone_name, is_active, motion_score")
      .gte("created_at", startIso)
      .lt("created_at", endIso)
      .not("zone_name", "like", "__smoke_%")
      .order("created_at", { ascending: true })
      .limit(20000);

    if (qErr) {
      setError(qErr.message);
      setRawRows([]);
      setLoading(false);
      return;
    }

    setRawRows(data ?? []);
    setUseDemo(!(data ?? []).length);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void fetchDay(day);
    }, 0);
    return () => window.clearTimeout(id);
  }, [day, fetchDay]);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) return;

      channel = supabase
        .channel("kitchen_activity_admin_dashboard")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "kitchen_activity" },
          () => {
            void fetchDay(day);
          },
        )
        .subscribe();
    })();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [day, fetchDay]);

  const demoSamples = useMemo(() => buildDummyDaySamples(parseLocalDay(day)), [day]);

  const realSamples = useMemo(() => rowsToMinuteSamples(rawRows, ZONE_DEFS), [rawRows]);

  const samples = useDemo ? demoSamples : realSamples;
  const summary = useMemo(() => {
    return useDemo ? summarize(samples) : summarizeFromSamples(samples, ZONE_DEFS);
  }, [samples, useDemo]);

  const idleBands = useMemo(() => {
    return useDemo ? findGlobalIdleBands(samples) : findGlobalIdleBandsFromSamples(samples, ZONE_DEFS);
  }, [samples, useDemo]);

  const logs = useMemo(() => {
    return useDemo ? buildActivityLogs(samples) : buildDbLogs(rawRows, ZONE_DEFS);
  }, [samples, useDemo, rawRows]);

  const live = useMemo(() => {
    const last = samples[samples.length - 1];
    const base = Object.fromEntries(
      ZONE_DEFS.map((z) => [
        z.id,
        { personCount: 0, active: false, motion: 0 },
      ]),
    ) as Record<string, { personCount: number; active: boolean; motion: number }>;

    if (!last) return base;

    for (const z of ZONE_DEFS) {
      const zState = last.zones[z.id];
      base[z.id] = {
        personCount: zState?.personCount ?? 0,
        active: Boolean(zState?.active),
        motion: zState?.motion ?? 0,
      };
    }
    return base;
  }, [samples]);

  const kitchenStill =
    "https://images.unsplash.com/photo-1556910103-1c02745aae4d?q=80&w=1600&auto=format&fit=crop";

  return (
    <div className="min-h-screen bg-zinc-50">
      <ControlBar
        title="주방 활동 관리 대시보드"
        subtitle={
          useDemo
            ? "선택한 날짜에 Supabase 데이터가 없어 데모 데이터를 표시합니다."
            : "Supabase의 kitchen_activity 데이터를 기반으로 표시합니다."
        }
        value={day}
        onChange={setDay}
        idleThreshold={IDLE_THRESHOLD}
      />

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        {loading ? (
          <div className="rounded-3xl border bg-white p-6 text-sm text-zinc-600">불러오는 중...</div>
        ) : error ? (
          <div className="rounded-3xl border bg-white p-6 text-sm text-red-700">{error}</div>
        ) : null}

        {!loading && !error ? (
          <>
            {useDemo ? (
              <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                이 날짜에는 아직 수집 데이터가 없습니다. 파이썬 수집기가 실행 중인지/카메라 RTSP가 열리는지 확인해주세요.
              </div>
            ) : null}

            <SummaryCards
              workHours={summary.workHours}
              idleHours={summary.idleHours}
              busiestZoneKo={summary.busiestZoneKo}
              zoneAvg={summary.zoneAvg}
            />

            <div className="grid gap-6 lg:grid-cols-5">
              <div className="space-y-6 lg:col-span-3">
                <ActivityChart
                  samples={samples}
                  zones={ZONE_DEFS}
                  idleBands={idleBands}
                  idleThreshold={IDLE_THRESHOLD}
                />
              </div>
              <div className="space-y-6 lg:col-span-2">
                <ZoneMonitor zones={ZONE_DEFS} live={live} imageUrl={kitchenStill} />
              </div>
            </div>

            <ActivityLogTable rows={logs} />

            <footer className="pb-10 text-center text-xs text-zinc-500">
              Zone 오버레이 좌표는 `config/zones.yaml` 기준(1280×720 가정)으로 정규화되어 있습니다. 해상도가 다르면 보정이 필요합니다.
            </footer>
          </>
        ) : null}
      </main>
    </div>
  );
}
