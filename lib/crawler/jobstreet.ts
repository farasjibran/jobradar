/**
 * Crawler JobStreet Indonesia (platform SEEK).
 *
 * Dua endpoint:
 *  1. Pencarian (JSON):
 *     https://id.jobstreet.com/api/jobsearch/v5/search
 *        ?siteKey=ID-Main&sourcesystem=houston&keywords=...&pageSize=..&page=..
 *     Mengembalikan JSON lengkap: judul, perusahaan, lokasi, GAJI (salaryLabel),
 *     workArrangements (Remote/Hybrid/On-site), workTypes, listingDate.
 *
 *  2. Detail (HTML server-rendered):
 *     https://id.jobstreet.com/id/job/<jobId>
 *     Berisi deskripsi lengkap di <div data-automation="jobAdDetails">.
 *
 * Kelebihan dibanding LinkedIn: gaji dan mode kerja sudah tersedia di hasil
 * pencarian, jadi skor Practical Fit jauh lebih akurat.
 *
 * CATATAN: scraping tetap melanggar ToS SEEK/JobStreet. Pakai jeda sopan.
 */

import { stripHtml } from "../text";
import type { RawJob } from "../types";
import { politeFetch, type RateLimiter } from "./http";

const BASE = "https://id.jobstreet.com";
const SEARCH = `${BASE}/api/jobsearch/v5/search`;
const DETAIL = (id: string) => `${BASE}/id/job/${id}`;

export interface JobStreetQuery {
  keywords: string;
  location: string;
  page?: number;
  pageSize?: number;
}

interface JobStreetLocation {
  label?: string;
}

interface JobStreetClassification {
  classification?: { description?: string };
  subclassification?: { description?: string };
}

interface JobStreetWorkArrangement {
  label?: { text?: string };
}

interface JobStreetSearchItem {
  id?: string | number;
  title?: string;
  companyName?: string;
  advertiser?: { description?: string };
  employer?: { name?: string };
  locations?: JobStreetLocation[];
  location?: string;
  salaryLabel?: string;
  workTypes?: string[];
  workArrangements?: { displayText?: string; data?: JobStreetWorkArrangement[] };
  listingDate?: string;
  listingDateDisplay?: string;
  teaser?: string;
  classifications?: JobStreetClassification[];
  isRemote?: boolean;
  jobLink?: string;
}

export interface JobStreetSearchResponse {
  data?: JobStreetSearchItem[];
  totalCount?: number;
}

