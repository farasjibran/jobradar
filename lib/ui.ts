import { clsx, type ClassValue } from "./clsx";

export { clsx };
export type { ClassValue };

/** Format angka gaya Indonesia. */
export function nf(n: number, digits = 0): string {
  return n.toLocaleString("id-ID", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function rupiah(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) {
    const jt = n / 1_000_000;
    return `Rp ${jt.toFixed(jt % 1 === 0 ? 0 : 1)} jt`;
  }
  return `Rp ${nf(n)}`;
}

/** "2 hari lalu" dari tanggal ISO. */
export function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diff = Date.now() - t;
  const day = 86_400_000;
  if (diff < 0) {
    const future = Math.abs(diff);
    if (future < day) return "hari ini";
    return `dalam ${Math.round(future / day)} hari`;
  }
  if (diff < 3600_000) return `${Math.max(1, Math.round(diff / 60_000))} menit lalu`;
  if (diff < day) return `${Math.round(diff / 3600_000)} jam lalu`;
  if (diff < 30 * day) return `${Math.round(diff / day)} hari lalu`;
  return `${Math.round(diff / (30 * day))} bulan lalu`;
}

export const VERDICT_META: Record<
  string,
  { label: string; text: string; bg: string; ring: string; dot: string }
> = {
  strong: {
    label: "Sangat cocok",
    text: "text-emerald-300",
    bg: "bg-emerald-500/10",
    ring: "ring-emerald-500/30",
    dot: "bg-emerald-400",
  },
  good: {
    label: "Cocok",
    text: "text-teal-300",
    bg: "bg-teal-500/10",
    ring: "ring-teal-500/30",
    dot: "bg-teal-400",
  },
  borderline: {
    label: "Layak dicoba",
    text: "text-amber-300",
    bg: "bg-amber-500/10",
    ring: "ring-amber-500/30",
    dot: "bg-amber-400",
  },
  weak: {
    label: "Kurang cocok",
    text: "text-zinc-400",
    bg: "bg-zinc-500/10",
    ring: "ring-zinc-500/30",
    dot: "bg-zinc-500",
  },
};

export const COMPONENT_META: Record<
  string,
  { label: string; short: string; hint: string; color: string; bar: string }
> = {
  skills: {
    label: "Skills Overlap",
    short: "Skills",
    hint: "Kecocokan skill teknis — hal pertama yang dicek hiring manager",
    color: "text-violet-300",
    bar: "bg-violet-400",
  },
  seniority: {
    label: "Seniority Fit",
    short: "Seniority",
    hint: "Level & tahun pengalaman — menjaga kamu dari lowongan yang menolak di baris pertama",
    color: "text-sky-300",
    bar: "bg-sky-400",
  },
  domain: {
    label: "Domain Fit",
    short: "Domain",
    hint: "Kecocokan industri — judul sama di industri berbeda bukan pekerjaan yang sama",
    color: "text-fuchsia-300",
    bar: "bg-fuchsia-400",
  },
  practical: {
    label: "Practical Fit",
    short: "Praktis",
    hint: "Lokasi, remote, dan gaji — hal yang membunuh tawaran setelah empat interview",
    color: "text-orange-300",
    bar: "bg-orange-400",
  },
};

export const SOURCE_META: Record<string, { label: string; className: string }> = {
  linkedin: { label: "LinkedIn", className: "bg-[#0a66c2]/15 text-[#5aa9f0] ring-[#0a66c2]/40" },
  jobstreet: { label: "JobStreet", className: "bg-[#e60278]/15 text-[#f472b6] ring-[#e60278]/40" },
  glints: { label: "Glints", className: "bg-[#0caa41]/15 text-[#4ade80] ring-[#0caa41]/40" },
  kitalulus: { label: "KitaLulus", className: "bg-[#f59e0b]/15 text-[#fbbf24] ring-[#f59e0b]/40" },
  manual: { label: "Manual", className: "bg-zinc-500/15 text-zinc-300 ring-zinc-500/40" },
};

export function scoreColor(score: number): string {
  if (score >= 85) return "text-emerald-300";
  if (score >= 75) return "text-teal-300";
  if (score >= 70) return "text-amber-300";
  if (score >= 60) return "text-orange-300";
  return "text-zinc-400";
}
