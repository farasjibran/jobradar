#!/usr/bin/env bun
/**
 * CLI crawler.
 *
 *   bun run crawl                 # crawl penuh, simpan ke database
 *   bun run crawl --dry-run       # tidak menulis DB, hanya lihat hasil
 *   bun run crawl --limit 2       # batasi 2 query (uji cepat)
 *   bun run crawl --source jobstreet
 *   bun run crawl --no-cache      # paksa ambil ulang (abaikan cache 12 jam)
 *
 * Untuk cron harian:
 *   0 7 * * * cd /Users/mac/jobradar && bun run crawl >> data/crawl.log 2>&1
 */

import { loadProfile } from "../lib/profile";
import { runCrawl } from "../lib/crawler";
import { closeDb } from "../lib/db";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const next = process.argv[i + 1];
  return next && !next.startsWith("--") ? next : "";
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const dryRun = flag("dry-run");
  const noCache = flag("no-cache");
  const limitRaw = arg("limit");
  const limitQueries = limitRaw ? Number(limitRaw) : undefined;
  const sourceArg = arg("source");
  const sources = sourceArg ? sourceArg.split(",").map((s) => s.trim()) : undefined;

  const profile = await loadProfile(true);

  console.log("=".repeat(64));
  console.log(" JobRadar — crawl lowongan");
  console.log("=".repeat(64));
  console.log(` Kandidat   : ${profile.candidate.name}`);
  console.log(` Pengalaman : ${profile.candidate.years_experience} tahun (${profile.candidate.current_level})`);
  console.log(` Ambang     : ${profile.scoring.threshold}/100`);
  console.log(` Sumber     : ${(sources ?? profile.crawl.sources).join(", ")}`);
  console.log(` Query      : ${limitQueries ?? profile.crawl.queries.length}`);
  console.log(` Mode       : ${dryRun ? "DRY RUN (tidak menulis DB)" : "SIMPAN KE DATABASE"}`);
  console.log(` Jeda       : ${profile.crawl.delay_ms.min}-${profile.crawl.delay_ms.max} ms per request`);
  console.log("=".repeat(64));
  console.log();

  const summary = await runCrawl(profile, {
    dryRun,
    noCache,
    limitQueries,
    sources,
    onProgress: (m) => console.log(m),
  });

  console.log();
  console.log("=".repeat(64));
  console.log(" HASIL");
  console.log("=".repeat(64));
  console.log(` Durasi          : ${(summary.durationMs / 1000).toFixed(1)}s`);
  console.log(` Lowongan unik   : ${summary.fetched}`);
  console.log(` Per sumber      : ${JSON.stringify(summary.bySource)}`);
  console.log(` Lolos filter    : ${summary.passed}`);
  console.log(` Tidak lolos     : ${summary.rejected}`);
  if (!summary.dryRun) {
    console.log(` Baru di DB      : ${summary.inserted}`);
    console.log(` Diperbarui     : ${summary.updated}`);
  }
  if (summary.errors.length) {
    console.log(`\n Error (${summary.errors.length}):`);
    for (const e of summary.errors.slice(0, 10)) console.log(`   - ${e}`);
  }

  if (summary.topJobs.length) {
    console.log();
    console.log(" TOP 10 LOWONGAN");
    console.log("-".repeat(64));
    for (const s of summary.topJobs) {
      console.log(
        ` ${String(s.total).padStart(5)}  ${s.job.title.slice(0, 46).padEnd(46)}`,
      );
      console.log(
        `        ${s.job.company.slice(0, 34).padEnd(34)} ${s.job.location.slice(0, 26)}`,
      );
      console.log(
        `        skills ${s.components[0].score} | sen ${s.components[1].score} | dom ${s.components[2].score} | prac ${s.components[3].score}`,
      );
      console.log(`        ${s.job.url.slice(0, 78)}`);
      console.log();
    }
  }

  console.log("=".repeat(64));
  if (!summary.dryRun) {
    console.log(" Jalankan `bun run dev` lalu buka http://localhost:3000");
    console.log("=".repeat(64));
  }
}

main()
  .catch((e) => {
    console.error("\nGAGAL:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => {
    closeDb();
  });