export function mapSearchItem(item: JobStreetSearchItem): RawJob | null {
  const id = item.id != null ? String(item.id) : null;
  const title = (item.title ?? "").trim();
  if (!id || !title) return null;

  const location =
    item.locations?.map((l) => l.label).filter(Boolean).join(", ") ??
    item.location ??
    "";

  const arrangement =
    item.workArrangements?.displayText ??
    item.workArrangements?.data?.map((d) => d.label?.text).filter(Boolean).join(", ") ??
    "";

  const classification = (item.classifications ?? [])
    .map((c) => [c.classification?.description, c.subclassification?.description].filter(Boolean).join(" > "))
    .filter(Boolean)
    .join("; ");

  // Teaser + klasifikasi + workTypes dipakai sebagai deskripsi awal,
  // supaya filtering role/skill bisa jalan walau detail gagal diambil.
  const preamble = [
    item.teaser ?? "",
    classification ? `Klasifikasi: ${classification}` : "",
    item.workTypes?.length ? `Tipe kerja: ${item.workTypes.join(", ")}` : "",
    arrangement ? `Sistem kerja: ${arrangement}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    source: "jobstreet",
    externalId: id,
    url: item.jobLink ? new URL(item.jobLink, BASE).toString() : `${BASE}/id/job/${id}`,
    title,
    company: item.companyName ?? item.employer?.name ?? item.advertiser?.description ?? "",
    location,
    description: preamble,
    salaryText: item.salaryLabel ?? null,
    workMode: arrangement || (item.isRemote ? "Remote" : null),
    employmentType: item.workTypes?.join(", ") ?? null,
    postedAt: item.listingDate ?? item.listingDateDisplay ?? null,
    scrapedAt: new Date().toISOString(),
  };
}

/**
 * Ambil isi <div data-automation="jobAdDetails"> dengan menghitung
 * kedalaman tag div (regex tidak bisa menangani HTML bersarang).
 */
export function extractJobAdHtml(html: string): string | null {
  const marker = html.indexOf('data-automation="jobAdDetails"');
  if (marker < 0) return null;

  const open = html.lastIndexOf("<div", marker);
  if (open < 0) return null;

  let depth = 0;
  let i = open;
  const re = /<(\/?)div\b[^>]*>/gi;
  re.lastIndex = open;

  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[1] === "/") {
      depth--;
      if (depth === 0) {
        i = re.lastIndex;
        return html.slice(open, i);
      }
    } else {
      depth++;
    }
  }
  // Fallback: ambil potongan besar saja.
  return html.slice(open, open + 20_000);
}

export function parseDetailHtml(html: string): { description: string } {
  const ad = extractJobAdHtml(html);
  if (ad) {
    const text = stripHtml(ad);
    if (text.length > 50) return { description: text };
  }
  // Fallback: buang seluruh script/style lalu ambil teks.
  return { description: stripHtml(html).slice(0, 6000) };
}

export interface CrawlJobStreetOptions {
  limiter: RateLimiter;
  cacheDir: string;
  cacheTtlMs: number;
  timeoutMs: number;
  retries: number;
  fetchDetails: boolean;
  pageSize: number;
  maxPages: number;
  shouldFetchDetail?: (job: RawJob) => boolean;
  onProgress?: (msg: string) => void;
}

export async function crawlJobStreet(
  query: JobStreetQuery,
  opts: CrawlJobStreetOptions,
): Promise<RawJob[]> {
  const out: RawJob[] = [];
  const seen = new Set<string>();
  const pageSize = query.pageSize ?? opts.pageSize;

  for (let page = 1; page <= opts.maxPages; page++) {
    const params = new URLSearchParams({
      siteKey: "ID-Main",
      sourcesystem: "houston",
      keywords: query.keywords,
      pageSize: String(pageSize),
      page: String(page),
      locale: "id-ID",
    });
    if (query.location) params.set("where", query.location);
    const url = `${SEARCH}?${params.toString()}`;

    await opts.limiter.wait();
    let json: JobStreetSearchResponse;
    try {
      const res = await politeFetch(url, {
        headers: { accept: "application/json", referer: `${BASE}/` },
        timeoutMs: opts.timeoutMs,
        retries: opts.retries,
        cacheDir: opts.cacheDir,
        cacheTtlMs: opts.cacheTtlMs,
      });
      if (res.status !== 200) {
        opts.onProgress?.(`JobStreet: status ${res.status} untuk "${query.keywords}" — dilewati`);
        break;
      }
      json = JSON.parse(res.body) as JobStreetSearchResponse;
    } catch (e) {
      opts.onProgress?.(`JobStreet: gagal "${query.keywords}" — ${(e as Error).message}`);
      break;
    }

    const items = json.data ?? [];
    if (!items.length) break;

    for (const item of items) {
      const job = mapSearchItem(item);
      if (!job || seen.has(job.externalId)) continue;
      seen.add(job.externalId);

      const needDetail = opts.fetchDetails && (opts.shouldFetchDetail?.(job) ?? true);
      if (needDetail) {
        await opts.limiter.wait();
        try {
          const d = await politeFetch(DETAIL(job.externalId), {
            headers: { accept: "text/html" },
            timeoutMs: opts.timeoutMs,
            retries: opts.retries,
            cacheDir: opts.cacheDir,
            cacheTtlMs: opts.cacheTtlMs,
          });
          if (d.status === 200) {
            const parsed = parseDetailHtml(d.body);
            if (parsed.description.length > job.description.length) {
              job.description = parsed.description;
            }
            // Mode kerja kadang baru muncul di deskripsi.
            if (!job.workMode) {
              if (/\bhybrid|hibrida\b/i.test(job.description)) job.workMode = "Hybrid";
              else if (/\bremote|wfh|kerja dari rumah\b/i.test(job.description)) job.workMode = "Remote";
              else if (/\bon-?site|wfo|di kantor\b/i.test(job.description)) job.workMode = "On-site";
            }
          }
        } catch (e) {
          opts.onProgress?.(`  JobStreet detail ${job.externalId} gagal: ${(e as Error).message}`);
        }
      }

      out.push(job);
    }

    opts.onProgress?.(
      `JobStreet "${query.keywords}" @${query.location} hal.${page}: ${items.length} lowongan`,
    );
  }

  return out;
}

/** Ambil id dari URL JobStreet: /job/94616991 atau /id/job/94616991 */
export function jobIdFromUrl(url: string): string | null {
  return url.match(/\/job\/(\d+)/)?.[1] ?? null;
}
