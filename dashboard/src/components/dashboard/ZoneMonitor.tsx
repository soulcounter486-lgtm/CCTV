"use client";

import { useEffect, useRef, useState } from "react";
import type { ZoneDef } from "@/app/dashboard/dummy";

/**
 * Primary live feed URL for the Zone Monitor.
 *
 * Supports:
 * - MJPEG multipart stream (`.../stream`) — typically from `stream_server.py`
 * - HTTP snapshot endpoints — polled frequently to emulate "live"
 *
 * Back-compat: falls back to legacy `NEXT_PUBLIC_STREAM_URL`.
 */
const LIVE_URL = process.env.NEXT_PUBLIC_LIVE_URL ?? process.env.NEXT_PUBLIC_STREAM_URL ?? "";

/**
 * Snapshot polling interval (ms). Only used when URL looks like a snapshot endpoint.
 * Example: NEXT_PUBLIC_LIVE_POLL_MS=500
 */
const LIVE_POLL_MS = Number(process.env.NEXT_PUBLIC_LIVE_POLL_MS ?? "500");

/**
 * Optional explicit stream server status endpoint (recommended on HTTPS deployments).
 *
 * Example:
 *   NEXT_PUBLIC_STREAM_URL=http://14.237.71.208:8090/stream
 *   NEXT_PUBLIC_STREAM_STATUS_URL=http://14.237.71.208:8090/status
 */
const STATUS_URL = process.env.NEXT_PUBLIC_STREAM_STATUS_URL ?? "";

// Derive base URL for /status endpoint (same origin as the stream)
function getStatusUrlFromStream(streamUrl: string): string {
  try {
    const u = new URL(streamUrl);
    return `${u.protocol}//${u.host}/status`;
  } catch {
    return "";
  }
}

const STATUS_URL_DERIVED = getStatusUrlFromStream(LIVE_URL);
const RESOLVED_STATUS_URL = STATUS_URL || STATUS_URL_DERIVED;

function looksLikeSnapshotUrl(url: string): boolean {
  const u = url.toLowerCase();
  return (
    u.includes("snapshot") ||
    u.includes("snap") ||
    u.includes("jpg") ||
    u.includes("jpeg") ||
    u.includes("cgi-bin/snapshot")
  );
}

function looksLikeMjpegStream(url: string): boolean {
  const u = url.toLowerCase();
  return u.includes("/stream") || u.includes(".mjpg") || u.includes("multipart");
}

