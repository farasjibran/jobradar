import { Suspense } from "react";
import { CrawlButton } from "@/components/CrawlButton";
import { FilterBar } from "@/components/FilterBar";
import { JobCard } from "@/components/JobCard";
import { getStats, listJobs, countJobs, type ListFilters } from "@/lib/db";
import { loadProfile } from "@/lib/profile";
import { timeAgo } from "@/lib/ui";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function one(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v ?? undefined;
}

export default async function Home({ searchParams }: Props) {
  const sp = await searchParams;

  const profile = await loadProfile();
  const threshold = profile.scoring.threshold;

  const minScoreParam = one(sp.minScore);
  const minScore = minScoreParam != null && minScoreParam !== "" ? Number(minScoreParam) : 0;
  const onlyPassed = one(sp.onlyPassed) === "1";
  const hideApplied = one(sp.hideApplied) === "1";
  const appliedOnly = one(sp.appliedOnly) === "1";

  const page = Math.max(1, Number(one(sp.page)) || 1);
  const PAGE_SIZE = 10;

  const filters: ListFilters = {
    minScore: Number.isFinite(minScore) ? minScore : 0,
    onlyPassed,
    hideApplied,
    appliedOnly,
    source: one(sp.source),
    roleFamily: one(sp.roleFamily),
    verdict: one(sp.verdict),
    search: one(sp.search),
    sort: (one(sp.sort) as ListFilters["sort"]) ?? "recent",
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  };

  let jobs: Awaited<ReturnType<typeof listJobs>> = [];
  let stats: Awaited<ReturnType<typeof getStats>> | null = null;
  let filteredTotal = 0;
  let dbError: string | null = null;

  try {
    jobs = listJobs(filters);
    filteredTotal = countJobs(filters);
    stats = getStats();
  } catch (e) {
    dbError = e instanceof Error ? e.message : "Gagal membaca database";
  }
  const totalPages = Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE));

  /** Link ke halaman lain, pertahankan filter aktif. */
  function pageHref(p: number): string {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (k === "page") continue;
      if (typeof v === "string") q.set(k, v);
      else if (Array.isArray(v) && v[0]) q.set(k, v[0]);
    }
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return s ? `/?${s}` : "/";
  }

  const total = stats?.total ?? 0;
  const passed = stats?.passed ?? 0;
  const applied = stats?.applied ?? 0;

  // Opsi filter dibangun dari data yang ada, bukan hardcode.
  const sourceOptions = (stats?.bySource ?? []).map((s) => ({
    value: s.source,
    label:
      s.source === "linkedin" ? "LinkedIn" : s.source === "jobstreet" ? "JobStreet" : s.source === "kitalulus" ? "KitaLulus" : s.source === "glints" ? "Glints" : s.source,
    count: s.count,
  }));
  const familyOptions = (stats?.byFamily ?? [])
    .filter((f) => f.family !== "lainnya")
    .map((f) => ({ value: f.family, label: f.label, count: f.count }));

  return (
    <div className="mx-auto max-w-5xl px-4 pb-20">
      {/* ---------------- Header ---------------- */}
      <header className="pt-8 pb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-zinc-100">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600 text-[13px] font-bold text-white">
                J
              </span>
              JobRadar
            </h1>
            <p className="mt-1.5 text-xs text-zinc-500">
              Lowongan dari LinkedIn & JobStreet, dinilai 0–100.{" "}
              <span className="font-medium text-zinc-300">
                Lolos ambang ≥ {threshold}: {passed}
              </span>
            </p>
          </div>

          <CrawlButton sources={profile.crawl.sources} />
        </div>

        {/* Ringkasan angka */}
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Stat label="Total terkumpul" value={total} />
          <Stat label={`Lolos ≥ ${threshold}`} value={passed} accent="text-emerald-300" />
          <Stat label="Sudah dilamar" value={applied} accent="text-violet-300" />
          <Stat
            label="Rata-rata skor"
            value={
              stats && stats.bySource.length
                ? (
                    stats.bySource.reduce((s, x) => s + x.avg * x.count, 0) /
                    Math.max(1, stats.bySource.reduce((s, x) => s + x.count, 0))
                  ).toFixed(1)
                : "—"
            }
          />
          <Stat
            label="Crawl terakhir"
            value={stats?.lastRun ? timeAgo(stats.lastRun.startedAt) : "belum pernah"}
            small
          />
        </div>

        {/* Distribusi skor */}
        {stats && total > 0 && (
          <div className="mt-3 flex items-end gap-1">
            {stats.scoreBuckets.map((b) => {
              const max = Math.max(...stats!.scoreBuckets.map((x) => x.count), 1);
              const h = Math.max(2, (b.count / max) * 28);
              return (
                <div key={b.range} className="group flex-1" title={`${b.range}: ${b.count} lowongan`}>
                  <div
                    className={
                      b.range === "70-79" || b.range === "80-89" || b.range === "90-100"
                        ? "rounded-t bg-emerald-400/50 transition-colors group-hover:bg-emerald-400/80"
                        : "rounded-t bg-white/12 transition-colors group-hover:bg-white/25"
                    }
                    style={{ height: `${h}px` }}
                  />
                  <div className="mt-1 text-center font-mono text-[9px] text-zinc-600">{b.range}</div>
                </div>
              );
            })}
          </div>
        )}
      </header>

      {/* ---------------- Filter ---------------- */}
      <Suspense fallback={<div className="h-14" />}>
        <FilterBar
          sources={sourceOptions}
          families={familyOptions}
          total={total}
          shown={filteredTotal}
        />
      </Suspense>

      {/* ---------------- Hasil ---------------- */}
      <div className="mt-4 space-y-2.5">
        {dbError && (
          <Notice tone="error" title="Database belum siap">
            {dbError}
            <br />
            Jalankan <code className="text-zinc-300">bun run crawl</code> dulu untuk mengisi data.
          </Notice>
        )}

        {!dbError && jobs.length === 0 && (
          <Notice tone="empty" title="Belum ada lowongan yang lolos filter">
            {total === 0 ? (
              <>
                Database masih kosong. Jalankan{" "}
                <code className="text-zinc-300">bun run crawl</code> di terminal, atau klik
                &ldquo;Ambil lowongan&rdquo; di atas.
              </>
            ) : (
              <>
                {total} lowongan sudah terkumpul, tapi tidak ada yang memenuhi filter saat ini.
                Coba turunkan ambang skor atau reset filter.
              </>
            )}
          </Notice>
        )}

        {jobs.map((job, i) => (
          <JobCard key={job.id} job={job} rank={i + 1} />
        ))}
      </div>

      {jobs.length > 0 && (
        <div className="mt-8 flex flex-col items-center gap-3">
          <p className="text-[11px] text-zinc-600">
            Halaman {page} dari {totalPages} — {filteredTotal} lowongan cocok, 10 per halaman.
          </p>
          {totalPages > 1 && (
            <nav className="flex items-center gap-1" aria-label="Paginasi">
              {page > 1 && (
                <a href={pageHref(page - 1)} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300 hover:text-white">
                  ← Sebelumnya
                </a>
              )}
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                .map((p, i, arr) => (
                  <span key={p} className="flex items-center gap-1">
                    {i > 0 && arr[i - 1] !== p - 1 && (
                      <span className="px-1 text-zinc-700">…</span>
                    )}
                    <a
                      href={pageHref(p)}
                      aria-current={p === page ? "page" : undefined}
                      className={
                        p === page
                          ? "rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-zinc-900"
                          : "rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300 hover:text-white"
                      }
                    >
                      {p}
                    </a>
                  </span>
                ))}
              {page < totalPages && (
                <a href={pageHref(page + 1)} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300 hover:text-white">
                  Berikutnya →
                </a>
              )}
            </nav>
          )}
        </div>
      )}

      {/* ---------------- Kaki: info bobot ---------------- */}
      <footer className="mt-12 border-t border-white/8 pt-5">
        <h2 className="text-[11px] font-medium tracking-wide text-zinc-500 uppercase">
          Cara skor dihitung
        </h2>
        <div className="mt-2 grid gap-1.5 text-[11px] text-zinc-500 sm:grid-cols-2">
          <Weight label="Skills overlap" value={profile.scoring.weights.skills} note="hal pertama yang dicek hiring manager" />
          <Weight label="Seniority fit" value={profile.scoring.weights.seniority} note="menjaga dari penolakan satu baris" />
          <Weight label="Domain fit" value={profile.scoring.weights.domain} note="judul sama, industri beda ≠ pekerjaan sama" />
          <Weight label="Practical fit" value={profile.scoring.weights.practical} note="lokasi, remote, gaji" />
        </div>
        <p className="mt-3 text-[10px] leading-relaxed text-zinc-600">
          Kalau lowongan tidak mencantumkan data untuk sebuah komponen (mis. gaji tidak
          disebutkan), komponen itu ditandai &ldquo;tidak dinilai&rdquo; dan bobotnya
          dialihkan ke komponen lain — supaya data yang hilang tidak dihitung sebagai
          nilai buruk.
        </p>
      </footer>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  small,
}: {
  label: string;
  value: string | number;
  accent?: string;
  small?: boolean;
}) {
  return (
    <div className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2">
      <div className="text-[10px] tracking-wide text-zinc-500 uppercase">{label}</div>
      <div
        className={`mt-0.5 font-semibold tabular-nums ${small ? "text-xs" : "text-lg"} ${
          accent ?? "text-zinc-200"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function Weight({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-10 shrink-0 font-mono text-xs font-semibold text-zinc-300">{value}</span>
      <span className="text-zinc-400">{label}</span>
      <span className="text-zinc-600">— {note}</span>
    </div>
  );
}

function Notice({
  tone,
  title,
  children,
}: {
  tone: "error" | "empty";
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={
        tone === "error"
          ? "rounded-xl border border-rose-500/25 bg-rose-500/5 p-5"
          : "rounded-xl border border-white/8 bg-white/[0.02] p-8 text-center"
      }
    >
      <h3
        className={
          tone === "error"
            ? "text-sm font-medium text-rose-200"
            : "text-sm font-medium text-zinc-300"
        }
      >
        {title}
      </h3>
      <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">{children}</p>
    </div>
  );
}
