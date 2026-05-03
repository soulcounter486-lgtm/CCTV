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
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight text-zinc-950">{title}</h1>
          <p className="truncate text-sm text-zinc-600">{subtitle}</p>
        </div>

        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          <label className="flex items-center gap-2 rounded-2xl border bg-white px-3 py-2 text-sm">
            <span className="text-zinc-600">날짜</span>
            <input
              type="date"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="rounded-xl bg-transparent text-sm font-medium outline-none"
            />
          </label>

          <div className="rounded-2xl border bg-white px-3 py-2 text-sm text-zinc-700">
            임계값: <span className="font-semibold text-zinc-950">≥ {idleThreshold}</span> = Active
          </div>

          {email ? (
            <span className="hidden text-sm text-zinc-500 sm:inline">{email}</span>
          ) : null}

          <a
            href="/faces"
            className="rounded-2xl border bg-white px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
          >
            직원 관리
          </a>

          {onLogout ? (
            <button
              onClick={onLogout}
              className="rounded-2xl border bg-white px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
            >
              로그아웃
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
