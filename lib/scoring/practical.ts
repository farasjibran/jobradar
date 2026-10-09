/**
 * Practical Fit (15 poin)
 *
 * Ini yang membunuh tawaran setelah empat kali interview: lokasi yang tidak
 * masuk akal, kebijakan remote yang ternyata WFO penuh, dan gaji yang
 * ternyata jauh di bawah ekspektasi.
 *
 * Sub-bobot (total 1.0):
 *   lokasi   0.45
 *   gaji     0.40
 *   kerja    0.15  (remote / hybrid / onsite)
 */

import { clamp, normalize, parseMoney } from "../text";
import type { CandidateProfile, ScoreReason } from "../types";

export interface PracticalResult {
  score: number; // 0..1
  /** false kalau lokasi, gaji, DAN mode kerja semuanya tidak diketahui. */
  assessed: boolean;
  locationScore: number;
  salaryScore: number;
  workModeScore: number;
  salaryMin: number | null;
  salaryMax: number | null;
  workMode: "remote" | "hybrid" | "onsite" | "unknown";
  locationTier: "preferred" | "acceptable" | "outside" | "unknown";
  reasons: ScoreReason[];
  explanations: string[];
  detail: Record<string, number | string | string[] | null>;
}

const SUB_WEIGHTS = { location: 0.45, salary: 0.4, workMode: 0.15 };

/** Wilayah DKI/Jabodetabek yang dikenali, untuk normalisasi. */
const LOCATION_ALIASES: { canonical: string; re: RegExp }[] = [
  { canonical: "jakarta timur", re: /\b(jakarta timur|jakarta east|jaktim|tanjung priok|cakung|pulogadung|rawamangun|duren sawit|matraman|jatinegara|klender|ciracas|kramat jati|pasar rebo|halim|pinang ranti|pondok kelapa|duren sawit)\b/i },
  { canonical: "jakarta selatan", re: /\b(jakarta selatan|jakarta south|jaksel|kebayoran|tebet|cilandak|pasar minggu|jagakarsa|mampang|pancoran|setiabudi|pesanggrahan|bintaro|pondok indah|kemang|senayan)\b/i },
  { canonical: "jakarta pusat", re: /\b(jakarta pusat|jakarta central|jakpus|jakarta cbd|scbd|sudirman|thamrin|kuningan)\b/i },
  { canonical: "jakarta barat", re: /\b(jakarta barat|jakarta west|jakbar)\b/i },
  { canonical: "jakarta utara", re: /\b(jakarta utara|jakarta north|jakut)\b/i },
  { canonical: "jakarta", re: /\b(jakarta|dki|jabodetabek|jabodetabekpunjur|tb simatupang|bsd)\b/i },
  { canonical: "depok", re: /\b(depok|margonda|ui depok|cinere|sawangan)\b/i },
  { canonical: "bogor", re: /\b(bogor|bogor regency|kabupaten bogor|cibinong|sentul|cibubur|gunung putri)\b/i },
  { canonical: "tangerang", re: /\b(tangerang|tangerang selatan|tangsel|serpong|bsd|gading serpong|karawaci|cikupa|alam sutera)\b/i },
  { canonical: "bekasi", re: /\b(bekasi|bekasi timur|cikarang|jatiasih|harapan indah)\b/i },
];

export function detectLocations(locationText: string): string[] {
  const t = normalize(locationText);
  const found: string[] = [];
  for (const { canonical, re } of LOCATION_ALIASES) {
    if (re.test(t)) found.push(canonical);
  }
  // "jakarta" generik hanya relevan kalau tidak ada spesifik.
  const specific = found.filter((f) => f !== "jakarta");
  if (specific.length) return found.filter((f) => f !== "jakarta" || false);
  return found;
}

export function detectWorkMode(text: string): "remote" | "hybrid" | "onsite" | "unknown" {
  const t = normalize(text);
  // Urutan penting: cek "hybrid" sebelum "remote" karena sering muncul bersama.
  if (/\b(hybrid|hibrida|sebagian remote|partially remote|2 days? (?:in|at) office|wfo\s*\/\s*wfh)\b/i.test(t)) {
    return "hybrid";
  }
  if (/\b(fully remote|full remote|100% remote|work from anywhere|wfa|remote[\s-]?friendly|kerja dari mana saja|wfh full|remote position|remote work)\b/i.test(t)) {
    return "remote";
  }
  if (/\b(remote|wfh|work from home|kerja dari rumah)\b/i.test(t)) {
    return "remote";
  }
  if (/\b(on[\s-]?site|wfo|work from office|kerja di kantor|berkantor|di kantor|hadir di kantor)\b/i.test(t)) {
    return "onsite";
  }
  return "unknown";
}