export function ZoneMonitor({
  zones,
  live,
}: {
  zones: ZoneDef[];
  live: Record<string, { personCount: number; active: boolean; motion: number }>;
}) {
  const [rtspConnected, setRtspConnected] = useState<boolean | null>(null); // null = unknown
  const [statusOk, setStatusOk] = useState<boolean | null>(null); // can we call /status?
  const [streamError, setStreamError] = useState(false);
  const [showLive, setShowLive] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const snapTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [snapshotTick, setSnapshotTick] = useState(0);

  const enableStatusPolling = looksLikeMjpegStream(LIVE_URL) && !!RESOLVED_STATUS_URL;

  // Best-effort: poll /status to know if RTSP is connected. This can fail on HTTPS due to
  // mixed content / CORS, so the UI must not treat failures as "server offline".
  useEffect(() => {
    if (!enableStatusPolling || !RESOLVED_STATUS_URL) return;

    const poll = async () => {
      try {
        const res = await fetch(RESOLVED_STATUS_URL, { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          setStatusOk(true);
          const data: { connected: boolean } = await res.json();
          setRtspConnected(data.connected);
          if (data.connected) setStreamError(false);
        } else {
          setStatusOk(false);
        }
      } catch {
        // Common on Vercel (https) if status URL is http:// (mixed content) or blocked.
        setStatusOk(false);
        setRtspConnected(null);
      }
    };

    poll();
    pollRef.current = setInterval(poll, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [enableStatusPolling, RESOLVED_STATUS_URL]);

  // Snapshot polling: browsers can't play RTSP; many cameras expose HTTP snapshot instead.
  useEffect(() => {
    if (!showLive) return;
    if (!LIVE_URL) return;
    if (!looksLikeSnapshotUrl(LIVE_URL)) return;

    const ms = Number.isFinite(LIVE_POLL_MS) && LIVE_POLL_MS > 50 ? LIVE_POLL_MS : 500;
    snapTimerRef.current = setInterval(() => setSnapshotTick((t) => t + 1), ms);
    return () => {
      if (snapTimerRef.current) clearInterval(snapTimerRef.current);
    };
  }, [showLive, LIVE_URL, LIVE_POLL_MS]);

  const displaySrc = (() => {
    if (!LIVE_URL) return "";
    if (!looksLikeSnapshotUrl(LIVE_URL)) return LIVE_URL;
    const sep = LIVE_URL.includes("?") ? "&" : "?";
    return `${LIVE_URL}${sep}t=${snapshotTick}`;
  })();

  // Badge label
  let badgeLabel = "정지";
  let badgeDot = "bg-zinc-400";
  let badgeCls = "bg-zinc-100 text-zinc-600";
  if (LIVE_URL && showLive) {
    if (streamError) {
      badgeLabel = "스트림 실패";
      badgeDot = "bg-red-400";
      badgeCls = "bg-red-50 text-red-700";
    } else if (looksLikeSnapshotUrl(LIVE_URL)) {
      badgeLabel = "라이브(스냅샷)";
      badgeDot = "bg-emerald-500 animate-pulse";
      badgeCls = "bg-emerald-50 text-emerald-700";
    } else if (enableStatusPolling && statusOk === true) {
      if (rtspConnected) {
        badgeLabel = "라이브";
        badgeDot = "bg-emerald-500 animate-pulse";
        badgeCls = "bg-emerald-50 text-emerald-700";
      } else {
        badgeLabel = "카메라 재연결 중";
        badgeDot = "bg-amber-400 animate-pulse";
        badgeCls = "bg-amber-50 text-amber-700";
      }
    } else {
      // status endpoint not usable (or unknown) — show neutral "라이브(확인중)"
      badgeLabel = "라이브(확인중)";
      badgeDot = "bg-sky-400 animate-pulse";
      badgeCls = "bg-sky-50 text-sky-800";
    }
  }

  return (
    <div className="rounded-3xl border bg-white p-5 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-zinc-950">구역 모니터링</div>
          <div className="text-xs text-zinc-500">최근 1분 집계 기준 실시간 상태</div>
        </div>
        {LIVE_URL ? (
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
        {!LIVE_URL ? (
          /* Stream URL not configured at all */
          <div className="flex h-44 flex-col items-center justify-center gap-2 text-center px-4">
            <div className="text-2xl">📷</div>
            <div className="text-xs font-semibold text-zinc-400">실시간 영상 미설정</div>
            <div className="text-xs text-zinc-600">
              아래 중 하나를 설정하세요.
            </div>
            <div className="mt-1 space-y-1 text-left text-xs text-zinc-600">
              <div>
                - <code className="text-zinc-400">NEXT_PUBLIC_LIVE_URL</code> (권장): 카메라 HTTP 스냅샷 또는 MJPEG URL
              </div>
              <div>
                - 또는 <code className="text-zinc-400">python stream_server.py</code> 후{" "}
                <code className="text-zinc-400">NEXT_PUBLIC_STREAM_URL</code>
              </div>
            </div>
          </div>
        ) : !showLive ? (
          /* User toggled off */
          <div className="flex h-44 items-center justify-center text-xs text-zinc-500">
            영상 일시 정지 — 버튼을 눌러 다시 시작
          </div>
        ) : streamError ? (
          /* Stream URL configured but <img> failed to load */
          <div className="flex h-44 flex-col items-center justify-center gap-2 text-center px-4">
            <div className="text-2xl">⚠️</div>
            <div className="text-xs font-semibold text-zinc-400">스트림 연결 실패</div>
            <div className="text-xs text-zinc-600">
              Vercel(https)에서는 <code className="text-zinc-400">http://</code> 스트림이 브라우저에서 차단될 수 있습니다.
            </div>
            <code className="mt-1 rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300 break-all">
              {LIVE_URL}
            </code>
          </div>
        ) : (
          /* Stream server running — show img (may be live or offline placeholder) */
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={`${LIVE_URL}:${snapshotTick}`}
              src={displaySrc}
              alt="Live camera feed"
              className="h-auto w-full object-cover"
              style={{ maxHeight: 360, display: "block" }}
              onLoad={() => setStreamError(false)}
              onError={() => setStreamError(true)}
            />

            {/* RTSP offline overlay badge */}
            {enableStatusPolling && statusOk === true && !rtspConnected && (
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
