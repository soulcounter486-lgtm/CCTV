/**
 * /api/snapshot — Returns one JPEG frame from the RTSP stream.
 *
 * Calls the local Python helper (tools/snapshot.py) via child_process.
 * Only works in local dev mode.
 */
import { NextResponse } from "next/server";
import { execFile } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";

function isLocal() {
  return process.env.NODE_ENV === "development";
}

export async function GET() {
  if (!isLocal()) {
    return NextResponse.json({ error: "Only available in local dev mode" }, { status: 503 });
  }

  const outPath = path.join(os.tmpdir(), "rtsp_snapshot.jpg");
  const scriptPath = path.resolve(process.cwd(), "..", "tools", "snapshot.py");

  if (!fs.existsSync(scriptPath)) {
    return NextResponse.json({ error: "tools/snapshot.py not found" }, { status: 500 });
  }

  return new Promise<NextResponse>((resolve) => {
    execFile(
      "python",
      [scriptPath, "--out", outPath],
      { timeout: 15000 },
      (err) => {
        if (err) {
          resolve(NextResponse.json({ error: `Python error: ${err.message}` }, { status: 500 }));
          return;
        }
        if (!fs.existsSync(outPath)) {
          resolve(NextResponse.json({ error: "Snapshot file not created" }, { status: 500 }));
          return;
        }
        const buf = fs.readFileSync(outPath);
        resolve(
          new NextResponse(buf, {
            status: 200,
            headers: {
              "Content-Type": "image/jpeg",
              "Cache-Control": "no-store",
            },
          }),
        );
      },
    );
  });
}
