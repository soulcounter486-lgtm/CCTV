"use client";

export function ControlBar({
  value,
  onChange,
  title,
  subtitle,
  idleThreshold,
  email,
  onLogout,
}: {
  value: string;
  onChange: (next: string) => void;
  title: string;
  subtitle: string;
  idleThreshold: number;
  email?: string | null;
  onLogout?: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 border-b bg-white/80 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 py-3">
        {/* Row 1: title + action buttons */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold tracking-tight text-zinc-950 sm:text-lg">
              {title}
            </h1>
            <p className="hidden truncate text-xs text-zinc-500 sm:block">{subtitle}</p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {email ? (
              <span className="hidden text-xs text-zinc-400 lg:inline">{email}</span>
            ) : null}

            <a
              href="/faces"
              className="rounded-xl border bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-900 hover:bg-zinc-50 sm:px-3 sm:py-2 sm:text-sm"
            >
              직원 관리
            </a>

            <a
              href="/zones"
              className="rounded-xl border bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-900 hover:bg-zinc-50 sm:px-3 sm:py-2 sm:text-sm"
            >
              구역 설정
            </a>

            {onLogout ? (
              <button
                onClick={onLogout}
                className="rounded-xl border bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-900 hover:bg-zinc-50 sm:px-3 sm:py-2 sm:text-sm"
              >
                로그아웃
              </button>
            ) : null}
          </div>
        </div>

        {/* Row 2: date picker + threshold */}
        <div className="mt-2 flex items-center gap-2">
          <label className="flex items-center gap-1.5 rounded-xl border bg-white px-2.5 py-1.5 text-xs sm:text-sm">
            <span className="text-zinc-500">날짜</span>
            <input
              type="date"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="bg-transparent text-xs font-medium outline-none sm:text-sm"
            />
          </label>

          <div className="rounded-xl border bg-zinc-50 px-2.5 py-1.5 text-xs text-zinc-600">
            임계값 <span className="font-semibold text-zinc-950">≥ {idleThreshold}</span> = Active
          </div>
        </div>
      </div>
    </header>
  );
}
