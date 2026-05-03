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
  const [useStream, setUseStream] = useState(!!STREAM_URL);

  const showStream = useStream && !!STREAM_URL && !streamError;

  return (
    <div className="rounded-3xl border bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-zinc-950">구역 모니터링</div>
          <div className="text-xs text-zinc-600">가장 최근 1분 집계 기준으로 Zone별 상태를 표시합니다.</div>
        </div>
        <div className="flex items-center gap-2">
          {STREAM_URL ? (
            <button
              onClick={() => { setUseStream((p) => !p); setStreamError(false); }}
              className={[
                "rounded-full px-3 py-1 text-xs font-semibold",
                showStream
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-zinc-100 text-zinc-600",
              ].join(" ")}
            >
              {showStream ? "● 라이브" : "정지"}
            </button>
          ) : null}
          <div className="rounded-full border bg-zinc-50 px-3 py-1 text-xs text-zinc-700">
            실시간 갱신
          </div>
        </div>
      </div>

      <div className="mt-4">
        <div className="relative w-full overflow-hidden rounded-2xl border bg-zinc-950/5">
          {/* Video / image */}
          {showStream ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={STREAM_URL}
              alt="Live RTSP stream"
              className="h-auto w-full max-h-[420px] object-cover"
              onError={() => setStreamError(true)}
            />
          ) : (
            <>
              {/* Placeholder with hint when stream is not configured */}
              <div className="flex h-48 items-center justify-center bg-zinc-900 text-xs text-zinc-500 sm:h-64">
                {STREAM_URL && streamError ? (
                  <span>
                    스트림 연결 실패. <code>python stream_server.py</code> 를 실행하세요.
                  </span>
                ) : (
                  <span>
                    실시간 영상은 <code>stream_server.py</code> 실행 후<br />
                    <code>NEXT_PUBLIC_STREAM_URL</code> 환경변수를 설정하면 나타납니다.
                  </span>
                )}
              </div>
            </>
          )}

          {/* SVG zone overlays */}
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox="0 0 1000 560"
            preserveAspectRatio="none"
          >
            {zones.map((z) => {
              const poly = z.polygonPct.map(([px, py]) => [px * 1000, py * 560] as [number, number]);
              const points = poly.map((p) => p.join(",")).join(" ");
              return (
                <polygon
                  key={z.id}
                  points={points}
                  fill={z.color}
                  fillOpacity={0.12}
                  stroke={z.color}
                  strokeOpacity={0.8}
                  strokeWidth={2}
                />
              );
            })}
          </svg>

          {/* Status badges */}
          {zones.map((z) => {
            const c = live[z.id] ?? { personCount: 0, active: false, motion: 0 };
            const xs = z.polygonPct.map((p) => p[0]);
            const ys = z.polygonPct.map((p) => p[1]);
            const cx = ((Math.min(...xs) + Math.max(...xs)) / 2) * 100;
            const cy = ((Math.min(...ys) + Math.max(...ys)) / 2) * 100;

            return (
              <div
                key={z.id}
                className="absolute"
                style={{
                  left: `${cx}%`,
                  top: `${cy}%`,
                  transform: "translate(-50%, -55%)",
                }}
              >
                <div className="flex min-w-[160px] flex-col gap-1.5 rounded-2xl border bg-white/95 p-2 shadow-sm backdrop-blur">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-zinc-950">{z.labelKo}</div>
                    <span
                      className={[
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        c.active ? "bg-emerald-50 text-emerald-800" : "bg-zinc-100 text-zinc-700",
                      ].join(" ")}
                    >
                      {c.active ? "Active" : "Idle"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-zinc-700">
                    <span className="rounded-full bg-zinc-50 px-2 py-1 font-semibold text-zinc-900">
                      추정 인원 {c.personCount}명
                    </span>
                    <span className="rounded-full bg-zinc-50 px-2 py-1 font-semibold text-zinc-900">
                      {c.motion.toFixed(1)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Stream URL hint */}
        {!STREAM_URL ? (
          <p className="mt-2 text-xs text-zinc-400">
            💡 실시간 영상 활성화: <code>python stream_server.py</code> 실행 후{" "}
            <code>dashboard/.env.local</code>에{" "}
            <code>NEXT_PUBLIC_STREAM_URL=http://localhost:8090/stream</code> 추가
          </p>
        ) : null}
      </div>
    </div>
  );
}
