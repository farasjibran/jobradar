"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { clsx } from "@/lib/clsx";

interface Option {
  value: string;
  label: string;
  count?: number;
}

interface Props {
  sources: Option[];
  families: Option[];
  total: number;
  shown: number;
}

/** Toolbar filter yang menulis ke query string (bisa dibagikan / di-bookmark). */
export function FilterBar({ sources, families, total, shown }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [search, setSearch] = useState(params.get("search") ?? "");
  const [minScore, setMinScore] = useState(params.get("minScore") ?? "0");

  // Sinkronkan input kalau URL berubah dari luar (mis. tombol reset).
  useEffect(() => {
    setSearch(params.get("search") ?? "");
    setMinScore(params.get("minScore") ?? "0");
  }, [params]);

  const push = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      next.delete("offset");
      next.delete("page");
      startTransition(() => {
        router.push(`/?${next.toString()}`, { scroll: false });
      });
    },
    [params, router],
  );

  const source = params.get("source") ?? "";
  const family = params.get("roleFamily") ?? "";
  const sort = params.get("sort") ?? "recent";
  const onlyPassed = params.get("onlyPassed") === "1";
  const hideApplied = params.get("hideApplied") === "1";
  const appliedOnly = params.get("appliedOnly") === "1";

  const activeFilters = [source, family, params.get("search")].filter(Boolean).length;

  return (
    <div className="sticky top-0 z-20 -mx-4 border-b border-white/8 bg-[#0a0a0b]/85 px-4 py-3 backdrop-blur-xl">
      <div className="flex flex-wrap items-center gap-2">
        {/* Pencarian */}
        <form
          className="relative min-w-[200px] flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            push({ search: search || null });
          }}
        >
          <svg
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-zinc-500"
            width="13"
            height="13"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden
          >
            <path d="M11.7 10.3a6 6 0 1 0-1.4 1.4l3 3a1 1 0 0 0 1.4-1.4l-3-3ZM2.5 6.5a4 4 0 1 1 8 0 4 4 0 0 1-8 0Z" />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari judul, perusahaan, lokasi…"
            className="w-full rounded-lg border border-white/10 bg-white/5 py-1.5 pr-2.5 pl-8 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-white/25 focus:bg-white/8 focus:outline-none"
          />
        </form>

        {/* Sumber */}
        <Select
          value={source}
          onChange={(v) => push({ source: v || null })}
          options={[{ value: "", label: "Semua sumber" }, ...sources]}
          label="Sumber"
        />

        {/* Role family */}
        <Select
          value={family}
          onChange={(v) => push({ roleFamily: v || null })}
          options={[{ value: "", label: "Semua role" }, ...families]}
          label="Role"
        />

        {/* Ambang skor */}
        <Select
          value={minScore}
          onChange={(v) => {
            setMinScore(v);
            push({ minScore: v });
          }}
          options={[
            { value: "90", label: "Skor 90+" },
            { value: "80", label: "Skor 80+" },
            { value: "70", label: "Skor 70+" },
            { value: "60", label: "Skor 60+" },
            { value: "0", label: "Semua skor" },
          ]}
          label="Ambang"
        />

        {/* Urutan */}
        <Select
          value={sort}
          onChange={(v) => push({ sort: v })}
          options={[
            { value: "recent", label: "Terbaru" },
            { value: "score", label: "Skor tertinggi" },
            { value: "company", label: "Perusahaan" },
          ]}
          label="Urutkan"
        />

        {/* Hanya yang lolos ambang */}
        <button
          type="button"
          onClick={() => push({ onlyPassed: onlyPassed ? "0" : null })}
          className={clsx(
            "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
            onlyPassed
              ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
              : "border-white/10 bg-white/5 text-zinc-400 hover:text-zinc-200",
          )}
          title="Hanya tampilkan lowongan yang lolos ambang skor"
        >
          Lolos filter
        </button>

        {/* Status lamaran: semua / sembunyikan sudah dilamar / hanya yang sudah dilamar */}
        <button
          type="button"
          onClick={() =>
            push({
              hideApplied: hideApplied ? null : "1",
              appliedOnly: null,
            })
          }
          className={clsx(
            "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
            hideApplied
              ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
              : "border-white/10 bg-white/5 text-zinc-400 hover:text-zinc-200",
          )}
          title="Sembunyikan lowongan yang sudah dilamar"
        >
          Sembunyi dilamar
        </button>
        <button
          type="button"
          onClick={() =>
            push({
              appliedOnly: appliedOnly ? null : "1",
              hideApplied: null,
            })
          }
          className={clsx(
            "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
            appliedOnly
              ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
              : "border-white/10 bg-white/5 text-zinc-400 hover:text-zinc-200",
          )}
          title="Hanya tampilkan lowongan yang sudah dilamar"
        >
          Sudah dilamar
        </button>

        {activeFilters > 0 && (
          <button
            type="button"
            onClick={() =>
              push({ source: null, roleFamily: null, search: null, verdict: null })
            }
            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-zinc-400 transition-colors hover:text-zinc-200"
          >
            Reset ({activeFilters})
          </button>
        )}

        <span
          className={clsx(
            "ml-auto font-mono text-[11px] tabular-nums transition-opacity",
            pending ? "opacity-40" : "opacity-100",
          )}
        >
          <span className="text-zinc-200">{shown}</span>
          <span className="text-zinc-600"> / {total} lowongan</span>
        </span>
      </div>

      {/* Modal loading saat filter berubah */}
      {pending && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-zinc-950/90 px-8 py-6 shadow-2xl">
            <div className="relative h-10 w-10">
              <div className="absolute inset-0 animate-ping rounded-full bg-violet-500/30" />
              <svg className="animate-spin text-violet-400" width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity=".2" />
                <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </div>
            <p className="text-sm font-medium text-zinc-200">
              Sedang memfilter kerjaan dan job…
            </p>
            <div className="h-1 w-40 overflow-hidden rounded-full bg-white/10">
              <div className="shimmer-bar h-full w-1/2 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  label: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className="cursor-pointer rounded-lg border border-white/10 bg-white/5 py-1.5 pr-7 pl-2.5 text-xs text-zinc-300 focus:border-white/25 focus:bg-white/8 focus:outline-none"
      style={{
        appearance: "none",
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 16 16' fill='%2371717a'><path d='M4.2 6.2 8 10l3.8-3.8'/></svg>\")",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 6px center",
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-zinc-900 text-zinc-200">
          {o.label}
          {o.count != null ? ` (${o.count})` : ""}
        </option>
      ))}
    </select>
  );
}
