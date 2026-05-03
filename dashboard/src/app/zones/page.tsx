"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

type Point = [number, number];
type ZoneEntry = { name: string; motion_active_threshold: number; polygon: Point[] };

const DEFAULT_POLYGON: Point[] = [
  [100, 100],
  [400, 100],
  [400, 400],
  [100, 400],
];

function PolygonEditor({
  polygon,
  onChange,
}: {
  polygon: Point[];
  onChange: (p: Point[]) => void;
}) {
  function updatePoint(i: number, axis: 0 | 1, val: string) {
    const n = parseInt(val);
    if (Number.isNaN(n)) return;
    const next = polygon.map((p, idx) =>
      idx === i ? ([axis === 0 ? n : p[0], axis === 1 ? n : p[1]] as Point) : p
    );
    onChange(next);
  }
  function addPoint() {
    onChange([...polygon, [200, 200]]);
  }
  function removePoint(i: number) {
    if (polygon.length <= 3) return;
    onChange(polygon.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-2">
      {polygon.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-5 text-xs text-zinc-400">P{i + 1}</span>
          <label className="flex items-center gap-1 text-xs text-zinc-600">
            X
            <input
              type="number"
              value={p[0]}
              onChange={(e) => updatePoint(i, 0, e.target.value)}
              className="w-20 rounded-lg border px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-zinc-400"
            />
          </label>
          <label className="flex items-center gap-1 text-xs text-zinc-600">
            Y
            <input
              type="number"
              value={p[1]}
              onChange={(e) => updatePoint(i, 1, e.target.value)}
              className="w-20 rounded-lg border px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-zinc-400"
            />
          </label>
          <button
            type="button"
            onClick={() => removePoint(i)}
            disabled={polygon.length <= 3}
            className="rounded-lg border px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-30"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addPoint}
        className="mt-1 rounded-lg border px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
      >
        + 점 추가
      </button>
      <p className="text-xs text-zinc-400">단위: 픽셀 (1280×720 기준). 3개 이상 필요.</p>
    </div>
  );
}

export default function ZonesPage() {
  const router = useRouter();
  const [zones, setZones] = useState<ZoneEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace("/login?next=/zones");
    });
  }, [router]);

  const fetchZones = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/zones");
      if (!res.ok) {
        const j = (await res.json()) as { error: string };
        setError(j.error ?? "Failed to load zones");
        return;
      }
      const j = (await res.json()) as { zones: ZoneEntry[] };
      setZones(j.zones.length ? j.zones : []);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchZones();
  }, [fetchZones]);

  function addZone() {
    setZones((prev) => [
      ...prev,
      { name: `zone_${prev.length + 1}`, motion_active_threshold: 18, polygon: DEFAULT_POLYGON },
    ]);
  }

  function removeZone(i: number) {
    if (!confirm("이 구역을 삭제하시겠습니까?")) return;
    setZones((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateZone(i: number, patch: Partial<ZoneEntry>) {
    setZones((prev) => prev.map((z, idx) => (idx === i ? { ...z, ...patch } : z)));
  }

  async function save() {
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch("/api/zones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zones }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && j.ok) {
        setSaveMsg({ ok: true, text: "zones.yaml 저장 완료! Python 수집기를 재시작해야 반영됩니다." });
      } else {
        setSaveMsg({ ok: false, text: j.error ?? "저장 실패" });
      }
    } catch {
      setSaveMsg({ ok: false, text: "Network error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="sticky top-0 z-30 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-base font-semibold text-zinc-950">구역(Zone) 설정</h1>
            <p className="text-xs text-zinc-500">
              <code className="rounded bg-zinc-100 px-1">config/zones.yaml</code> 을 직접 편집합니다 (로컬 전용)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/dashboard")}
              className="rounded-xl border bg-white px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
            >
              ← 대시보드
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-4 px-4 py-6">
        {error ? (
          <div className="rounded-2xl bg-red-50 p-5 text-sm text-red-700">
            {error}
            {error.includes("local dev") && (
              <p className="mt-1 text-xs">이 기능은 <code>npm run dev</code> 로컬 실행 시에만 사용할 수 있습니다.</p>
            )}
          </div>
        ) : null}

        {!loading && !error ? (
          <>
            {zones.map((z, i) => (
              <div key={i} className="rounded-3xl border bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between">
                  <h2 className="text-sm font-semibold text-zinc-950">구역 {i + 1}</h2>
                  <button
                    onClick={() => removeZone(i)}
                    className="rounded-xl border px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    삭제
                  </button>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-700">
                      구역 ID (zone_name)
                    </label>
                    <input
                      type="text"
                      value={z.name}
                      onChange={(e) => updateZone(i, { name: e.target.value })}
                      placeholder="예: cooking_zone"
                      className="w-full rounded-xl border px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-zinc-900"
                    />
                    <p className="mt-1 text-xs text-zinc-400">
                      DB의 zone_name과 반드시 일치해야 합니다
                    </p>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-700">
                      활동 임계값 (motion_active_threshold)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={z.motion_active_threshold}
                      onChange={(e) =>
                        updateZone(i, { motion_active_threshold: parseFloat(e.target.value) || 18 })
                      }
                      className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900"
                    />
                    <p className="mt-1 text-xs text-zinc-400">
                      이 값 이상의 motion_score = Active로 판정
                    </p>
                  </div>
                </div>

                <div className="mt-4">
                  <label className="mb-2 block text-xs font-medium text-zinc-700">
                    폴리곤 좌표 (픽셀, 1280×720 기준)
                  </label>
                  <PolygonEditor
                    polygon={z.polygon}
                    onChange={(p) => updateZone(i, { polygon: p })}
                  />
                </div>
              </div>
            ))}

            <button
              onClick={addZone}
              className="w-full rounded-3xl border-2 border-dashed border-zinc-200 py-4 text-sm font-medium text-zinc-500 hover:border-zinc-400 hover:text-zinc-700"
            >
              + 새 구역 추가
            </button>

            {saveMsg ? (
              <div
                className={[
                  "rounded-2xl px-5 py-4 text-sm",
                  saveMsg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800",
                ].join(" ")}
              >
                {saveMsg.text}
              </div>
            ) : null}

            <div className="flex justify-end gap-3 pb-10">
              <button
                onClick={() => void fetchZones()}
                className="rounded-xl border bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                초기화
              </button>
              <button
                onClick={() => void save()}
                disabled={saving}
                className="rounded-xl bg-zinc-900 px-6 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
              >
                {saving ? "저장 중…" : "저장 (zones.yaml)"}
              </button>
            </div>
          </>
        ) : loading ? (
          <div className="rounded-2xl border bg-white p-6 text-sm text-zinc-500">불러오는 중…</div>
        ) : null}
      </main>
    </div>
  );
}
