"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  IDLE_THRESHOLD,
  ZONE_DEFS,
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
  const [userEmail, setUserEmail] = useState<string | null>(null);

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
    setUserEmail(sess.session.user.email ?? null);

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
    setLoading(false);
  }, [router]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void fetchDay(day);
    }, 0);
    return () => window.clearTimeout(id);
  }, [day, fetchDay]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session || cancelled) return;

      const channelName = `ka_dashboard_${Date.now()}`;
      const ch = supabase
        .channel(channelName)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "kitchen_activity" },
          () => {
            void fetchDay(day);
          },
        )
        .subscribe();

      return () => {
        cancelled = true;
        void supabase.removeChannel(ch);
      };
    })().catch(console.error);

    return () => {
      cancelled = true;
    };
  }, [day, fetchDay]);

  const samples = useMemo(() => rowsToMinuteSamples(rawRows, ZONE_DEFS), [rawRows]);
  const summary = useMemo(() => summarizeFromSamples(samples, ZONE_DEFS), [samples]);

  const idleBands = useMemo(() => {
    return findGlobalIdleBandsFromSamples(samples, ZONE_DEFS);
  }, [samples]);

  const logs = useMemo(() => {
    return buildDbLogs(rawRows, ZONE_DEFS);
  }, [rawRows]);

  const hasRows = rawRows.length > 0;
  const hasSeries = samples.length > 0;

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

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <ControlBar
        title="주방 활동 관리 대시보드"
        subtitle="Supabase kitchen_activity 실시간 데이터 기반"
        value={day}
        onChange={setDay}
        idleThreshold={IDLE_THRESHOLD}
        email={userEmail}
        onLogout={logout}
      />

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        {loading ? (
          <div className="rounded-3xl border bg-white p-6 text-sm text-zinc-600">불러오는 중...</div>
        ) : error ? (
          <div className="rounded-3xl border bg-white p-6 text-sm text-red-700">{error}</div>
        ) : null}

        {!loading && !error ? (
          <>
            {!hasRows ? (
              <div className="rounded-3xl border border-zinc-200 bg-white p-6">
                <div className="text-sm font-semibold text-zinc-950">이 날짜의 데이터가 없습니다</div>
                <ul className="mt-2 list-disc pl-5 text-xs leading-6 text-zinc-600">
                  <li><span className="font-medium">파이썬 수집기</span>가 실행 중인지 확인하세요 (<code>python main.py</code>).</li>
                  <li>카메라 <span className="font-medium">RTSP 연결</span>이 열려 있는지 확인하세요.</li>
                  <li>1분마다 데이터가 insert 되므로 잠시 후 새로고침해주세요.</li>
                </ul>
              </div>
            ) : null}

            {hasRows && !hasSeries ? (
              <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
                데이터는 있지만 Zone 이름이 일치하지 않습니다.
                DB의 <span className="font-semibold">zone_name</span>이{" "}
                <span className="font-semibold">{ZONE_DEFS.map((z) => z.id).join(", ")}</span>
                과 일치하는지 확인해주세요.
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
                {hasSeries ? (
                  <ActivityChart
                    samples={samples}
                    zones={ZONE_DEFS}
                    idleBands={idleBands}
                    idleThreshold={IDLE_THRESHOLD}
                  />
                ) : (
                  <div className="rounded-3xl border bg-white p-8 text-sm text-zinc-600">
                    표시할 시계열 데이터가 없습니다.
                  </div>
                )}
              </div>
              <div className="space-y-6 lg:col-span-2">
                <ZoneMonitor zones={ZONE_DEFS} live={live} />
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
