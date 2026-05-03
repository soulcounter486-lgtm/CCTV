"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // When arriving via email link, Supabase exchanges code for a session.
    supabase.auth.getSession().then(({ data }) => {
      setReady(!!data.session);
    });
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.replace("/login");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50">
      <div className="w-full max-w-sm rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">새 비밀번호 설정</h1>
        <p className="mt-1 text-sm text-zinc-600">재설정 링크로 접속한 경우에만 설정할 수 있어요.</p>

        {!ready ? (
          <div className="mt-6 rounded-xl bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
            재설정 링크를 통해 접속해주세요. <Link className="underline" href="/forgot">재설정 메일 보내기</Link>
          </div>
        ) : (
          <form className="mt-6 space-y-3" onSubmit={onSubmit}>
            <div className="space-y-1">
              <label className="text-sm font-medium">New password</label>
              <input
                className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                minLength={8}
              />
            </div>

            {error ? <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
            >
              {loading ? "Updating..." : "비밀번호 변경"}
            </button>
          </form>
        )}

        <div className="mt-4 text-center">
          <Link className="text-sm font-medium text-zinc-900 underline underline-offset-4" href="/login">
            로그인으로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  );
}

