/**
 * /api/zones — Local-only API to read and update config/zones.yaml
 *
 * GET  /api/zones          → return parsed zones
 * POST /api/zones          → replace zones (body: { zones: Zone[] })
 *
 * ⚠️  File system access: only works in `npm run dev` local mode.
 *     On Vercel this returns 503.
 */
import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";

// zones.yaml lives two levels above dashboard/
const ZONES_YAML = path.resolve(process.cwd(), "..", "config", "zones.yaml");

function isLocal() {
  return process.env.NODE_ENV === "development";
}

type Point = [number, number];
type ZoneEntry = { name: string; motion_active_threshold: number; polygon: Point[] };

function parseYaml(raw: string): ZoneEntry[] {
  // Minimal YAML parser for our specific zones.yaml structure.
  // Uses regex to avoid adding a yaml npm dependency to the API route.
  const zones: ZoneEntry[] = [];
  const zoneBlocks = raw.split(/\n(?=  - name:)/).filter((b) => b.includes("name:"));

  for (const block of zoneBlocks) {
    const nameMatch = block.match(/name:\s*(.+)/);
    const thrMatch = block.match(/motion_active_threshold:\s*([\d.]+)/);
    const polyMatches = [...block.matchAll(/- \[(\d+),\s*(\d+)\]/g)];

    if (!nameMatch) continue;

    const name = nameMatch[1].trim();
    const thr = thrMatch ? parseFloat(thrMatch[1]) : 18.0;
    const polygon: Point[] = polyMatches.map((m) => [parseInt(m[1]), parseInt(m[2])]);

    if (polygon.length >= 3) {
      zones.push({ name, motion_active_threshold: thr, polygon });
    }
  }
  return zones;
}

function toYaml(zones: ZoneEntry[]): string {
  let out = "zones:\n";
  for (const z of zones) {
    out += `  - name: ${z.name}\n`;
    out += `    motion_active_threshold: ${z.motion_active_threshold}\n`;
    out += `    polygon:\n`;
    for (const [x, y] of z.polygon) {
      out += `      - [${x}, ${y}]\n`;
    }
  }
  return out;
}

export async function GET() {
  if (!isLocal()) {
    return NextResponse.json({ error: "Only available in local dev mode" }, { status: 503 });
  }

  if (!fs.existsSync(ZONES_YAML)) {
    return NextResponse.json({ zones: [] });
  }

  const raw = fs.readFileSync(ZONES_YAML, "utf-8");
  const zones = parseYaml(raw);
  return NextResponse.json({ zones });
}

export async function POST(req: NextRequest) {
  if (!isLocal()) {
    return NextResponse.json({ error: "Only available in local dev mode" }, { status: 503 });
  }

  const body = (await req.json()) as { zones: ZoneEntry[] };
  if (!Array.isArray(body.zones)) {
    return NextResponse.json({ error: "zones array is required" }, { status: 400 });
  }

  for (const z of body.zones) {
    if (!z.name?.trim()) return NextResponse.json({ error: "Zone name required" }, { status: 400 });
    if (!Array.isArray(z.polygon) || z.polygon.length < 3)
      return NextResponse.json({ error: `Zone '${z.name}' needs ≥ 3 polygon points` }, { status: 400 });
  }

  const yaml = toYaml(body.zones);
  fs.mkdirSync(path.dirname(ZONES_YAML), { recursive: true });
  fs.writeFileSync(ZONES_YAML, yaml, "utf-8");

  return NextResponse.json({ ok: true });
}
