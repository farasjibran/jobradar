import Link from "next/link";
import { notFound } from "next/navigation";
import { ApplyButton } from "@/components/ApplyButton";
import { ScoreBar } from "@/components/ScoreBar";
import { ScoreRing } from "@/components/ScoreRing";
import { getJob } from "@/lib/db";
import { loadProfile } from "@/lib/profile";
import { COMPONENT_META, rupiah, SOURCE_META, timeAgo, VERDICT_META } from "@/lib/ui";
import type { ComponentScore } from "@/lib/types";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  try {
    const job = getJob(decodeURIComponent(id));
    if (job) return { title: `${job.title} — ${job.totalScore}/100 | JobRadar` };
  } catch {
    // Abaikan; pakai judul default.
  }
  return { title: "Detail lowongan | JobRadar" };
}

export default async function JobDetail({ params }: Props) {
  const { id } = await params;

  let job: ReturnType<typeof getJob> = null;
  try {
    job = getJob(decodeURIComponent(id));
  } catch {
    job = null;
  }
  if (!job) notFound();

  const profile = await loadProfile();
  const verdict = VERDICT_META[job.verdict] ?? VERDICT_META.weak;
  const source = SOURCE_META[job.source] ?? SOURCE_META.manual;

  return (
    <div className="mx-auto max-w-3xl px-4 pb-20">
      {/* ---------------- Header ---------------- */}
      <div className="pt-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
            <path d="M10.5 3.5 6 8l4.5 4.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
          </svg>
          Kembali ke daftar
        </Link>
      </div>

      <header className="mt-4 flex flex-wrap items-start gap-5">
        <ScoreRing score={job.totalScore} size={104} stroke={8} showScale />
        <div className="min-w-[240px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${verdict.bg} ${verdict.text} ${verdict.ring}`}
            >
              {verdict.label}
            </span>
            {job.applied && (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300 ring-1 ring-emerald-500/30 ring-inset">
                ✓ Sudah dilamar
              </span>
            )}
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${source.className}`}
            >
              {source.label}
            </span>
            {job.roleLabel && (
              <span className="rounded bg-white/6 px-1.5 py-0.5 text-[10px] text-zinc-400">
                {job.roleLabel}
              </span>
            )}
          </div>

          <h1 className="mt-2 text-lg leading-snug font-semibold text-zinc-100">{job.title}</h1>
          <p className="mt-0.5 text-sm text-zinc-400">{job.company || "—"}</p>

          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <Meta label="Lokasi" value={job.location || "—"} />
            <Meta label="Sistem kerja" value={job.workMode || "—"} />
            <Meta label="Gaji" value={job.salaryText || "Tidak dicantumkan"} />
            <Meta label="Tipe" value={job.employmentType || "—"} />
            <Meta label="Diposting" value={timeAgo(job.postedAt)} />
            <Meta label="Ditemukan" value={timeAgo(job.firstSeenAt)} />
          </dl>

          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-zinc-900 transition-colors hover:bg-zinc-200"
          >
            Buka lowongan asli
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
              <path d="M6 3h7v7M13 3 6.5 9.5" />
            </svg>
          </a>
          <ApplyButton id={job.id} initialApplied={job.applied} />
        </div>
      </header>

      {/* ---------------- Rincian skor ---------------- */}
      <section className="mt-8">
        <h2 className="text-[11px] font-medium tracking-wide text-zinc-500 uppercase">
          Rincian skor
        </h2>
        <div className="mt-3 space-y-1 rounded-xl border border-white/8 bg-white/[0.02] p-4">
          {job.components.map((c) => (
            <ScoreBar key={c.key} component={c} showReasons />
          ))}
          <div className="mt-3 flex items-center justify-between border-t border-white/8 pt-3">
            <span className="text-xs font-medium text-zinc-300">Total</span>
            <span className="font-mono text-sm font-semibold tabular-nums text-zinc-100">
              {job.totalScore}
              <span className="text-zinc-600">/100</span>
              <span className="ml-2 text-[10px] font-normal text-zinc-500">
                ambang {profile.scoring.threshold}
              </span>
            </span>
          </div>
        </div>
      </section>

      {/* ---------------- Penjelasan tiap komponen ---------------- */}
      <section className="mt-8">
        <h2 className="text-[11px] font-medium tracking-wide text-zinc-500 uppercase">
          Kenapa skornya begitu
        </h2>
        <div className="mt-3 space-y-3">
          {job.components.map((c) => (
            <ComponentDetail key={c.key} component={c} />
          ))}
        </div>
      </section>

      {/* ---------------- Skill ---------------- */}
      {(job.matchedSkills.length > 0 || job.missingSkills.length > 0) && (
        <section className="mt-8">
          <h2 className="text-[11px] font-medium tracking-wide text-zinc-500 uppercase">
            Skill
          </h2>
          <div className="mt-3 rounded-xl border border-white/8 bg-white/[0.02] p-4">
            {job.matchedSkills.length > 0 && (
              <>
                <div className="text-[10px] tracking-wide text-emerald-400/80 uppercase">
                  Cocok dengan profil kamu ({job.matchedSkills.length})
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {job.matchedSkills.map((s) => (
                    <span
                      key={s}
                      className="rounded bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300 ring-1 ring-emerald-500/20 ring-inset"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </>
            )}
            {job.missingSkills.length > 0 && (
              <>
                <div className="mt-4 text-[10px] tracking-wide text-zinc-500 uppercase">
                  Diminta, belum ada di profil ({job.missingSkills.length})
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {job.missingSkills.map((s) => (
                    <span
                      key={s}
                      className="rounded bg-white/5 px-2 py-0.5 text-[11px] text-zinc-500 ring-1 ring-white/8 ring-inset"
                    >
                      {s}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-[10px] text-zinc-600">
                  Skill yang sering muncul di lowongan lolos filter bisa jadi prioritas belajar.
                </p>
              </>
            )}
          </div>
        </section>
      )}

      {/* ---------------- Deskripsi asli ---------------- */}
      {job.description && (
        <section className="mt-8">
          <h2 className="text-[11px] font-medium tracking-wide text-zinc-500 uppercase">
            Deskripsi lowongan
          </h2>
          <div className="mt-3 max-h-[520px] overflow-y-auto rounded-xl border border-white/8 bg-white/[0.02] p-4">
            <pre className="font-sans text-xs leading-relaxed whitespace-pre-wrap text-zinc-400">
              {job.description}
            </pre>
          </div>
        </section>
      )}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] tracking-wide text-zinc-600 uppercase">{label}</dt>
      <dd className="truncate text-zinc-300">{value}</dd>
    </div>
  );
}

/** Kartu penjelasan satu komponen: rumus + angka mentah. */
function ComponentDetail({ component }: { component: ComponentScore }) {
  const meta = COMPONENT_META[component.key];
  const explanations = (component.detail.explanation as string[]) ?? [];

  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className={`text-xs font-medium ${meta?.color ?? "text-zinc-300"}`}>
          {component.label}
        </h3>
        <span className="font-mono text-xs tabular-nums">
          {component.assessed ? (
            <>
              <span className="text-zinc-200">{component.score}</span>
              <span className="text-zinc-600">/{component.max}</span>
            </>
          ) : (
            <span className="text-zinc-500">tidak dinilai</span>
          )}
        </span>
      </div>
      {meta?.hint && <p className="mt-1 text-[10px] text-zinc-600">{meta.hint}</p>}

      {!component.assessed ? (
        <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
          Lowongan ini tidak memberikan data untuk komponen tersebut, jadi bobotnya
          dialihkan ke komponen lain dan komponen ini tidak mempengaruhi skor.
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {explanations.map((e, i) => (
            <li key={i} className="flex gap-2 text-[11px] leading-relaxed text-zinc-500">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-zinc-600" />
              {e}
            </li>
          ))}
        </ul>
      )}

      <RawDetail component={component} />
    </div>
  );
}

/** Tabel angka mentah — untuk yang mau memverifikasi sendiri. */
function RawDetail({ component }: { component: ComponentScore }) {
  const rows: [string, string][] = [];

  const push = (label: string, value: unknown) => {
    if (value == null || value === "") return;
    if (Array.isArray(value)) {
      if (!value.length) return;
      rows.push([label, value.join(", ")]);
    } else {
      rows.push([label, String(value)]);
    }
  };

  const d = component.detail;
  switch (component.key) {
    case "skills":
      push("rasio", d.ratio);
      push("cakupan semua skill", d.coverage);
      push("cakupan skill wajib", d.required_coverage);
      break;
    case "seniority":
      push("level terdeteksi", d.detected_level);
      push("tahun diminta", d.required_years);
      push("tahun kamu", d.my_years);
      push("pengali tahun", d.years_penalty);
      push("tuntutan kepemimpinan", d.leadership_expected);
      break;
    case "domain":
      push("industri terdeteksi", d.detected);
      push("cocok", d.matched);
      push("bertetangga", d.adjacent);
      push("industri kamu", d.my_domains);
      break;
    case "practical":
      push("lokasi terbaca", d.location_detected);
      push("tingkat lokasi", d.location_tier);
      push("skor lokasi", d.location_score);
      push("sistem kerja", d.work_mode);
      push("skor sistem kerja", d.work_mode_score);
      push("gaji terbaca", d.salary_raw_text);
      push("gaji min (bulanan)", d.salary_min != null ? rupiah(Number(d.salary_min)) : null);
      push("gaji max (bulanan)", d.salary_max != null ? rupiah(Number(d.salary_max)) : null);
      push("dikonversi", d.salary_normalized);
      push("skor gaji", d.salary_score);
      break;
  }

  if (!rows.length) return null;

  return (
    <details className="group mt-3">
      <summary className="cursor-pointer list-none text-[10px] text-zinc-600 transition-colors select-none hover:text-zinc-400">
        <span className="inline-flex items-center gap-1">
          <svg
            className="transition-transform group-open:rotate-90"
            width="8"
            height="8"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden
          >
            <path d="M5 3l6 5-6 5z" />
          </svg>
          angka mentah
        </span>
      </summary>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-[10px]">
        {rows.map(([k, v]) => (
          <div key={k} className="col-span-2 grid grid-cols-[minmax(120px,auto)_1fr] gap-3">
            <dt className="text-zinc-600">{k}</dt>
            <dd className="break-words text-zinc-400">{v}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
