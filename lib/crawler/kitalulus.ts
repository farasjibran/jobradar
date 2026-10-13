/**
 * Crawler KitaLulus (kitalulus.com).
 *
 * Tidak ada pencarian keyword yang berfungsi (?q= diabaikan) dan ?page=
 * tidak mengubah hasil. Jadi crawler memindai halaman lokasi (Jabodetabek)
 * yang berisi ~31 lowongan terbaru per halaman, lalu memfilter judul lewat
 * matchRole di crawler index.
 *
 *  1. Listing (SSR HTML): https://www.kitalulus.com/lowongan/in-<kota>
 *     Kartu lowongan: <a href="/lowongan/detail/<slug>"> dengan <h3 title="...">.
 *  2. Detail (SSR HTML): https://www.kitalulus.com/lowongan/detail/<slug>
 *     Berisi <script type="application/ld+json"> bertipe JobPosting:
 *     datePosted, validThrough, baseSalary, jobLocation, description.
 */

import { decodeEntities, stripHtml } from "../text";
import type { RawJob } from "../types";
import { politeFetch, type RateLimiter } from "./http";

const BASE = "https://www.kitalulus.com";

/** Halaman lokasi yang dipindai. Diambil sebagai kumpulan, bukan per query. */
export const KITALULUS_LOCATIONS = [
  "in-jakarta-selatan",
  "in-jakarta-pusat",
  "in-jakarta-barat",
  "in-jakarta-timur",
  "in-jakarta-utara",
  "in-kota-depok",
  "in-kota-bogor",
  "in-kota-tangerang-selatan",
  "in-kota-tangerang",
  "in-kota-bekasi",
];

export interface KitaLulusCard {
  slug: string;
  title: string;
}

/** Parse halaman listing menjadi kartu (slug + judul), tanpa duplikat. */
export function parseListingHtml(html: string): KitaLulusCard[] {
  const cards: KitaLulusCard[] = [];
  const seen = new Set<string>();
  const re = /href="\/lowongan\/detail\/([^"?#]+)"[\s\S]*?<h3[^>]*\btitle="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const slug = m[1];
    if (seen.has(slug)) continue;
    seen.add(slug);
    cards.push({ slug, title: decodeEntities(m[2]).replace(/\s+/g, " ").trim() });
  }
  return cards;
}

interface JsonLdPosting {
  title?: string;
  description?: string;
  datePosted?: string;
  validThrough?: string;
  employmentType?: string;
  hiringOrganization?: { name?: string };
  jobLocation?: { address?: { addressLocality?: string; addressRegion?: string } };
  baseSalary?: {
    value?: { minValue?: number; maxValue?: number; unitText?: string };
  };
}

export interface KitaLulusDetail {
  description: string;
  company: string;
  location: string;
  salaryText: string | null;
  employmentType: string | null;
  postedAt: string | null;
  workMode: string | null;
}

function formatIdr(n: number): string {
  return `Rp ${n.toLocaleString("id-ID")}`;
}

/** Ambil data JobPosting dari JSON-LD halaman detail. */
export function parseDetailHtml(html: string): KitaLulusDetail | null {
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let data: JsonLdPosting;
    try {
      data = JSON.parse(m[1]) as JsonLdPosting;
    } catch {
      continue;
    }
    if ((data as unknown as { "@type"?: string })["@type"] !== "JobPosting") continue;

    const description = stripHtml(data.description ?? "");
    const addr = data.jobLocation?.address;
    const location = [addr?.addressLocality, addr?.addressRegion].filter(Boolean).join(", ");

    const sal = data.baseSalary?.value;
    let salaryText: string | null = null;
    if (sal?.minValue) {
      const range =
        sal.maxValue && sal.maxValue !== sal.minValue
          ? `${formatIdr(sal.minValue)} - ${formatIdr(sal.maxValue)}`
          : formatIdr(sal.minValue);
      salaryText = `${range} / ${(sal.unitText ?? "MONTH").toLowerCase()}`;
    }

    let workMode: string | null = null;
    if (/\bhybrid|hibrida\b/i.test(description)) workMode = "Hybrid";
    else if (/\bremote|wfh|kerja dari rumah\b/i.test(description)) workMode = "Remote";
    else if (/\bon-?site|wfo|di kantor\b/i.test(description)) workMode = "On-site";

    return {
      description,
      company: data.hiringOrganization?.name ?? "",
      location,
      salaryText,
      employmentType: data.employmentType ?? null,
      postedAt: data.datePosted ?? null,
      workMode,
    };
  }
  return null;
}

export interface CrawlKitaLulusOptions {
  limiter: RateLimiter;
  cacheDir: string;
  cacheTtlMs: number;
  timeoutMs: number;
  retries: number;
  fetchDetails: boolean;
  shouldFetchDetail?: (job: RawJob) => boolean;
  onProgress?: (msg: string) => void;
}

/** Pindai semua halaman lokasi sekali jalan. Tidak bergantung pada query. */
export async function crawlKitaLulus(opts: CrawlKitaLulusOptions): Promise<RawJob[]> {
  const out: RawJob[] = [];
  const seen = new Set<string>();

  for (const loc of KITALULUS_LOCATIONS) {
    await opts.limiter.wait();
    let html: string;
    try {
      const res = await politeFetch(`${BASE}/lowongan/${loc}`, {
        headers: { accept: "text/html" },
        timeoutMs: opts.timeoutMs,
        retries: opts.retries,
        cacheDir: opts.cacheDir,
        cacheTtlMs: opts.cacheTtlMs,
      });
      if (res.status !== 200) {
        opts.onProgress?.(`KitaLulus: status ${res.status} untuk ${loc} — dilewati`);
        continue;
      }
      html = res.body;
    } catch (e) {
      opts.onProgress?.(`KitaLulus: gagal ${loc} — ${(e as Error).message}`);
      continue;
    }

    const cards = parseListingHtml(html);
    opts.onProgress?.(`KitaLulus ${loc}: ${cards.length} lowongan`);

    for (const card of cards) {
      if (seen.has(card.slug)) continue;
      seen.add(card.slug);

      const job: RawJob = {
        source: "kitalulus",
        externalId: card.slug,
        url: `${BASE}/lowongan/detail/${card.slug}`,
        title: card.title,
        company: "",
        location: "",
        description: "",
        salaryText: null,
        workMode: null,
        employmentType: null,
        postedAt: null,
        scrapedAt: new Date().toISOString(),
      };

      const needDetail = opts.fetchDetails && (opts.shouldFetchDetail?.(job) ?? true);
      if (needDetail) {
        await opts.limiter.wait();
        try {
          const d = await politeFetch(job.url, {
            headers: { accept: "text/html" },
            timeoutMs: opts.timeoutMs,
            retries: opts.retries,
            cacheDir: opts.cacheDir,
            cacheTtlMs: opts.cacheTtlMs,
          });
          const parsed = d.status === 200 ? parseDetailHtml(d.body) : null;
          if (parsed) {
            job.description = parsed.description;
            job.company = parsed.company;
            job.location = parsed.location;
            job.salaryText = parsed.salaryText;
            job.employmentType = parsed.employmentType;
            job.postedAt = parsed.postedAt;
            job.workMode = parsed.workMode;
          }
        } catch (e) {
          opts.onProgress?.(`  KitaLulus detail ${card.slug} gagal: ${(e as Error).message}`);
        }
      }

      out.push(job);
    }
  }

  return out;
}
