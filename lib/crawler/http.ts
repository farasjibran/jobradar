/**
 * HTTP client yang sopan: rate limit, retry dengan backoff, timeout,
 * dan cache di disk.
 *
 * Prinsip: lebih baik lambat tapi tidak diblokir. Jangan paralelkan
 * permintaan ke host yang sama.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";

export interface FetchOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  cacheDir?: string;
  cacheTtlMs?: number;
  /** Jangan pakai cache (mis. saat paksa refresh). */
  noCache?: boolean;
}

const DEFAULT_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export class RateLimiter {
  private last = 0;
  constructor(
    private minMs: number,
    private maxMs: number,
  ) {}

  /** Tunggu giliran sebelum permintaan berikutnya. */
  async wait(): Promise<number> {
    const jitter = this.minMs + Math.random() * Math.max(0, this.maxMs - this.minMs);
    const now = Date.now();
    const elapsed = now - this.last;
    const sleep = Math.max(0, jitter - elapsed);
    if (sleep > 0) await new Promise((r) => setTimeout(r, sleep));
    this.last = Date.now();
    return Math.round(sleep);
  }
}

function cachePath(dir: string, url: string): string {
  const hash = createHash("sha1").update(url).digest("hex").slice(0, 16);
  const safe = url.replace(/[^a-z0-9]+/gi, "_").slice(0, 80);
  return path.join(dir, `${safe}_${hash}.cache`);
}

async function readCache(
  file: string,
  ttlMs: number,
): Promise<string | null> {
  try {
    const s = await stat(file);
    if (Date.now() - s.mtimeMs > ttlMs) return null;
    return await readFile(file, "utf8");
  } catch {
    return null;
  }
}

export interface FetchResult {
  body: string;
  status: number;
  fromCache: boolean;
  url: string;
}

export async function politeFetch(
  url: string,
  opts: FetchOptions = {},
): Promise<FetchResult> {
  const {
    headers = {},
    timeoutMs = 20_000,
    retries = 2,
    cacheDir,
    cacheTtlMs = 12 * 3600_000,
    noCache = false,
  } = opts;

  let file: string | null = null;
  if (cacheDir) {
    file = cachePath(cacheDir, url);
    if (!noCache) {
      const hit = await readCache(file, cacheTtlMs);
      if (hit !== null) return { body: hit, status: 200, fromCache: true, url };
    }
  }

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: {
          "user-agent": DEFAULT_UA,
          accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
          "accept-language": "en-US,en;q=0.9,id;q=0.8",
          "cache-control": "no-cache",
          ...headers,
        },
        signal: controller.signal,
        redirect: "follow",
      });
      clearTimeout(timer);
      const body = await res.text();

      // 429/503 -> backoff lebih panjang.
      if ((res.status === 429 || res.status === 503) && attempt < retries) {
        const wait = 5000 * (attempt + 1) + Math.random() * 3000;
        console.warn(
          `  [http] ${res.status} dari ${new URL(url).host} — tunggu ${Math.round(wait / 1000)}s lalu coba lagi`,
        );
        await new Promise((r) => setTimeout(r, wait));
        lastError = new Error(`HTTP ${res.status}`);
        continue;
      }

      if (file && res.ok && body.length > 100) {
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, body, "utf8").catch(() => {});
      }

      return { body, status: res.status, fromCache: false, url };
    } catch (e) {
      clearTimeout(timer);
      lastError = e as Error;
      if (attempt < retries) {
        const wait = 1500 * (attempt + 1);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  throw new Error(
    `Gagal mengambil ${url} setelah ${retries + 1} percobaan: ${lastError?.message ?? "unknown"}`,
  );
}

export function buildCookieHeader(cookie: string | undefined): Record<string, string> {
  return cookie ? { cookie } : {};
}
