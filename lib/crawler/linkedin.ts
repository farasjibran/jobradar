/**
 * Crawler LinkedIn (endpoint guest publik, tanpa login).
 *
 * Dua endpoint yang dipakai:
 *  1. Daftar lowongan:
 *     https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search
 *        ?keywords=...&location=...&start=<offset>
 *     Mengembalikan potongan HTML berisi kartu lowongan.
 *  2. Detail lowongan:
 *     https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/<jobId>
 *     Mengembalikan HTML dengan deskripsi lengkap.
 *
 * CATATAN PENTING
 * - Ini endpoint yang sama dipakai halaman publik LinkedIn, tapi scraping
 *   tetap melanggar ToS LinkedIn. Pakai dengan jeda sopan & volume wajar.
 * - LinkedIn tidak menampilkan gaji di endpoint guest. Jadi skor gaji untuk
 *   lowongan LinkedIn akan netral (0.5) kecuali gaji disebut di deskripsi.
 */

import { decodeEntities, stripHtml } from "../text";
import type { RawJob } from "../types";
import { buildCookieHeader, politeFetch, type RateLimiter } from "./http";

const BASE = "https://www.linkedin.com";
const SEARCH = `${BASE}/jobs-guest/jobs/api/seeMoreJobPostings/search`;
const DETAIL = (id: string) => `${BASE}/jobs-guest/jobs/api/jobPosting/${id}`;

export interface LinkedInQuery {
  keywords: string;
  location: string;
  start?: number;
}

interface SearchCard {
  jobId: string;
  url: string;
  title: string;
  company: string;
  location: string;
  postedAt: string | null;
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`${name}="([^"]*)"`, "i"));
  return m ? decodeEntities(m[1]) : null;
}

