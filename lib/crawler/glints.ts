/**
 * Crawler Glints (glints.com/id/en).
 *
 * Glints memblokir klien HTTP biasa (403 + captcha). Pengambilan dilakukan
 * lewat helper Python `glints_fetch.py` yang memakai cloudscraper.
 * Keputusan pemakaian ini diambil pemilik project; jeda sopan tetap dijaga.
 *
 *  - search: keyword + lokasi -> __NEXT_DATA__.initialJobs.jobsInPage
 *  - detail: deskripsi lengkap per job -> __NEXT_DATA__.initialData.data
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { RawJob } from "../types";
import type { RateLimiter } from "./http";

const execFileAsync = promisify(execFile);
const HELPER = fileURLToPath(new URL("./glints_fetch.py", import.meta.url));
// Python dari venv project (berisi cloudscraper). Bisa di-override env.
const PYTHON = process.env.GLINTS_PYTHON ?? path.join(process.cwd(), ".venv-glints", "bin", "python");
const BASE = "https://glints.com/id/en/opportunities/jobs";

export interface GlintsQuery {
  keywords: string;
  location: string;
}

/** Bentuk satu job di jobsInPage (hanya field yang dipakai). */
export interface GlintsSearchItem {
  id: string;
  title?: string;
  status?: string;
  createdAt?: string;
  type?: string;
  workArrangementOption?: string;
  company?: { name?: string; brandName?: string | null };
  city?: { name?: string } | null;
  citySubDivision?: { name?: string } | null;
  salaries?: { salaryMode?: string; minAmount?: number; maxAmount?: number; CurrencyCode?: string }[];
  shouldShowSalary?: boolean;
}

const WORK_MODE: Record<string, string> = {
  ONSITE: "On-site",
  HYBRID: "Hybrid",
  REMOTE: "Remote",
};

const EMP_TYPE: Record<string, string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  CONTRACT: "Contract",
  INTERNSHIP: "Internship",
  PROJECT_BASED: "Project-based",
};

function formatSalary(item: GlintsSearchItem): string | null {
  if (!item.shouldShowSalary) return null;
  const s = item.salaries?.[0];
  if (!s?.minAmount) return null;
  const fmt = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;
  const range =
    s.maxAmount && s.maxAmount !== s.minAmount
      ? `${fmt(s.minAmount)} - ${fmt(s.maxAmount)}`
      : fmt(s.minAmount);
  return `${range} / ${(s.salaryMode ?? "MONTH").toLowerCase()}`;
}

/** Ubah satu item search Glints menjadi RawJob (deskripsi diisi terpisah). */
export function mapSearchItem(item: GlintsSearchItem): RawJob | null {
  const title = (item.title ?? "").trim();
  if (!item.id || !title) return null;
  const location = [item.citySubDivision?.name, item.city?.name].filter(Boolean).join(", ");
  return {
    source: "glints",
    externalId: item.id,
    url: `${BASE}/${item.id}`,
    title,
    company: item.company?.brandName || item.company?.name || "",
    location,
    description: "",
    salaryText: formatSalary(item),
    workMode: item.workArrangementOption ? (WORK_MODE[item.workArrangementOption] ?? null) : null,
    employmentType: item.type ? (EMP_TYPE[item.type] ?? item.type) : null,
    postedAt: item.createdAt ?? null,
    scrapedAt: new Date().toISOString(),
  };
}

async function runPython(args: string[], stdin?: string): Promise<string> {
  const child = execFileAsync(PYTHON, [HELPER, ...args], {
    maxBuffer: 64 * 1024 * 1024,
    timeout: 5 * 60_000,
  });
  if (stdin !== undefined) child.child.stdin?.end(stdin);
  const { stdout } = await child;
  return stdout;
}

export interface CrawlGlintsOptions {
  limiter: RateLimiter;
  delayMin: number;
  delayMax: number;
  fetchDetails: boolean;
  shouldFetchDetail?: (job: RawJob) => boolean;
  onProgress?: (msg: string) => void;
}

/** Ambil satu query (keyword + lokasi) dari Glints, lalu detail untuk yang lolos gate. */
export async function crawlGlints(query: GlintsQuery, opts: CrawlGlintsOptions): Promise<RawJob[]> {
  await opts.limiter.wait();
  let items: GlintsSearchItem[];
  try {
    const stdout = await runPython(["search", query.keywords, query.location]);
    items = JSON.parse(stdout) as GlintsSearchItem[];
  } catch (e) {
    opts.onProgress?.(`Glints: gagal "${query.keywords}" — ${(e as Error).message}`);
    return [];
  }

  const out: RawJob[] = [];
  for (const item of items) {
    const job = mapSearchItem(item);
    if (job) out.push(job);
  }

  const need = out.filter(
    (j) => opts.fetchDetails && (opts.shouldFetchDetail?.(j) ?? true),
  );
  if (need.length) {
    // Jeda antar detail dijalankan di helper Python (satu proses, satu sesi).
    try {
      const stdout = await runPython(
        ["detail", String(opts.delayMin), String(opts.delayMax)],
        JSON.stringify(need.map((j) => j.externalId)),
      );
      const details = JSON.parse(stdout) as Record<string, { description: string }>;
      for (const job of need) {
        const d = details[job.externalId];
        if (!d) continue;
        job.description = d.description;
      }
    } catch (e) {
      opts.onProgress?.(`  Glints detail gagal: ${(e as Error).message}`);
    }
  }

  opts.onProgress?.(`Glints "${query.keywords}" @${query.location}: ${out.length} lowongan`);
  return out;
}
