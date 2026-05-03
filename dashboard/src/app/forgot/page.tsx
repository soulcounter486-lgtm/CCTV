"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    // Supabase will email a link. Configure redirect URL to /reset in Supabase Auth settings.
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset`,
    });

    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setMessage("비밀번호 재설정 이메일을 보냈습니다. 메일함을 확인해주세요.");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50">
      <div className="w-full max-w-sm rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">비밀번호 재설정</h1>
        <p className="mt-1 text-sm text-zinc-600">가입한 이메일로 재설정 링크를 보내드려요.</p>

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

          {error ? <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
          {message ? (
            <div className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
          >
            {loading ? "Sending..." : "재설정 메일 보내기"}
          </button>

          <div className="pt-1 text-center">
            <Link className="text-sm font-medium text-zinc-900 underline underline-offset-4" href="/login">
              로그인으로 돌아가기
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

