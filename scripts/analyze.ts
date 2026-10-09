#!/usr/bin/env bun
/**
 * Analisis kalibrasi: jalankan crawl (pakai cache, jadi cepat) lalu
 * tampilkan distribusi skor dan alasan penolakan.
 *
 *   bun run scripts/analyze.ts --limit 1
 */

import { loadProfile } from "../lib/profile";
import { runCrawl } from "../lib/crawler";
import { matchRole, scoreJob } from "../lib/scoring";
import { RateLimiter } from "../lib/crawler/http";
import { crawlJobStreet } from "../lib/crawler/jobstreet";
import { join } from "node:path";
import { closeDb } from "../lib/db";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : (process.argv[i + 1] ?? "");
}

const profile = await loadProfile(true);
const limit = Number(arg("limit") ?? 1);

const limiter = new RateLimiter(200, 400); // cache -> tidak perlu jeda besar
const jobs = [];
for (const q of profile.crawl.queries.slice(0, limit)) {
  const res = await crawlJobStreet(
    { keywords: q.keywords, location: q.location },
    {
      limiter,
      cacheDir: join(process.cwd(), "data", "cache"),
      cacheTtlMs: 12 * 3600_000,
      timeoutMs: 20_000,
      retries: 2,
      fetchDetails: true,
      pageSize: profile.crawl.page_size,
      maxPages: profile.crawl.max_pages,
      shouldFetchDetail: (j) => matchRole(j.title, profile).family !== null,
      onProgress: () => {},
    },
  );
  jobs.push(...res);
}

const unique = new Map<string, (typeof jobs)[number]>();
for (const j of jobs) {
  const prev = unique.get(j.externalId);
  if (!prev || j.description.length > prev.description.length) unique.set(j.externalId, j);
}

const scored = [...unique.values()]
  .filter((j) => matchRole(j.title, profile).family !== null)
  .map((j) => scoreJob(j, profile))
  .sort((a, b) => b.total - a.total);

const n = scored.length;
const avg = (f: (s: (typeof scored)[number]) => number) =>
  (scored.reduce((s, j) => s + f(j), 0) / n).toFixed(1);

console.log(`\nDianalisis: ${n} lowongan (role cocok)\n`);
console.log("Rata-rata per komponen:");
console.log(`  Skills    ${avg((s) => s.components[0].score)} / 40`);
console.log(`  Seniority ${avg((s) => s.components[1].score)} / 25`);
console.log(`  Domain    ${avg((s) => s.components[2].score)} / 20`);
console.log(`  Practical ${avg((s) => s.components[3].score)} / 15`);
console.log(`  TOTAL     ${avg((s) => s.total)} / 100`);

console.log("\nDistribusi skor:");
const buckets = [
  [90, 101],
  [80, 90],
  [70, 80],
  [60, 70],
  [50, 60],
  [0, 50],
];
for (const [lo, hi] of buckets) {
  const c = scored.filter((s) => s.total >= lo && s.total < hi).length;
  const bar = "#".repeat(Math.round((c / n) * 40));
  console.log(`  ${String(lo).padStart(3)}-${hi - 1 < 100 ? hi - 1 : 100}  ${String(c).padStart(3)} ${bar}`);
}

console.log("\nSebaran per level senioritas (penyebab utama gagal):");
const byLevel = new Map<string, { count: number; avgSen: number }>();
for (const s of scored) {
  const lvl = String(s.components[1].detail.detected_level ?? "unknown");
  const e = byLevel.get(lvl) ?? { count: 0, avgSen: 0 };
  e.count++;
  e.avgSen += s.components[1].score;
  byLevel.set(lvl, e);
}
for (const [lvl, e] of [...byLevel.entries()].sort((a, b) => b[1].count - a[1].count)) {
  console.log(`  ${lvl.padEnd(10)} ${String(e.count).padStart(3)} lowongan, rata-rata seniority ${(e.avgSen / e.count).toFixed(1)}/25`);
}

console.log("\nSebaran skor gaji (praktis):");
const noSalary = scored.filter((s) => s.components[3].detail.salary_min === null).length;
console.log(`  ${noSalary} dari ${n} lowongan TIDAK mencantumkan gaji (skor gaji netral 0.5)`);

console.log("\nSebaran domain terdeteksi:");
const byDom = new Map<string, number>();
for (const s of scored) {
  const d = (s.components[2].detail.detected as string[])?.[0] ?? "(tidak terdeteksi)";
  byDom.set(d, (byDom.get(d) ?? 0) + 1);
}
for (const [d, c] of [...byDom.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
  console.log(`  ${d.padEnd(22)} ${c}`);
}

console.log("\nTop 8 dengan rincian:");
for (const s of scored.slice(0, 8)) {
  console.log(
    `\n  ${s.total}  ${s.job.title.slice(0, 55)}\n      ${s.job.company.slice(0, 40)} | ${s.job.location.slice(0, 30)}`,
  );
  console.log(
    `      skills ${s.components[0].score} | sen ${s.components[1].score} | dom ${s.components[2].score} | prac ${s.components[3].score}`,
  );
  console.log(`      level=${s.components[1].detail.detected_level} gaji=${s.job.salaryText ?? "-"}`);
}

closeDb();
