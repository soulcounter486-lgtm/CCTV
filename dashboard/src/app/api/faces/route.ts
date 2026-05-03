/**
 * /api/faces — Local-only API for managing the faces_db directory.
 *
 * GET  /api/faces          → list employees
 * POST /api/faces          → register a new face (multipart: name + file)
 * DELETE /api/faces?name=X → delete an employee
 *
 * ⚠️  Writes to the filesystem: works only when running `npm run dev` locally
 *     (same machine as the Python backend). On Vercel this returns 503.
 */
import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";

// faces_db is two levels up from dashboard/  → d:\CCTV\faces_db
const FACES_DB = path.resolve(process.cwd(), "..", "faces_db");

function isLocal(): boolean {
  return process.env.NODE_ENV === "development";
}

function clearReprCache(): void {
  // Delete DeepFace representation pickle cache files
  function walk(dir: string) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) walk(full);
      else if (entry.startsWith("representations_") && entry.endsWith(".pkl")) {
        fs.unlinkSync(full);
      }
    }
  }
  walk(FACES_DB);
}

// ── GET: list employees ────────────────────────────────────────────────────────
export async function GET() {
  if (!isLocal()) {
    return NextResponse.json({ error: "Only available in local dev mode" }, { status: 503 });
  }

  if (!fs.existsSync(FACES_DB)) {
    return NextResponse.json({ employees: [] });
  }

  const employees = fs
    .readdirSync(FACES_DB)
    .filter((name) => fs.statSync(path.join(FACES_DB, name)).isDirectory())
    .map((name) => {
      const dir = path.join(FACES_DB, name);
      const photos = fs
        .readdirSync(dir)
        .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f));
      return { name, photoCount: photos.length };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ employees });
}

// ── POST: register a face ──────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!isLocal()) {
    return NextResponse.json({ error: "Only available in local dev mode" }, { status: 503 });
  }

  const formData = await req.formData();
  const name = (formData.get("name") as string | null)?.trim();
  const file = formData.get("file") as File | null;

  if (!name || !file) {
    return NextResponse.json({ error: "name and file are required" }, { status: 400 });
  }
  if (!/^[\w가-힣 ._-]+$/.test(name)) {
    return NextResponse.json({ error: "Invalid name (alphanumeric / Korean only)" }, { status: 400 });
  }

  const empDir = path.join(FACES_DB, name);
  fs.mkdirSync(empDir, { recursive: true });

  const existing = fs
    .readdirSync(empDir)
    .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f));
  const idx = String(existing.length + 1).padStart(2, "0");

  const ext = path.extname(file.name).toLowerCase() || ".jpg";
  const destPath = path.join(empDir, `${idx}${ext}`);

  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(destPath, buffer);

  clearReprCache();

  return NextResponse.json({ ok: true, saved: destPath });
}

// ── DELETE: remove an employee ─────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  if (!isLocal()) {
    return NextResponse.json({ error: "Only available in local dev mode" }, { status: 503 });
  }

  const name = req.nextUrl.searchParams.get("name")?.trim();
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const empDir = path.join(FACES_DB, name);
  if (!fs.existsSync(empDir)) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  fs.rmSync(empDir, { recursive: true });
  clearReprCache();

  return NextResponse.json({ ok: true });
}