/**
 * Normalisasi gaji ke per bulan.
 * "Rp 180.000.000 per year" -> 15.000.000 per bulan.
 * Tanpa ini, gaji tahunan akan terbaca seolah gaji bulanan yang sangat besar.
 */
export function normalizeToMonthly(
  min: number | null,
  max: number | null,
  text: string | null,
): { min: number | null; max: number | null } {
  if (min === null) return { min: null, max: null };
  const t = normalize(text ?? "");
  const perYear =
    /\b(per year|per annum|\/year|\/yr|p\.?a\.?|annually|per tahun|\/tahun|tahunan|annual)\b/i.test(t);
  const perDay = /\b(per day|\/day|per hari|\/hari|harian)\b/i.test(t);
  if (perYear) {
    return {
      min: Math.round(min / 12),
      max: max === null ? null : Math.round(max / 12),
    };
  }
  if (perDay) {
    return {
      min: Math.round(min * 22),
      max: max === null ? null : Math.round(max * 22),
    };
  }
  return { min, max };
}

/** Cari rentang gaji dari teks (mis. "Rp 10.000.000 – 15.000.000 per bulan"). */
export function extractSalary(text: string | null): { min: number | null; max: number | null } {
  if (!text) return { min: null, max: null };
  const s = normalize(text);
  const numbers: number[] = [];

  // Pola angka penuh Indonesia: 10.000.000 atau 10,000,000
  const full = s.match(/\d[\d.,]{5,}/g) ?? [];
  for (const raw of full) {
    const cleaned = raw.replace(/[.,](?=\d{3}\b)/g, "").replace(",", ".");
    const n = Number(cleaned);
    if (Number.isFinite(n) && n >= 500_000 && n <= 500_000_000) numbers.push(n);
  }

  // Pola singkat: 10jt, 10 juta, 10 mio, 1.5jt
  if (numbers.length < 2) {
    const short = s.match(/(\d+(?:[.,]\d+)?)\s*(jt|juta|mio|million)\b/g) ?? [];
    for (const raw of short) {
      const n = parseMoney(raw);
      if (n && n >= 500_000 && n <= 500_000_000) numbers.push(n);
    }
  }

  if (!numbers.length) return { min: null, max: null };
  const sorted = [...new Set(numbers)].sort((a, b) => a - b);
  return { min: sorted[0], max: sorted[sorted.length - 1] };
}