/** Parse HTML hasil endpoint pencarian menjadi daftar kartu lowongan. */
export function parseSearchHtml(html: string): SearchCard[] {
  const cards: SearchCard[] = [];
  // Setiap kartu dibungkus <li> ... </li>
  const items = html.split(/<li[\s>]/i).slice(1);

  for (const chunk of items) {
    const urnMatch = chunk.match(/data-entity-urn="urn:li:jobPosting:(\d+)"/);
    const jobId = urnMatch?.[1] ?? null;
    if (!jobId) continue;

    // URL: ambil dari <a ... href="...jobs/view/...">
    const linkMatch = chunk.match(/href="([^"]*\/jobs\/view\/[^"]+)"/i);
    let url = linkMatch ? decodeEntities(linkMatch[1]) : "";
    if (url.startsWith("/")) url = BASE + url;
    url = url.split("?")[0];
    if (!url) url = `${BASE}/jobs/view/${jobId}`;

    const titleMatch =
      chunk.match(/class="base-search-card__title"[^>]*>([\s\S]*?)<\/h3>/i) ??
      chunk.match(/<span class="sr-only">([\s\S]*?)<\/span>/i);
    const title = titleMatch ? stripHtml(titleMatch[1]).replace(/\s+/g, " ").trim() : "";
    if (!title) continue;

    const companyMatch =
      chunk.match(/class="hidden-nested-link"[^>]*>([\s\S]*?)<\/a>/i) ??
      chunk.match(/class="base-search-card__subtitle"[^>]*>([\s\S]*?)<\/h4>/i);
    const company = companyMatch
      ? stripHtml(companyMatch[1]).replace(/\s+/g, " ").trim()
      : "";

    const locMatch = chunk.match(/class="job-search-card__location"[^>]*>([\s\S]*?)<\/span>/i);
    const location = locMatch ? stripHtml(locMatch[1]).replace(/\s+/g, " ").trim() : "";

    const dateMatch = chunk.match(/class="job-search-card__listdate[^"]*"[^>]*datetime="([^"]+)"/i)
      ?? chunk.match(/datetime="([\d-]+)"/i);
    const postedAt = dateMatch?.[1] ?? null;

    cards.push({ jobId, url, title, company, location, postedAt });
  }
  return cards;
}

/** Parse halaman detail: deskripsi, tipe kerja, dan gaji (kalau ada). */
export function parseDetailHtml(html: string): {
  description: string;
  employmentType: string | null;
  salaryText: string | null;
  workMode: string | null;
} {
  const descMatch = html.match(
    /class="[^"]*show-more-less-html__markup[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
  );
  const description = descMatch ? stripHtml(descMatch[1]) : stripHtml(html).slice(0, 4000);

  const critMatch = html.match(
    /class="[^"]*description__job-criteria-list[^"]*"[^>]*>([\s\S]*?)<\/ul>/i,
  );
  const critText = critMatch ? stripHtml(critMatch[1]) : "";

  const employmentType =
    critText.match(/Employment type\s*([^\n]+)/i)?.[1]?.trim() ?? null;
  const seniority = critText.match(/Seniority level\s*([^\n]+)/i)?.[1]?.trim() ?? null;

  // Gaji kadang muncul sebagai kriteria.
  const salaryText =
    critText.match(/(?:Salary|Compensation|Gaji)\s*([^\n]+)/i)?.[1]?.trim() ?? null;

  const modeSource = `${critText} ${description.slice(0, 1500)}`;
  let workMode: string | null = null;
  if (/\bhybrid|hibrida\b/i.test(modeSource)) workMode = "Hybrid";
  else if (/\bremote|wfh|work from home|kerja dari rumah\b/i.test(modeSource)) workMode = "Remote";
  else if (/\bon-?site|wfo|work from office\b/i.test(modeSource)) workMode = "On-site";

  return {
    description,
    employmentType: employmentType ?? seniority,
    salaryText,
    workMode,
  };
}

export interface CrawlLinkedInOptions {
  limiter: RateLimiter;
  cacheDir: string;
  cacheTtlMs: number;
  timeoutMs: number;
  retries: number;
  cookie?: string;
  fetchDetails: boolean;
  pageSize: number;
  maxPages: number;
  /** Dikembalikan true kalau lowongan ini tidak perlu detail (menghemat request). */
  shouldFetchDetail?: (job: RawJob) => boolean;
  onProgress?: (msg: string) => void;
}

export async function crawlLinkedIn(
  query: LinkedInQuery,
  opts: CrawlLinkedInOptions,
): Promise<RawJob[]> {
  const out: RawJob[] = [];
  const seen = new Set<string>();
  const cookieHeader = buildCookieHeader(opts.cookie);

  for (let page = 0; page < opts.maxPages; page++) {
    const start = page * opts.pageSize;
    const url =
      `${SEARCH}?keywords=${encodeURIComponent(query.keywords)}` +
      `&location=${encodeURIComponent(query.location)}&start=${start}`;

    await opts.limiter.wait();
    let html: string;
    try {
      const res = await politeFetch(url, {
        headers: cookieHeader,
        timeoutMs: opts.timeoutMs,
        retries: opts.retries,
        cacheDir: opts.cacheDir,
        cacheTtlMs: opts.cacheTtlMs,
      });
      if (res.status !== 200) {
        opts.onProgress?.(`LinkedIn: status ${res.status} untuk "${query.keywords}" — dilewati`);
        break;
      }
      html = res.body;
    } catch (e) {
      opts.onProgress?.(`LinkedIn: gagal "${query.keywords}" — ${(e as Error).message}`);
      break;
    }

    const cards = parseSearchHtml(html);
    if (!cards.length) break;

    for (const card of cards) {
      if (seen.has(card.jobId)) continue;
      seen.add(card.jobId);

      const job: RawJob = {
        source: "linkedin",
        externalId: card.jobId,
        url: card.url,
        title: card.title,
        company: card.company,
        location: card.location,
        description: "",
        salaryText: null,
        workMode: null,
        employmentType: null,
        postedAt: card.postedAt,
        scrapedAt: new Date().toISOString(),
      };

      const needDetail = opts.fetchDetails && (opts.shouldFetchDetail?.(job) ?? true);
      if (needDetail) {
        await opts.limiter.wait();
        try {
          const d = await politeFetch(DETAIL(card.jobId), {
            headers: { ...cookieHeader, referer: card.url },
            timeoutMs: opts.timeoutMs,
            retries: opts.retries,
            cacheDir: opts.cacheDir,
            cacheTtlMs: opts.cacheTtlMs,
          });
          if (d.status === 200) {
            const parsed = parseDetailHtml(d.body);
            job.description = parsed.description;
            job.employmentType = parsed.employmentType ?? job.employmentType;
            job.salaryText = parsed.salaryText;
            job.workMode = parsed.workMode;
          }
        } catch (e) {
          opts.onProgress?.(`  LinkedIn detail ${card.jobId} gagal: ${(e as Error).message}`);
        }
      }

      // Kalau detail gagal diambil, tetap masukkan dengan judul saja —
      // skor skill akan netral, tapi tidak hilang dari daftar.
      out.push(job);
    }

    opts.onProgress?.(
      `LinkedIn "${query.keywords}" @${query.location} hal.${page + 1}: ${cards.length} lowongan`,
    );
  }

  return out;
}

/** Ambil id dari URL LinkedIn. */
export function jobIdFromUrl(url: string): string | null {
  return url.match(/-(\d{6,})(?:\?|$)/)?.[1] ?? url.match(/jobPosting\/(\d+)/)?.[1] ?? null;
}
