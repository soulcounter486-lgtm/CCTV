"use client";

import { useState } from "react";
import type { ZoneDef } from "@/app/dashboard/dummy";

const STREAM_URL = process.env.NEXT_PUBLIC_STREAM_URL ?? "";

export function ZoneMonitor({
  zones,
  live,
}: {
  zones: ZoneDef[];
  live: Record<string, { personCount: number; active: boolean; motion: number }>;
}) {
  const [streamError, setStreamError] = useState(false);
  const [showLive, setShowLive] = useState(true);

  const streamActive = !!STREAM_URL && !streamError && showLive;

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
              "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
              streamActive ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600",
            ].join(" ")}
          >
            <span className={["h-1.5 w-1.5 rounded-full", streamActive ? "bg-emerald-500 animate-pulse" : "bg-zinc-400"].join(" ")} />
            {streamActive ? "라이브" : "정지"}
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
                  추정 <span className="font-semibold text-zinc-800">{c.personCount}명</span>
                </span>
                <span className="text-xs text-zinc-500">
                  motion <span className="font-semibold text-zinc-800">{c.motion.toFixed(1)}</span>
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
      <div className="relative mt-4 w-full overflow-hidden rounded-2xl border bg-zinc-950">
        {streamActive ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={STREAM_URL}
              alt="Live RTSP stream"
              className="h-auto w-full max-h-72 object-cover"
              onError={() => setStreamError(true)}
            />
            {/* SVG zone overlays on live stream */}
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
            {/* Zone name labels on stream */}
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
                    className="rounded-lg px-2 py-0.5 text-xs font-bold text-white"
                    style={{ background: z.color + "cc" }}
                  >
                    {z.labelKo} {c.active ? "●" : "○"}
                  </div>
                </div>
              );
            })}
          </>
        ) : (
          <div className="flex h-36 items-center justify-center text-center text-xs text-zinc-500 px-4">
            {STREAM_URL && streamError
              ? <span><code>python stream_server.py</code>를 실행하면 라이브 영상이 나타납니다.</span>
              : <span>
                  라이브 영상: <code>python stream_server.py</code> 실행 후<br />
                  <code>NEXT_PUBLIC_STREAM_URL=http://localhost:8090/stream</code>
                </span>
            }
          </div>
        )}
      </div>
    </div>
  );
}
