"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextUrl = useMemo(() => searchParams.get("next") ?? "/", [searchParams]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace(nextUrl);
    });
  }, [router, nextUrl]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.replace(nextUrl);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50">
      <div className="w-full max-w-sm rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Kitchen Activity Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-600">로그인 후 대시보드를 확인할 수 있어요.</p>

        <form className="mt-6 space-y-3" onSubmit={onSubmit}>
          <div className="space-y-1">
            <label className="text-sm font-medium">Email</label>
            <input
              className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Password</label>
            <input
              className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          {error ? (
            <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>

          <div className="pt-1 text-center">
            <Link className="text-sm font-medium text-zinc-900 underline underline-offset-4" href="/forgot">
              비밀번호를 잊으셨나요?
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

