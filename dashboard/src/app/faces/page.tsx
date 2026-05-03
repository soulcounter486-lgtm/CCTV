"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

type Employee = { name: string; photoCount: number };

export default function FacesPage() {
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auth guard
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace("/login?next=/faces");
    });
  }, [router]);

  const fetchList = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const res = await fetch("/api/faces");
      if (!res.ok) {
        const j = (await res.json()) as { error: string };
        setListError(j.error ?? "Failed to load employee list");
        return;
      }
      const j = (await res.json()) as { employees: Employee[] };
      setEmployees(j.employees);
    } catch {
      setListError("Network error");
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    if (f) {
      const url = URL.createObjectURL(f);
      setPreview(url);
    } else {
      setPreview(null);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !file) return;

    setUploading(true);
    setUploadMsg(null);

    const fd = new FormData();
    fd.append("name", name.trim());
    fd.append("file", file);

    try {
      const res = await fetch("/api/faces", { method: "POST", body: fd });
      const j = (await res.json()) as { ok?: boolean; error?: string };

      if (res.ok && j.ok) {
        setUploadMsg({ ok: true, text: `"${name}" 등록 완료!` });
        setName("");
        setFile(null);
        setPreview(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        void fetchList();
      } else {
        setUploadMsg({ ok: false, text: j.error ?? "Upload failed" });
      }
    } catch {
      setUploadMsg({ ok: false, text: "Network error" });
    } finally {
      setUploading(false);
    }
  }

  async function onDelete(empName: string) {
    if (!confirm(`"${empName}" 직원을 삭제하시겠습니까?`)) return;
    await fetch(`/api/faces?name=${encodeURIComponent(empName)}`, { method: "DELETE" });
    void fetchList();
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-lg font-semibold text-zinc-950">직원 얼굴 DB 관리</h1>
            <p className="text-xs text-zinc-500">
              로컬 <code className="rounded bg-zinc-100 px-1">faces_db/</code> 폴더에 저장됩니다 (개발 모드 전용)
            </p>
          </div>
          <button
            onClick={() => router.push("/dashboard")}
            className="rounded-2xl border bg-white px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
          >
            ← 대시보드
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">

        {/* Registration form */}
        <div className="rounded-3xl border bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-950">직원 등록</h2>
          <p className="mt-1 text-xs text-zinc-500">
            정면 얼굴이 잘 보이는 사진을 사용하세요. 여러 장 등록할수록 인식률이 높아집니다.
          </p>

          <form className="mt-5 space-y-4" onSubmit={onSubmit}>
            <div className="flex flex-col gap-4 sm:flex-row">
              {/* Preview */}
              <div className="flex h-40 w-40 shrink-0 items-center justify-center overflow-hidden rounded-2xl border bg-zinc-50">
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="preview" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xs text-zinc-400">미리보기</span>
                )}
              </div>

              <div className="flex flex-1 flex-col gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-700">직원 이름</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="예: 홍길동"
                    required
                    className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-700">얼굴 사진</label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={onFileChange}
                    required
                    className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900"
                  />
                  <p className="mt-1 text-xs text-zinc-400">JPG / PNG / WebP, 최대 10 MB</p>
                </div>

                <button
                  type="submit"
                  disabled={uploading || !name.trim() || !file}
                  className="self-start rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
                >
                  {uploading ? "업로드 중…" : "등록"}
                </button>
              </div>
            </div>

            {uploadMsg ? (
              <div
                className={[
                  "rounded-xl px-4 py-3 text-sm",
                  uploadMsg.ok
                    ? "bg-emerald-50 text-emerald-800"
                    : "bg-red-50 text-red-800",
                ].join(" ")}
              >
                {uploadMsg.text}
              </div>
            ) : null}
          </form>
        </div>

        {/* Employee list */}
        <div className="rounded-3xl border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-950">등록된 직원</h2>
            <button
              onClick={fetchList}
              className="rounded-xl border px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            >
              새로고침
            </button>
          </div>

          <div className="mt-4">
            {loadingList ? (
              <p className="text-sm text-zinc-500">불러오는 중…</p>
            ) : listError ? (
              <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
                {listError}
                {listError.includes("local dev") ? (
                  <p className="mt-1 text-xs">이 기능은 <code>npm run dev</code> 로컬 실행 시에만 사용할 수 있습니다.</p>
                ) : null}
              </div>
            ) : employees.length === 0 ? (
              <p className="text-sm text-zinc-500">등록된 직원이 없습니다. 위 양식에서 등록해주세요.</p>
            ) : (
              <ul className="divide-y">
                {employees.map((emp) => (
                  <li key={emp.name} className="flex items-center justify-between py-3">
                    <div>
                      <span className="font-medium text-zinc-950">{emp.name}</span>
                      <span className="ml-3 text-xs text-zinc-500">사진 {emp.photoCount}장</span>
                    </div>
                    <button
                      onClick={() => onDelete(emp.name)}
                      className="rounded-xl border px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      삭제
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* CLI guide */}
        <div className="rounded-3xl border border-dashed bg-white p-6 text-sm text-zinc-600">
          <p className="font-medium text-zinc-900">CLI로도 등록 가능합니다</p>
          <pre className="mt-2 overflow-x-auto rounded-xl bg-zinc-50 px-4 py-3 text-xs">
{`python -m kitchen_activity.face_encoder register --name "홍길동" --image photo.jpg
python -m kitchen_activity.face_encoder list
python -m kitchen_activity.face_encoder delete --name "홍길동"`}
          </pre>
        </div>
      </main>
    </div>
  );
}
