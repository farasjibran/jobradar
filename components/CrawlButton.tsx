"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clsx } from "@/lib/clsx";

interface Summary {
  runId: number;
  fetched: number;
  inserted: number;
  updated: number;
  passed: number;
  rejected: number;
  bySource: Record<string, number>;
  durationMs: number;
  errors: string[];
}

/** Tombol untuk menjalankan crawl dari UI. */
export function CrawlButton({
  sources,
  className,
}: {
  sources: string[];
  className?: string;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<string>("all");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);

  // Jam berjalan selama crawl berlangsung.
  useEffect(() => {
    if (!startedAt || !running) return;
    const t = setInterval(() => setElapsed(Date.now() - startedAt), 1000);
    return () => clearInterval(t);
  }, [startedAt, running]);

  /** Poll GET /api/crawl sampai crawl selesai, lalu isi summary. */
  async function watchCrawl() {
    const deadline = Date.now() + 25 * 60_000;
    for (;;) {
      await new Promise((r) => setTimeout(r, 3000));
      const st = await fetch("/api/crawl").then((r) => r.json()).catch(() => null);
      if (st && st.running === false) {
        const lr = st.lastRun;
        if (lr) {
          setSummary({
            runId: lr.id,
            fetched: lr.fetched,
            inserted: lr.newJobs,
            updated: lr.updatedJobs,
            passed: lr.passedJobs,
            rejected: lr.rejected,
            bySource: {},
            durationMs: lr.durationMs ?? 0,
            errors: lr.errors ?? [],
          });
          if (lr.durationMs) setElapsed(lr.durationMs);
        }
        return;
      }
      if (Date.now() > deadline) throw new Error("Crawl terlalu lama — cek data/crawl.log");
    }
  }

  // Saat halaman dimuat (mis. setelah refresh), kalau ada crawl berjalan
  // di server, tampilkan lagi modal progresnya.
  useEffect(() => {
    fetch("/api/crawl")
      .then((r) => r.json())
      .then(async (st) => {
        if (st?.running) {
          setRunning(true);
          setModalOpen(true);
          const t0 = st.lastRun?.startedAt ? Date.parse(st.lastRun.startedAt) : Date.now();
          setStartedAt(t0);
          setElapsed(Date.now() - t0);
          try {
            await watchCrawl();
            router.refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Crawl gagal");
          } finally {
            setRunning(false);
          }
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run() {
    setRunning(true);
    setError(null);
    setSummary(null);
    setStartedAt(Date.now());
    setElapsed(0);
    setModalOpen(true);
    try {
      const res = await fetch("/api/crawl", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source: source === "all" ? undefined : source,
          // Batasi query supaya tombol ini tidak menggantung terlalu lama.
          // Crawl penuh sebaiknya lewat `bun run crawl` (cron).
          limit: 2,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      // Crawl berjalan di proses terpisah — poll status sampai selesai.
      await watchCrawl();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Crawl gagal");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className={clsx("flex flex-col items-end gap-2", className)}>
      <div className="flex items-center gap-2">
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          disabled={running}
          aria-label="Pilih sumber"
          className="cursor-pointer rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-zinc-300 disabled:opacity-50 focus:border-white/25 focus:outline-none"
        >
          <option value="all" className="bg-zinc-900">Semua sumber</option>
          {sources.map((s) => (
            <option key={s} value={s} className="bg-zinc-900">
              {s === "linkedin" ? "LinkedIn" : s === "jobstreet" ? "JobStreet" : s}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={run}
          disabled={running}
          className={clsx(
            "relative inline-flex items-center gap-1.5 overflow-hidden rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
            running
              ? "cursor-wait bg-white/10 text-zinc-400"
              : "bg-white text-zinc-900 hover:bg-zinc-200",
          )}
        >
          {running ? (
            <>
              <svg className="animate-spin" width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden>
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity=".25" />
                <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Mengambil…
            </>
          ) : (
            <>
              <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                <path d="M8 2a6 6 0 1 0 6 6h-2a4 4 0 1 1-1.2-2.8L9 7h5V2l-1.5 1.5A6 6 0 0 0 8 2Z" />
              </svg>
              Ambil lowongan
            </>
          )}
        </button>
      </div>

      {/* Modal progres crawl */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm">
          <div className="flex w-[320px] flex-col items-center gap-3 rounded-2xl border border-white/10 bg-zinc-950/90 px-8 py-6 shadow-2xl">
            {running ? (
              <>
                <div className="relative h-10 w-10">
                  <div className="absolute inset-0 animate-ping rounded-full bg-violet-500/30" />
                  <svg className="animate-spin text-violet-400" width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity=".2" />
                    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-zinc-200">Mengambil lowongan…</p>
                <p className="text-xs text-zinc-500">
                  Berjalan {Math.floor(elapsed / 1000)} detik — aman walau tab di-refresh
                </p>
                <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                  <div className="shimmer-bar h-full w-1/2 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500" />
                </div>
              </>
            ) : summary ? (
              <>
                <div className="grid h-10 w-10 place-items-center rounded-full bg-emerald-500/15 text-emerald-300">
                  <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                    <path d="M6.5 11.2 3.8 8.5l-1.3 1.3 4 4 7-7-1.3-1.3-5.7 5.7Z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-zinc-200">Crawl selesai</p>
                <p className="text-center text-xs leading-relaxed text-zinc-500">
                  {(elapsed / 1000).toFixed(0)} detik — diambil {summary.fetched}, baru{" "}
                  {summary.inserted}, diperbarui {summary.updated},{" "}
                  <span className="text-emerald-300">lolos filter {summary.passed}</span>
                  {summary.errors.length > 0 && (
                    <span className="block text-amber-300">
                      {summary.errors.length} error (lihat data/crawl.log)
                    </span>
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="mt-1 rounded-lg bg-white px-4 py-1.5 text-xs font-medium text-zinc-900 hover:bg-zinc-200"
                >
                  Tutup
                </button>
              </>
            ) : (
              <>
                <div className="grid h-10 w-10 place-items-center rounded-full bg-rose-500/15 text-rose-300">!</div>
                <p className="text-sm font-medium text-zinc-200">Crawl gagal</p>
                <p className="text-center text-xs text-rose-300/90">{error}</p>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="mt-1 rounded-lg border border-white/10 px-4 py-1.5 text-xs text-zinc-300"
                >
                  Tutup
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
