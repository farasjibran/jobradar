import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** True kalau ada run crawl yang belum selesai DAN prosesnya masih hidup. */
async function isCrawlRunning(): Promise<boolean> {
  const { getDb } = await import("@/lib/db");
  const db = getDb();
  const row = db
    .prepare(
      "SELECT id, started_at FROM crawl_runs WHERE finished_at IS NULL ORDER BY id DESC LIMIT 1",
    )
    .get() as { id: number; started_at: string } | undefined;
  if (!row) return false;

  const age = Date.now() - Date.parse(row.started_at);
  if (age >= 30 * 60_000) {
    // Basi — tutup paksa.
    db.prepare("UPDATE crawl_runs SET finished_at = datetime('now') WHERE id = ?").run(row.id);
    return false;
  }

  // Row "belum selesai" bisa stale (proses mati sebelum menulis finish).
  // Verifikasi ada proses crawl.ts yang benar-benar hidup.
  try {
    const { execSync } = await import("node:child_process");
    const out = execSync('pgrep -f "scripts/crawl.ts" || true', { encoding: "utf8" }).trim();
    if (out) return true;
    db.prepare("UPDATE crawl_runs SET finished_at = datetime('now') WHERE id = ?").run(row.id);
    return false;
  } catch {
    return false;
  }
}

/** Status crawl terakhir. */
export async function GET() {
  try {
    const { getLastRun, listRuns } = await import("@/lib/db");
    return NextResponse.json({
      running: await isCrawlRunning(),
      lastRun: getLastRun(),
      runs: listRuns(10),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Gagal membaca status" },
      { status: 500 },
    );
  }
}

/**
 * Jalankan crawl.
 *
 * Body JSON (opsional):
 *   { "source": "jobstreet" | "linkedin", "limit": 2, "noCache": true, "dryRun": true }
 *
 * Peringatan: crawl penuh bisa memakan waktu beberapa menit karena jeda
 * sopan 2.5-6 detik per request. Untuk penggunaan rutin, lebih baik pakai
 * cron lewat `bun run crawl`.
 */
export async function POST(request: Request) {
  let body: {
    source?: string;
    limit?: number;
    noCache?: boolean;
    dryRun?: boolean;
  } = {};
  try {
    body = await request.json();
  } catch {
    // Body kosong itu boleh.
  }

  try {
    if (await isCrawlRunning()) {
      return NextResponse.json(
        { ok: false, error: "Crawl lain masih berjalan. Tunggu selesai." },
        { status: 409 },
      );
    }

    // Jalankan crawl sebagai proses terpisah yang lepas (detached) supaya
    // tetap jalan walau tab/browser di-refresh atau koneksi client putus.
    const { spawn } = await import("node:child_process");
    const { openSync, mkdirSync } = await import("node:fs");
    mkdirSync("data", { recursive: true });
    const logFd = openSync("data/crawl.log", "a");

    const args = ["run", "scripts/crawl.ts"];
    if (body.dryRun) args.push("--dry-run");
    if (body.noCache) args.push("--no-cache");
    if (typeof body.limit === "number") args.push("--limit", String(body.limit));
    if (body.source) args.push("--source", body.source);

    const child = spawn("bun", args, {
      cwd: process.cwd(),
      env: process.env,
      detached: true,
      stdio: ["ignore", logFd, logFd],
    });
    child.unref();

    return NextResponse.json({ ok: true, started: true, pid: child.pid });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Crawl gagal" },
      { status: 500 },
    );
  }
}
