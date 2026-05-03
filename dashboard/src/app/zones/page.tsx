"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

// ── Types ─────────────────────────────────────────────────────────────────────

type Pt = [number, number]; // pixel coords in video space (e.g. 1280×720)

type ZoneEntry = {
  name: string;
  motion_active_threshold: number;
  polygon: Pt[];
  color: string; // UI-only, not saved to yaml
};

const ZONE_COLORS = [
  "#2563eb", "#16a34a", "#dc2626", "#d97706",
  "#7c3aed", "#0891b2", "#be185d", "#065f46",
];

const DEFAULT_ZONES: ZoneEntry[] = [
  { name: "cooking_zone", motion_active_threshold: 18, polygon: [], color: ZONE_COLORS[0] },
  { name: "packing_zone", motion_active_threshold: 12, polygon: [], color: ZONE_COLORS[1] },
];

// ── Canvas helpers ─────────────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ZonesPage() {
  const router = useRouter();

  // Zones state
  const [zones, setZones] = useState<ZoneEntry[]>(DEFAULT_ZONES);
  const [activeIdx, setActiveIdx] = useState(0); // which zone is being drawn
  const [drawing, setDrawing] = useState(false);  // in polygon-draw mode

  // Image
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [imgNatW, setImgNatW] = useState(1280);
  const [imgNatH, setImgNatH] = useState(720);

  // Canvas
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasW, setCanvasW] = useState(960);
  const [canvasH, setCanvasH] = useState(540);

  // UI state
  const [saving, setSaving] = useState(false);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Auth guard
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace("/login?next=/zones");
    });
  }, [router]);

  // Scale helpers
  const toCanvas = useCallback(
    (vx: number, vy: number): [number, number] => [
      (vx / imgNatW) * canvasW,
      (vy / imgNatH) * canvasH,
    ],
    [imgNatW, imgNatH, canvasW, canvasH],
  );
  const toVideo = useCallback(
    (cx: number, cy: number): [number, number] => [
      Math.round((cx / canvasW) * imgNatW),
      Math.round((cy / canvasH) * imgNatH),
    ],
    [imgNatW, imgNatH, canvasW, canvasH],
  );

  // Load existing zones.yaml on mount
  useEffect(() => {
    fetch("/api/zones")
      .then((r) => r.json())
      .then((j: { zones?: { name: string; motion_active_threshold: number; polygon: Pt[] }[] }) => {
        if (j.zones && j.zones.length > 0) {
          setZones(
            j.zones.map((z, i) => ({
              ...z,
              color: ZONE_COLORS[i % ZONE_COLORS.length],
            })),
          );
        }
      })
      .catch(() => null);
  }, []);

  // Resize canvas to container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => {
      const w = el.clientWidth;
      const h = Math.round((w / imgNatW) * imgNatH);
      setCanvasW(w);
      setCanvasH(h);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [imgNatW, imgNatH]);

  // Draw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = canvasW;
    canvas.height = canvasH;
    ctx.clearRect(0, 0, canvasW, canvasH);

    // Background
    if (imgSrc) {
      const img = new Image();
      img.src = imgSrc;
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvasW, canvasH);
        drawZones(ctx);
      };
    } else {
      ctx.fillStyle = "#1c1c1e";
      ctx.fillRect(0, 0, canvasW, canvasH);
      ctx.fillStyle = "#555";
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("사진을 업로드하거나 RTSP 스냅샷을 불러오세요", canvasW / 2, canvasH / 2);
      drawZones(ctx);
    }

    function drawZones(ctx: CanvasRenderingContext2D) {
      zones.forEach((z, i) => {
        if (z.polygon.length < 1) return;
        const pts = z.polygon.map(([vx, vy]) => toCanvas(vx, vy));

        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let j = 1; j < pts.length; j++) ctx.lineTo(pts[j][0], pts[j][1]);
        if (z.polygon.length >= 3) {
          ctx.closePath();
          ctx.fillStyle = hexToRgba(z.color, i === activeIdx && drawing ? 0.25 : 0.15);
          ctx.fill();
        }
        ctx.strokeStyle = z.color;
        ctx.lineWidth = i === activeIdx ? 2.5 : 1.5;
        ctx.setLineDash(i === activeIdx ? [] : [6, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Vertex dots
        pts.forEach(([cx, cy]) => {
          ctx.beginPath();
          ctx.arc(cx, cy, i === activeIdx ? 5 : 4, 0, Math.PI * 2);
          ctx.fillStyle = z.color;
          ctx.fill();
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        });

        // Label
        if (z.polygon.length >= 1) {
          const xs = pts.map((p) => p[0]);
          const ys = pts.map((p) => p[1]);
          const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
          const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
          ctx.font = "bold 13px sans-serif";
          ctx.fillStyle = "#fff";
          ctx.textAlign = "center";
          ctx.shadowColor = "rgba(0,0,0,0.8)";
          ctx.shadowBlur = 4;
          ctx.fillText(z.name, cx, cy);
          ctx.shadowBlur = 0;
        }
      });
    }
  }, [zones, activeIdx, drawing, imgSrc, canvasW, canvasH, toCanvas]);

  // Click on canvas → add point
  function onCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!drawing) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const [vx, vy] = toVideo(cx, cy);
    setZones((prev) =>
      prev.map((z, i) =>
        i === activeIdx ? { ...z, polygon: [...z.polygon, [vx, vy]] } : z,
      ),
    );
  }

  // Double-click → close polygon & stop drawing
  function onCanvasDblClick(e: React.MouseEvent<HTMLCanvasElement>) {
    e.preventDefault();
    if (!drawing) return;
    setDrawing(false);
    setMsg({ ok: true, text: `"${zones[activeIdx].name}" 구역 설정 완료! 저장하려면 [저장] 버튼을 누르세요.` });
  }

  // Image upload
  function onImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setImgNatW(img.naturalWidth);
      setImgNatH(img.naturalHeight);
      setImgSrc(url);
    };
    img.src = url;
  }

  // RTSP snapshot
  async function takeSnapshot() {
    setSnapshotLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/snapshot");
      if (!res.ok) {
        const j = (await res.json()) as { error: string };
        setMsg({ ok: false, text: j.error ?? "스냅샷 실패" });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        setImgNatW(img.naturalWidth);
        setImgNatH(img.naturalHeight);
        setImgSrc(url);
      };
      img.src = url;
      setMsg({ ok: true, text: "RTSP 스냅샷 불러오기 성공" });
    } catch {
      setMsg({ ok: false, text: "스냅샷 API 에러 (Python이 실행 중인지 확인하세요)" });
    } finally {
      setSnapshotLoading(false);
    }
  }

  // Clear current zone polygon
  function clearZone(i: number) {
    setZones((prev) => prev.map((z, idx) => (idx === i ? { ...z, polygon: [] } : z)));
    setDrawing(false);
  }

  function addZone() {
    const newZone: ZoneEntry = {
      name: `zone_${zones.length + 1}`,
      motion_active_threshold: 18,
      polygon: [],
      color: ZONE_COLORS[zones.length % ZONE_COLORS.length],
    };
    setZones((prev) => [...prev, newZone]);
    setActiveIdx(zones.length);
  }

  function removeZone(i: number) {
    if (!confirm("이 구역을 삭제하시겠습니까?")) return;
    setZones((prev) => prev.filter((_, idx) => idx !== i));
    setActiveIdx(Math.max(0, i - 1));
    setDrawing(false);
  }

  function updateZoneName(i: number, name: string) {
    setZones((prev) => prev.map((z, idx) => (idx === i ? { ...z, name } : z)));
  }

  function updateZoneThr(i: number, thr: number) {
    setZones((prev) =>
      prev.map((z, idx) => (idx === i ? { ...z, motion_active_threshold: thr } : z)),
    );
  }

  // Save to zones.yaml
  async function save() {
    const invalid = zones.find((z) => z.polygon.length < 3);
    if (invalid) {
      setMsg({ ok: false, text: `"${invalid.name}" 구역의 폴리곤 점이 3개 미만입니다.` });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/zones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zones: zones.map(({ name, motion_active_threshold, polygon }) => ({
            name,
            motion_active_threshold,
            polygon,
          })),
        }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && j.ok) {
        setMsg({ ok: true, text: "✓ zones.yaml 저장 완료! Python 수집기(main.py)를 재시작하면 반영됩니다." });
      } else {
        setMsg({ ok: false, text: j.error ?? "저장 실패" });
      }
    } catch {
      setMsg({ ok: false, text: "저장 중 오류가 발생했습니다." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-base font-semibold text-white">구역(Zone) 설정</h1>
            <p className="text-xs text-zinc-400">
              사진 위를 클릭하여 구역을 지정 · 더블클릭으로 완료 · <kbd className="rounded bg-zinc-700 px-1">Esc</kbd>로 그리기 취소
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => router.push("/dashboard")} className="rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800">
              ← 대시보드
            </button>
            <button
              onClick={() => void save()}
              disabled={saving}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {saving ? "저장 중…" : "저장"}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-4 p-4">
        {/* Left: canvas */}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {/* Image toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <label className="cursor-pointer rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700">
              📂 사진 업로드
              <input type="file" accept="image/*" className="hidden" onChange={onImageUpload} />
            </label>
            <button
              onClick={() => void takeSnapshot()}
              disabled={snapshotLoading}
              className="rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
            >
              {snapshotLoading ? "캡처 중…" : "📷 RTSP 스냅샷"}
            </button>

            {drawing ? (
              <span className="rounded-xl bg-blue-600/20 px-3 py-2 text-sm text-blue-300">
                ✏️ <strong>{zones[activeIdx]?.name}</strong> 그리는 중 — 클릭으로 점 추가, 더블클릭으로 완료
              </span>
            ) : null}
          </div>

          {/* Canvas */}
          <div
            ref={containerRef}
            className="w-full overflow-hidden rounded-2xl border border-zinc-700"
            style={{ cursor: drawing ? "crosshair" : "default" }}
          >
            <canvas
              ref={canvasRef}
              width={canvasW}
              height={canvasH}
              className="block w-full"
              onClick={onCanvasClick}
              onDoubleClick={onCanvasDblClick}
              onKeyDown={(e) => { if (e.key === "Escape") setDrawing(false); }}
              tabIndex={0}
            />
          </div>

          {msg ? (
            <div className={["rounded-xl px-4 py-3 text-sm", msg.ok ? "bg-emerald-900/40 text-emerald-300" : "bg-red-900/40 text-red-300"].join(" ")}>
              {msg.text}
            </div>
          ) : null}
        </div>

        {/* Right: zone list */}
        <div className="flex w-72 shrink-0 flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-white">구역 목록</span>
            <button onClick={addZone} className="rounded-xl border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700">
              + 추가
            </button>
          </div>

          {zones.map((z, i) => (
            <div
              key={i}
              className={[
                "rounded-2xl border p-4 transition-all",
                i === activeIdx
                  ? "border-blue-500 bg-zinc-800"
                  : "border-zinc-700 bg-zinc-900 hover:border-zinc-600",
              ].join(" ")}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ background: z.color }} />
                  <span className="text-xs font-semibold text-white">구역 {i + 1}</span>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => { setActiveIdx(i); setDrawing(false); }}
                    className="rounded-lg px-2 py-1 text-xs text-zinc-400 hover:text-white"
                  >
                    선택
                  </button>
                  <button
                    onClick={() => removeZone(i)}
                    className="rounded-lg px-2 py-1 text-xs text-red-500 hover:text-red-300"
                  >
                    삭제
                  </button>
                </div>
              </div>

              <div className="mt-3 space-y-2">
                <div>
                  <label className="text-xs text-zinc-500">Zone ID (DB와 일치)</label>
                  <input
                    type="text"
                    value={z.name}
                    onChange={(e) => updateZoneName(i, e.target.value)}
                    className="mt-0.5 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs font-mono text-white outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-500">활동 임계값</label>
                  <input
                    type="number"
                    step="0.5"
                    value={z.motion_active_threshold}
                    onChange={(e) => updateZoneThr(i, parseFloat(e.target.value) || 18)}
                    className="mt-0.5 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-white outline-none focus:border-blue-500"
                  />
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => { setActiveIdx(i); setDrawing(true); }}
                    className={[
                      "flex-1 rounded-lg py-1.5 text-xs font-semibold",
                      i === activeIdx && drawing
                        ? "bg-blue-600 text-white"
                        : "border border-zinc-600 text-zinc-300 hover:border-blue-500 hover:text-blue-300",
                    ].join(" ")}
                  >
                    {i === activeIdx && drawing ? "✏️ 그리는 중" : "✏️ 그리기"}
                  </button>
                  <button
                    onClick={() => clearZone(i)}
                    className="rounded-lg border border-zinc-700 px-2 py-1.5 text-xs text-zinc-400 hover:border-red-700 hover:text-red-400"
                  >
                    초기화
                  </button>
                </div>

                <div className="text-xs text-zinc-500">
                  {z.polygon.length < 3
                    ? `점 ${z.polygon.length}개 (최소 3개 필요)`
                    : `✓ 점 ${z.polygon.length}개`}
                </div>
              </div>
            </div>
          ))}

          {/* Guide */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-xs text-zinc-500 space-y-1">
            <p className="font-medium text-zinc-400">사용 방법</p>
            <p>1. 사진 업로드 또는 RTSP 스냅샷</p>
            <p>2. 구역을 선택 후 [✏️ 그리기] 클릭</p>
            <p>3. 화면을 클릭해 꼭짓점 추가</p>
            <p>4. 더블클릭으로 완료</p>
            <p>5. 모든 구역 완료 후 [저장] 클릭</p>
          </div>
        </div>
      </div>
    </div>
  );
}
