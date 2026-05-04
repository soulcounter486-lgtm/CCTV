"use client";

import { useEffect, useRef, useState } from "react";
import type { ZoneDef } from "@/app/dashboard/dummy";

const STREAM_URL = process.env.NEXT_PUBLIC_STREAM_URL ?? "";

// Derive base URL for /status endpoint (same origin as the stream)
function getStatusUrl(streamUrl: string): string {
  try {
    const u = new URL(streamUrl);
    return `${u.protocol}//${u.host}/status`;
  } catch {
    return "";
  }
}

const STATUS_URL = getStatusUrl(STREAM_URL);

export function ZoneMonitor({
  zones,
  live,
}: {
  zones: ZoneDef[];
  live: Record<string, { personCount: number; active: boolean; motion: number }>;
}) {
  const [rtspConnected, setRtspConnected] = useState<boolean | null>(null); // null = unknown
  const [streamError, setStreamError] = useState(false);
  const [showLive, setShowLive] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll /status every 3 seconds to know if RTSP camera is connected
  useEffect(() => {
    if (!STATUS_URL) return;

    const poll = async () => {
      try {
        const res = await fetch(STATUS_URL, { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          const data: { connected: boolean } = await res.json();
          setRtspConnected(data.connected);
          if (data.connected) setStreamError(false);
        }
      } catch {
        // stream server not running
        setRtspConnected(null);
      }
    };

    poll();
    pollRef.current = setInterval(poll, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const streamServerRunning = rtspConnected !== null; // null = server not reachable
  const streamLive = streamServerRunning && rtspConnected && !streamError && showLive;
  const streamActive = !!STREAM_URL && !streamError && showLive; // img is shown

  // Badge label
  let badgeLabel = "정지";
  let badgeDot = "bg-zinc-400";
  let badgeCls = "bg-zinc-100 text-zinc-600";
  if (STREAM_URL && showLive && streamServerRunning) {
    if (rtspConnected) {
      badgeLabel = "라이브";
      badgeDot = "bg-emerald-500 animate-pulse";
      badgeCls = "bg-emerald-50 text-emerald-700";
    } else {
      badgeLabel = "카메라 재연결 중";
      badgeDot = "bg-amber-400 animate-pulse";
      badgeCls = "bg-amber-50 text-amber-700";
    }
  } else if (STREAM_URL && showLive && !streamServerRunning) {
    badgeLabel = "서버 오프라인";
    badgeDot = "bg-red-400";
    badgeCls = "bg-red-50 text-red-700";
  }

  return (
    <div className="rounded-3xl border bg-white p-5 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-zinc-950">구역 모니터링</div>
          <div className="text-xs text-zinc-500">최근 1분 집계 기준 실시간 상태</div>
        </div>
        {STREAM_URL ? (
          <button
            onClick={() => { setShowLive((p) => !p); setStreamError(false); }}
            className={[
              "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap",
              badgeCls,
            ].join(" ")}
          >
            <span className={["h-1.5 w-1.5 shrink-0 rounded-full", badgeDot].join(" ")} />
            {showLive ? badgeLabel : "정지"}
          </button>
        ) : null}
      </div>

      {/* Zone status cards — always visible */}
      <div className="mt-4 grid grid-cols-1 gap-3">
        {zones.map((z) => {
          const c = live[z.id] ?? { personCount: 0, active: false, motion: 0 };
          return (
            <div
              key={z.id}
              className={[
                "flex items-center justify-between gap-3 rounded-2xl border-l-4 px-4 py-3",
                c.active
                  ? "border-emerald-400 bg-emerald-50"
                  : "border-zinc-200 bg-zinc-50",
              ].join(" ")}
            >
              <div className="flex items-center gap-3">
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ background: z.color }}
                />
                <div>
                  <div className="text-sm font-semibold text-zinc-950">{z.labelKo}</div>
                  <div className="text-xs text-zinc-500">{z.id}</div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500">
                  인원 <span className="font-semibold text-zinc-800">{c.personCount}명</span>
                </span>
                <span className="text-xs text-zinc-500">
                  모션 <span className="font-semibold text-zinc-800">{c.motion.toFixed(1)}</span>
                </span>
                <span
                  className={[
                    "rounded-full px-2.5 py-1 text-xs font-semibold",
                    c.active
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-zinc-200 text-zinc-700",
                  ].join(" ")}
                >
                  {c.active ? "Active" : "Idle"}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Camera view */}
      <div className="relative mt-4 w-full overflow-hidden rounded-2xl border bg-zinc-950 min-h-[180px]">
        {!STREAM_URL ? (
          /* Stream URL not configured at all */
          <div className="flex h-44 flex-col items-center justify-center gap-2 text-center px-4">
            <div className="text-2xl">📷</div>
            <div className="text-xs font-semibold text-zinc-400">실시간 영상 미설정</div>
            <code className="mt-1 block rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300">
              python stream_server.py
            </code>
            <div className="text-xs text-zinc-600">
              실행 후 <code className="text-zinc-400">NEXT_PUBLIC_STREAM_URL</code> 설정 필요
            </div>
          </div>
        ) : !showLive ? (
          /* User toggled off */
          <div className="flex h-44 items-center justify-center text-xs text-zinc-500">
            영상 일시 정지 — 버튼을 눌러 다시 시작
          </div>
        ) : !streamServerRunning ? (
          /* Stream server not reachable */
          <div className="flex h-44 flex-col items-center justify-center gap-2 text-center px-4">
            <div className="text-2xl">🔌</div>
            <div className="text-xs font-semibold text-zinc-400">스트림 서버 오프라인</div>
            <code className="mt-1 rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300">
              python stream_server.py
            </code>
            <div className="text-xs text-zinc-600">명령어 실행 후 자동으로 연결됩니다</div>
          </div>
        ) : (
          /* Stream server running — show img (may be live or offline placeholder) */
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={STREAM_URL}
              src={STREAM_URL}
              alt="Live RTSP stream"
              className="h-auto w-full object-cover"
              style={{ maxHeight: 360, display: "block" }}
              onError={() => setStreamError(true)}
            />

            {/* RTSP offline overlay badge */}
            {!rtspConnected && (
              <div className="absolute top-2 left-2 flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                <span className="text-xs font-semibold text-amber-300">카메라 재연결 중…</span>
              </div>
            )}

            {/* SVG zone overlays */}
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full"
              viewBox="0 0 1000 560"
              preserveAspectRatio="none"
            >
              {zones.map((z) => {
                const pts = z.polygonPct
                  .map(([px, py]) => `${px * 1000},${py * 560}`)
                  .join(" ");
                return (
                  <polygon
                    key={z.id}
                    points={pts}
                    fill={z.color}
                    fillOpacity={0.15}
                    stroke={z.color}
                    strokeOpacity={0.9}
                    strokeWidth={2.5}
                  />
                );
              })}
            </svg>

            {/* Zone labels */}
            {zones.map((z) => {
              const xs = z.polygonPct.map((p) => p[0]);
              const ys = z.polygonPct.map((p) => p[1]);
              const cx = ((Math.min(...xs) + Math.max(...xs)) / 2) * 100;
              const cy = ((Math.min(...ys) + Math.max(...ys)) / 2) * 100;
              const c = live[z.id] ?? { personCount: 0, active: false, motion: 0 };
              return (
                <div
                  key={z.id}
                  className="absolute"
                  style={{ left: `${cx}%`, top: `${cy}%`, transform: "translate(-50%,-50%)" }}
                >
                  <div
                    className="rounded-lg px-2 py-0.5 text-xs font-bold text-white shadow"
                    style={{ background: z.color + "cc" }}
                  >
                    {z.labelKo} {c.active ? "●" : "○"}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
