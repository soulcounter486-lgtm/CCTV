"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import type { KitchenActivityRow } from "@/lib/types";
import { Sparkline } from "@/components/Sparkline";

type ZoneCardData = {
  zone: string;
  isActive: boolean;
  motionScore: number;
  createdAt: string;
  series: number[];
};

function formatTime(ts: string) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString();
}

function minutesAgoIso(minutes: number) {
  const d = new Date(Date.now() - minutes * 60_000);
  return d.toISOString();
}

export default function DashboardPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [latestByZone, setLatestByZone] = useState<Record<string, KitchenActivityRow>>({});
  const [seriesByZone, setSeriesByZone] = useState<Record<string, KitchenActivityRow[]>>({});

  const cards: ZoneCardData[] = useMemo(() => {
    return Object.values(latestByZone)
      .sort((a, b) => a.zone_name.localeCompare(b.zone_name))
      .map((r) => ({
        zone: r.zone_name,
        isActive: r.is_active,
        motionScore: r.motion_score,
        createdAt: r.created_at,
        series: (seriesByZone[r.zone_name] ?? []).map((x) => x.motion_score),
      }));
  }, [latestByZone, seriesByZone]);

  useEffect(() => {
    let alive = true;

    async function boot() {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase.auth.getSession();
      if (!alive) return;
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      if (!data.session) {
        router.replace("/login?next=/");
        return;
      }
      setEmail(data.session.user.email ?? null);

      const { data: rows, error: qErr } = await supabase
        .from("kitchen_activity")
        .select("id, created_at, zone_name, is_active, motion_score")
        .order("created_at", { ascending: false })
        .limit(200);

      if (!alive) return;
      if (qErr) {
        setError(qErr.message);
        setLoading(false);
        return;
      }
      const map: Record<string, KitchenActivityRow> = {};
      for (const r of rows ?? []) {
        if (!map[r.zone_name]) map[r.zone_name] = r;
      }
      setLatestByZone(map);

      // Fetch last 60 minutes for sparkline per zone.
      const since = minutesAgoIso(60);
      const { data: lastHour, error: hErr } = await supabase
        .from("kitchen_activity")
        .select("id, created_at, zone_name, is_active, motion_score")
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .limit(5000);
      if (!alive) return;
      if (hErr) {
        setError(hErr.message);
        setLoading(false);
        return;
      }
      const grouped: Record<string, KitchenActivityRow[]> = {};
      for (const r of lastHour ?? []) {
        if (!grouped[r.zone_name]) grouped[r.zone_name] = [];
        grouped[r.zone_name].push(r);
      }
      setSeriesByZone(grouped);
      setLoading(false);

      const channel = supabase
        .channel("kitchen_activity_realtime")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "kitchen_activity" },
          (payload) => {
            const r = payload.new as KitchenActivityRow;
            setLatestByZone((prev) => {
              const current = prev[r.zone_name];
              if (!current) return { ...prev, [r.zone_name]: r };
              if (new Date(r.created_at).getTime() >= new Date(current.created_at).getTime()) {
                return { ...prev, [r.zone_name]: r };
              }
              return prev;
            });

            // Update sparkline series (keep roughly last 60 mins).
            setSeriesByZone((prev) => {
              const list = [...(prev[r.zone_name] ?? []), r];
              const cutoff = Date.now() - 60 * 60_000;
              const trimmed = list.filter((x) => new Date(x.created_at).getTime() >= cutoff);
              return { ...prev, [r.zone_name]: trimmed };
            });
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }

    const cleanupPromise = boot();
    return () => {
      alive = false;
      cleanupPromise?.then((cleanup) => cleanup?.());
    };
  }, [router]);

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login?next=/");
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-lg font-semibold">Kitchen Activity Dashboard</h1>
            <p className="text-xs text-zinc-600">Zone별 Working/Idle 상태를 실시간으로 확인합니다.</p>
          </div>
          <div className="flex items-center gap-3">
            {email ? <span className="text-sm text-zinc-700">{email}</span> : null}
            <button
              onClick={logout}
              className="rounded-xl border bg-white px-3 py-2 text-sm hover:bg-zinc-50"
            >
              로그아웃
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {loading ? (
          <div className="rounded-2xl border bg-white p-6 text-sm text-zinc-600">불러오는 중...</div>
        ) : error ? (
          <div className="rounded-2xl border bg-white p-6 text-sm text-red-700">{error}</div>
        ) : cards.length === 0 ? (
          <div className="rounded-2xl border bg-white p-6 text-sm text-zinc-600">
            아직 데이터가 없습니다. 파이썬 수집기가 `kitchen_activity`에 insert 하고 있는지 확인하세요.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((c) => (
              <div key={c.zone} className="rounded-2xl border bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-zinc-500">{c.zone}</div>
                    <div className="mt-1 text-2xl font-semibold">
                      {c.isActive ? "Working" : "Idle"}
                    </div>
                  </div>
                  <span
                    className={[
                      "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
                      c.isActive ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-700",
                    ].join(" ")}
                  >
                    {c.isActive ? "ACTIVE" : "IDLE"}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl bg-zinc-50 p-3">
                    <div className="text-xs text-zinc-500">motion_score</div>
                    <div className="mt-1 font-semibold">{c.motionScore.toFixed(2)}</div>
                  </div>
                  <div className="rounded-xl bg-zinc-50 p-3">
                    <div className="text-xs text-zinc-500">updated</div>
                    <div className="mt-1 font-semibold">{formatTime(c.createdAt)}</div>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-xs font-medium text-zinc-500">last 60 min</div>
                    <div className="text-xs text-zinc-500">{c.series.length} pts</div>
                  </div>
                  <div className="rounded-xl bg-zinc-50 p-3">
                    <Sparkline
                      values={c.series}
                      stroke={c.isActive ? "#047857" : "#18181b"}
                      fill={c.isActive ? "rgba(4, 120, 87, 0.10)" : "rgba(24, 24, 27, 0.08)"}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
