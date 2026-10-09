/**
 * Orkestrasi crawling: jalankan semua query dari profile.yaml ke semua
 * sumber, normalisasi, filter role, nilai, lalu simpan.
 *
 * Dipakai oleh dua entry point:
 *  - scripts/crawl.ts  (CLI, untuk cron)
 *  - app/api/crawl/route.ts (tombol di UI)
 */

import { join } from "node:path";
import {
  finishCrawlRun,
  startCrawlRun,
  upsertScoredJobs,
} from "../db";
import { matchRole, scoreJob } from "../scoring";
import type { CandidateProfile, RawJob, ScoredJob } from "../types";
import { RateLimiter } from "./http";
import { crawlJobStreet } from "./jobstreet";
import { crawlLinkedIn } from "./linkedin";

export interface CrawlSummary {
  runId: number;
  fetched: number;
  inserted: number;
  updated: number;
  passed: number;
  rejected: number;
  bySource: Record<string, number>;
  topJobs: ScoredJob[];
  errors: string[];
  durationMs: number;
  dryRun: boolean;
}

export interface CrawlOptions {
  /** Hanya ambil, jangan tulis ke database. */
  dryRun?: boolean;
  /** Batasi jumlah query (untuk uji cepat). */
  limitQueries?: number;
  /** Timpa sumber dari profile.yaml. */
  sources?: string[];
  /** Paksa refresh (abaikan cache). */
  noCache?: boolean;
  onProgress?: (msg: string) => void;
}

/** Jalan-jalan kecil supaya tidak mengirim burst ke host yang sama. */
function dedupeJobs(jobs: RawJob[]): RawJob[] {
  const seen = new Map<string, RawJob>();
  for (const j of jobs) {
    const key = `${j.source}:${j.externalId}`;
    const prev = seen.get(key);
    // Simpan versi dengan deskripsi paling lengkap.
    if (!prev || j.description.length > prev.description.length) {
      seen.set(key, prev ? { ...j, salaryText: j.salaryText ?? prev.salaryText } : j);
    }
  }
  return [...seen.values()];
}

export async function runCrawl(
  profile: CandidateProfile,
  opts: CrawlOptions = {},
): Promise<CrawlSummary> {
  const startedMs = Date.now();
  const log = opts.onProgress ?? (() => {});
  const cfg = profile.crawl;
  const sources = opts.sources ?? cfg.sources;

  const queries = cfg.queries.slice(0, opts.limitQueries ?? cfg.queries.length);
  const limiter = new RateLimiter(cfg.delay_ms.min, cfg.delay_ms.max);
  const cacheDir = join(process.cwd(), "data", "cache");
  const cacheTtlMs = opts.noCache ? 0 : cfg.cache_ttl_hours * 3600_000;

  const runId = opts.dryRun ? -1 : startCrawlRun(sources, queries.length);
  const errors: string[] = [];
  const bySource: Record<string, number> = {};
  const raw: RawJob[] = [];

  // ---- Gate awal: buang lowongan yang judulnya jelas di luar role ----
  // Ini menghemat banyak request detail.
  const shouldFetchDetail = (job: RawJob): boolean => {
    if (!cfg.require_role_match) return true;
    return matchRole(job.title, profile).family !== null;
  };

  let fetched = 0;

  for (const q of queries) {
    if (fetched >= cfg.max_jobs_per_run) {
      log(`Batas ${cfg.max_jobs_per_run} lowongan tercapai — berhenti mengambil.`);
      break;
    }

    for (const source of sources) {
      try {
        if (source === "linkedin") {
          const jobs = await crawlLinkedIn(
            { keywords: q.keywords, location: q.location },
            {
              limiter,
              cacheDir,
              cacheTtlMs,
              timeoutMs: cfg.request_timeout_ms,
              retries: cfg.max_retries,
              cookie: process.env.LINKEDIN_COOKIE,
              fetchDetails: cfg.fetch_details,
              pageSize: cfg.page_size,
              maxPages: cfg.max_pages,
              shouldFetchDetail,
              onProgress: log,
            },
          );
          raw.push(...jobs);
          bySource.linkedin = (bySource.linkedin ?? 0) + jobs.length;
          fetched += jobs.length;
        } else if (source === "jobstreet") {
          const jobs = await crawlJobStreet(
            { keywords: q.keywords, location: q.location },
            {
              limiter,
              cacheDir,
              cacheTtlMs,
              timeoutMs: cfg.request_timeout_ms,
              retries: cfg.max_retries,
              fetchDetails: cfg.fetch_details,
              pageSize: cfg.page_size,
              maxPages: cfg.max_pages,
              shouldFetchDetail,
              onProgress: log,
            },
          );
          raw.push(...jobs);
          bySource.jobstreet = (bySource.jobstreet ?? 0) + jobs.length;
          fetched += jobs.length;
        }
      } catch (e) {
        const msg = `${source} / "${q.keywords}" @${q.location}: ${(e as Error).message}`;
        errors.push(msg);
        log(`  ERROR ${msg}`);
      }
    }
  }

  const unique = dedupeJobs(raw);
  log(`\nTotal unik: ${unique.length} lowongan dari ${raw.length} hasil mentah.`);

  // ---- Batasi 30 hari ke belakang dari hari ini ----
  const cutoffMs = Date.now() - 30 * 86_400_000;
  const recent = unique.filter((j) => {
    if (!j.postedAt) return true; // tanpa tanggal: tetap simpan
    const t = Date.parse(j.postedAt);
    return Number.isNaN(t) || t >= cutoffMs;
  });
  log(
    `Disaring ke 30 hari terakhir: ${recent.length} tersisa (${unique.length - recent.length} dibuang karena terlalu lama).`,
  );

  // ---- Nilai semua lowongan ----
  const scored: ScoredJob[] = [];
  let rejectedByRole = 0;
  for (const job of recent) {
    if (cfg.require_role_match && !matchRole(job.title, profile).family) {
      rejectedByRole++;
      continue;
    }
    scored.push(scoreJob(job, profile));
  }
  log(
    `Dibuang karena judul di luar role: ${rejectedByRole}. Dinilai: ${scored.length}.`,
  );

  const passedJobs = scored.filter((s) => s.passed);
  passedJobs.sort((a, b) => b.total - a.total);

  log(
    `Lolos ambang ${profile.scoring.threshold}: ${passedJobs.length} dari ${scored.length}.`,
  );

  let inserted = 0;
  let updated = 0;
  if (!opts.dryRun && scored.length) {
    const res = upsertScoredJobs(scored);
    inserted = res.inserted;
    updated = res.updated;
    log(`Database: ${inserted} baru, ${updated} diperbarui.`);
  }

  const durationMs = Date.now() - startedMs;
  if (!opts.dryRun && runId > 0) {
    finishCrawlRun(runId, {
      fetched: recent.length,
      newJobs: inserted,
      updatedJobs: updated,
      passedJobs: passedJobs.length,
      rejected: scored.length - passedJobs.length,
      errors,
      startedAtMs: startedMs,
    });
  }

  return {
    runId,
    fetched: recent.length,
    inserted,
    updated,
    passed: passedJobs.length,
    rejected: scored.length - passedJobs.length,
    bySource,
    topJobs: passedJobs.slice(0, 10),
    errors,
    durationMs,
    dryRun: !!opts.dryRun,
  };
}

export { dedupeJobs };