export function scorePractical(
  job: { location: string; salaryText: string | null; description: string; title: string; workMode: string | null },
  profile: CandidateProfile,
): PracticalResult {
  const cfg = profile.candidate;
  const reasons: ScoreReason[] = [];
  const explanations: string[] = [];

  // ---------- 1. LOKASI ----------
  const locText = `${job.location} ${job.title} ${job.workMode ?? ""}`;
  const detectedLocs = detectLocations(locText);
  const preferred = cfg.location.preferred.map((l) => l.toLowerCase());
  const acceptable = cfg.location.acceptable.map((l) => l.toLowerCase());

  let locationScore = 0.5;
  let locationTier: PracticalResult["locationTier"] = "unknown";

  if (detectedLocs.length === 0) {
    locationScore = 0.5;
    locationTier = "unknown";
    explanations.push(
      `Lokasi "${job.location || "(kosong)"}" tidak dikenali sebagai area Jabodetabek — skor lokasi netral.`,
    );
  } else {
    const inPreferred = detectedLocs.some((l) => preferred.includes(l));
    const inAcceptable = detectedLocs.some((l) => acceptable.includes(l));
    if (inPreferred) {
      locationScore = 1.0;
      locationTier = "preferred";
      reasons.push({ kind: "plus", text: `Lokasi prioritas: ${detectedLocs.join(", ")}` });
      explanations.push(
        `Lokasi ${detectedLocs.join(", ")} termasuk area yang kamu prioritaskan.`,
      );
    } else if (inAcceptable) {
      locationScore = 0.75;
      locationTier = "acceptable";
      reasons.push({ kind: "info", text: `Lokasi masih terjangkau: ${detectedLocs.join(", ")}` });
      explanations.push(
        `Lokasi ${detectedLocs.join(", ")} bisa dijangkau, tapi bukan area prioritas utama.`,
      );
    } else {
      locationScore = 0.1;
      locationTier = "outside";
      reasons.push({ kind: "minus", text: `Lokasi di luar area kamu: ${detectedLocs.join(", ")}` });
      explanations.push(
        `Lokasi ${detectedLocs.join(", ")} di luar daftar area kamu (prioritas: ${cfg.location.preferred.join(", ")}; masih oke: ${cfg.location.acceptable.join(", ")}).`,
      );
    }
  }

  // ---------- 2. MODE KERJA ----------
  const modeText = `${job.workMode ?? ""} ${job.location} ${job.title} ${job.description}`;
  const workMode = detectWorkMode(modeText);
  let workModeScore = 0.5;
  if (workMode === "remote") {
    workModeScore = cfg.location.accept_remote ? 1.0 : 0.3;
    reasons.push({
      kind: cfg.location.accept_remote ? "plus" : "minus",
      text: cfg.location.accept_remote ? "Bisa remote" : "Remote, tapi kamu tidak menginginkan remote",
    });
    explanations.push(
      cfg.location.accept_remote
        ? "Lowongan menyebut opsi remote/WFH — lokasi jadi bukan hambatan."
        : "Lowongan remote, tapi preferensi kamu tidak mengizinkan remote.",
    );
  } else if (workMode === "hybrid") {
    workModeScore = cfg.location.accept_hybrid ? 1.0 : 0.4;
    reasons.push({
      kind: cfg.location.accept_hybrid ? "plus" : "minus",
      text: cfg.location.accept_hybrid ? "Hybrid" : "Hybrid, tapi kamu tidak menginginkannya",
    });
    explanations.push(
      cfg.location.accept_hybrid
        ? "Lowongan hybrid — perlu datang ke kantor beberapa hari saja."
        : "Lowongan hybrid, tapi kamu tidak menginginkan skema hybrid.",
    );
  } else if (workMode === "onsite") {
    workModeScore = cfg.location.accept_onsite ? 0.8 : 0.2;
    reasons.push({
      kind: cfg.location.accept_onsite ? "info" : "minus",
      text: cfg.location.accept_onsite ? "Onsite penuh" : "Onsite penuh, kamu tidak menginginkannya",
    });
    explanations.push(
      cfg.location.accept_onsite
        ? "Lowongan onsite penuh — jarak dan waktu tempuh jadi faktor utama."
        : "Lowongan onsite penuh, sementara kamu tidak menginginkan kerja onsite.",
    );
  } else {
    explanations.push("Kebijakan kerja (remote/hybrid/onsite) tidak disebutkan — dinilai netral.");
  }

  // Remote membuat skor lokasi tidak relevan lagi.
  if (workMode === "remote" && cfg.location.accept_remote && locationTier === "outside") {
    locationScore = 1.0;
    locationTier = "preferred";
    explanations.push(
      "Karena lowongan remote dan kamu menerima remote, penalti lokasi diabaikan.",
    );
  }

  // ---------- 3. GAJI ----------
  const sal = cfg.salary;
  const rawSal = extractSalary(job.salaryText);
  // Gaji tahunan/harian dinormalisasi ke bulanan supaya bisa dibandingkan
  // dengan target bulanan dari profile.yaml.
  const { min: salaryMin, max: salaryMax } = normalizeToMonthly(
    rawSal.min,
    rawSal.max,
    job.salaryText,
  );
  const wasNormalized = rawSal.min !== null && salaryMin !== rawSal.min;
  let salaryScore = 0.5;
  if (salaryMin === null) {
    explanations.push("Lowongan tidak mencantumkan gaji — skor gaji netral (0.5).");
  } else {
    if (wasNormalized) {
      explanations.push(
        `Gaji dikonversi ke bulanan: ${fmt(rawSal.min ?? 0)}${rawSal.max ? " – " + fmt(rawSal.max) : ""} (periode asli) menjadi ${fmt(salaryMin)}${salaryMax ? " – " + fmt(salaryMax) : ""} per bulan.`,
      );
    }
    const top = salaryMax ?? salaryMin;
    const bottom = salaryMin;
    if (bottom >= sal.target_min && bottom <= sal.target_max) {
      salaryScore = 1.0;
      reasons.push({ kind: "plus", text: "Gaji sesuai target kamu" });
      explanations.push(
        `Rentang gaji ${fmt(bottom)} – ${fmt(top)} masuk ke target kamu (${fmt(sal.target_min)} – ${fmt(sal.target_max)}).`,
      );
    } else if (top >= sal.target_min && bottom <= sal.target_max) {
      salaryScore = 0.85;
      reasons.push({ kind: "plus", text: "Gaji beririsan dengan target kamu" });
      explanations.push(
        `Rentang ${fmt(bottom)} – ${fmt(top)} sebagian beririsan dengan target ${fmt(sal.target_min)} – ${fmt(sal.target_max)}.`,
      );
    } else if (bottom >= sal.target_max && bottom <= sal.stretch_max) {
      salaryScore = 0.9;
      reasons.push({ kind: "plus", text: "Gaji di atas target kamu" });
      explanations.push(
        `Rentang ${fmt(bottom)} – ${fmt(top)} di atas target — bagus, meski mungkin butuh pengalaman lebih.`,
      );
    } else if (bottom > sal.stretch_max) {
      salaryScore = 0.75;
      reasons.push({ kind: "info", text: "Gaji jauh di atas target (level mungkin lebih tinggi)" });
      explanations.push(
        `Rentang ${fmt(bottom)} – ${fmt(top)} jauh di atas target. Sering berarti levelnya lebih senior dari profil kamu.`,
      );
    } else if (bottom >= sal.hard_min) {
      // Di bawah target tapi masih di atas batas keras.
      const ratio = (bottom - sal.hard_min) / Math.max(1, sal.target_min - sal.hard_min);
      salaryScore = 0.35 + clamp(ratio, 0, 1) * 0.25;
      reasons.push({ kind: "minus", text: "Gaji di bawah target kamu" });
      explanations.push(
        `Rentang ${fmt(bottom)} – ${fmt(top)} di bawah target ${fmt(sal.target_min)} – ${fmt(sal.target_max)}, tapi masih di atas batas minimum ${fmt(sal.hard_min)}. Masih bisa dinegosiasi.`,
      );
    } else {
      salaryScore = 0.05;
      reasons.push({ kind: "minus", text: "Gaji di bawah batas minimum kamu" });
      explanations.push(
        `Rentang ${fmt(bottom)} – ${fmt(top)} di bawah batas minimum ${fmt(sal.hard_min)} — hampir pasti tidak layak dilanjutkan.`,
      );
    }
  }

  const score =
    SUB_WEIGHTS.location * locationScore +
    SUB_WEIGHTS.salary * salaryScore +
    SUB_WEIGHTS.workMode * workModeScore;

  // Kalau tidak ada satu pun sinyal praktis yang bisa dibaca, tandai
  // komponen ini "tidak dinilai" supaya bobotnya dialihkan ke komponen
  // lain — bukan dihukum seolah-olah nilainya buruk.
  const assessed =
    detectedLocs.length > 0 || salaryMin !== null || workMode !== "unknown";

  explanations.push(
    `Rumus: 0.45×lokasi (${(locationScore * 100).toFixed(0)}%) + 0.40×gaji (${(salaryScore * 100).toFixed(0)}%) + 0.15×mode kerja (${(workModeScore * 100).toFixed(0)}%) = ${(score * 100).toFixed(0)}%.`,
  );

  return {
    score: clamp(score, 0, 1),
    assessed,
    locationScore,
    salaryScore,
    workModeScore,
    salaryMin,
    salaryMax,
    workMode,
    locationTier,
    reasons,
    explanations,
    detail: {
      location_detected: detectedLocs.join(", ") || "(tidak dikenali)",
      location_tier: locationTier,
      location_score: locationScore,
      work_mode: workMode,
      work_mode_score: workModeScore,
      salary_min: salaryMin,
      salary_max: salaryMax,
      salary_score: salaryScore,
      salary_raw_text: job.salaryText,
      salary_normalized: wasNormalized ? "ya (dikonversi ke bulanan)" : "tidak",
    },
  };
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)} jt`;
  return `Rp ${n.toLocaleString("id-ID")}`;
}
