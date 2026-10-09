import Link from "next/link";
import { clsx } from "@/lib/clsx";
import type { JobRecord } from "@/lib/db";
import { rupiah, SOURCE_META, timeAgo, VERDICT_META } from "@/lib/ui";
import { ScoreBar } from "./ScoreBar";
import { ScoreRing } from "./ScoreRing";

interface Props {
  job: JobRecord;
  rank?: number;
}

export function JobCard({ job, rank }: Props) {
  const verdict = VERDICT_META[job.verdict] ?? VERDICT_META.weak;
  const source = SOURCE_META[job.source] ?? SOURCE_META.manual;
  const applied = job.applied === true;

  return (
    <article
      className={
        applied
          ? "animate-fade-up group relative rounded-xl border border-emerald-500/20 bg-emerald-500/[0.03] p-4 transition-colors hover:border-emerald-500/30"
          : "animate-fade-up group relative rounded-xl border border-white/8 bg-white/[0.02] p-4 transition-colors hover:border-white/15 hover:bg-white/[0.035]"
      }
    >
      <div className="flex gap-4">
        {/* Kiri: cincin skor */}
        <div className="flex flex-col items-center gap-2">
          {rank != null && (
            <span className="font-mono text-[10px] text-zinc-600">#{rank}</span>
          )}
          <ScoreRing score={job.totalScore} size={62} stroke={6} showScale />
          <span
            className={clsx(
              "rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap ring-1 ring-inset",
              verdict.bg,
              verdict.text,
              verdict.ring,
            )}
          >
            {verdict.label}
          </span>
        </div>

        {/* Kanan: info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-zinc-100 group-hover:text-white">
                <Link href={`/jobs/${encodeURIComponent(job.id)}`} className="focus:outline-none">
                  {/* Link meluas supaya seluruh kartu bisa diklik */}
                  <span className="absolute inset-0 z-0" aria-hidden />
                  {job.title}
                </Link>
              </h3>
              <p className="mt-0.5 truncate text-xs text-zinc-400">{job.company || "—"}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {applied && (
                <span
                  className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium whitespace-nowrap text-emerald-300 ring-1 ring-emerald-500/30 ring-inset"
                  title={job.appliedAt ? `Dilamar ${job.appliedAt}` : "Sudah dilamar"}
                >
                  ✓ Dilamar
                </span>
              )}
              <span
                className={clsx(
                  "rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset",
                  source.className,
                )}
              >
                {source.label}
              </span>
            </div>
          </div>

          {/* Meta baris */}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500">
            <span className="inline-flex items-center gap-1">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                <path d="M8 1.5a5 5 0 0 0-5 5c0 3.5 5 8 5 8s5-4.5 5-8a5 5 0 0 0-5-5Zm0 6.75A1.75 1.75 0 1 1 8 4.75a1.75 1.75 0 0 1 0 3.5Z" />
              </svg>
              {job.location || "Lokasi tidak disebut"}
            </span>
            {job.workMode && (
              <span className="rounded bg-white/6 px-1.5 py-0.5 text-zinc-400">{job.workMode}</span>
            )}
            {job.salaryText ? (
              <span className="font-medium text-emerald-300/80">{job.salaryText}</span>
            ) : (
              <span className="text-zinc-600">Gaji tidak dicantumkan</span>
            )}
            {job.postedAt && <span>{timeAgo(job.postedAt)}</span>}
            {job.roleLabel && (
              <span className="rounded bg-white/6 px-1.5 py-0.5 text-zinc-400">{job.roleLabel}</span>
            )}
          </div>

          {/* Breakdown 4 komponen */}
          <div className="mt-3 grid grid-cols-2 gap-x-4 sm:grid-cols-4">
            {job.components.map((c) => (
              <ScoreBar key={c.key} component={c} compact />
            ))}
          </div>

          {/* Skill cocok / kurang */}
          <div className="mt-3 flex flex-wrap items-center gap-1">
            {job.matchedSkills.slice(0, 7).map((s) => (
              <span
                key={s}
                className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-300/90 ring-1 ring-emerald-500/20 ring-inset"
              >
                {s}
              </span>
            ))}
            {job.missingSkills.slice(0, 4).map((s) => (
              <span
                key={s}
                className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-zinc-500 line-through decoration-zinc-600"
                title="Diminta lowongan, belum ada di profil kamu"
              >
                {s}
              </span>
            ))}
            {job.matchedSkills.length > 7 && (
              <span className="text-[10px] text-zinc-600">+{job.matchedSkills.length - 7} lagi</span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
