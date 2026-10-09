/**
 * Seniority Fit (25 poin)
 *
 * Tujuan: menjauhkan kamu dari lowongan yang akan menolak kamu di baris
 * pertama ("min. 8 tahun pengalaman", "Lead Engineer", "Head of ...").
 *
 * Tiga sinyal yang dipakai:
 *  1. Level dari JUDUL  (Lead, Senior, Junior, Intern, Manager, ...)
 *  2. Tahun pengalaman yang DIMINTA di deskripsi ("min 5 years", "3+ tahun")
 *  3. Sinyal tanggung jawab (memimpin tim, mentoring, hiring, budget)
 */

import { clamp, normalize, parseMoney } from "../text";
import type { CandidateProfile, ScoreReason, SeniorityLevel } from "../types";

export interface SeniorityResult {
  score: number; // 0..1
  level: SeniorityLevel;
  requiredYears: number | null;
  reasons: ScoreReason[];
  explanations: string[];
  detail: Record<string, number | string | null>;
}

const TITLE_LEVEL_RULES: { level: SeniorityLevel; re: RegExp; weight: number }[] = [
  { level: "intern", re: /\b(intern|internship|magang|trainee|apprentice)\b/i, weight: 1 },
  { level: "junior", re: /\b(junior|jr\.?|entry[\s-]?level|fresh[\s-]?graduate|freshgrad|graduate program)\b/i, weight: 1 },
  { level: "manager", re: /\b(manager|kepala|head of|kadiv|chief|director|vp|vice president)\b/i, weight: 1 },
  { level: "lead", re: /\b(lead|leader|principal|staff engineer|architect|team lead|tech lead|engineering lead)\b/i, weight: 1 },
  { level: "senior", re: /\b(senior|sr\.?|expert|specialist iii|level 3|l3)\b/i, weight: 1 },
  { level: "mid", re: /\b(mid[\s-]?level|intermediate|associate)\b/i, weight: 0.8 },
];

/** Level default dari nama role family, kalau judul tidak menyebut level. */
const FAMILY_DEFAULT: Record<string, SeniorityLevel> = {
  architect: "lead",
  analyst: "mid",
};

export function detectLevelFromTitle(title: string): {
  level: SeniorityLevel;
  matched: string | null;
} {
  const t = normalize(title);
  for (const rule of TITLE_LEVEL_RULES) {
    const m = t.match(rule.re);
    if (m) return { level: rule.level, matched: m[0] };
  }
  return { level: "unknown", matched: null };
}

/**
 * Cari permintaan tahun pengalaman. Menangani format:
 *  "min 5 years", "5+ years", "minimum 3 tahun", "3-5 years experience",
 *  "at least 4 years", "2 s/d 4 tahun"
 */
export function detectRequiredYears(description: string): number | null {
  // `work` dipakai sebagai teks yang bisa "dilubangi": setelah sebuah pola
  // cocok, teks itu dikosongkan supaya pola berikutnya tidak mencocokkan
  // bagian yang sama. Tanpa ini, "2-4 years" akan ikut terbaca sebagai
  // "4 years experience" oleh pola lain dan syaratnya jadi 4, bukan 2.
  let work = normalize(description).replace(/\u00a0/g, " ");
  const unit = "(?:years?|yrs?|tahun|thn|th)";
  const found: number[] = [];

  const blank = (start: number, end: number) => {
    work = work.slice(0, start) + " ".repeat(end - start) + work.slice(end);
  };

  const scan = (re: RegExp, pick: (nums: number[]) => number | null) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(work)) !== null) {
      const nums = m
        .slice(1)
        .filter(Boolean)
        .map((v) => Number(v))
        .filter((n) => Number.isFinite(n) && n >= 0 && n <= 30);
      if (nums.length) {
        const v = pick(nums);
        if (v !== null) found.push(v);
      }
      blank(m.index, m.index + m[0].length);
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  };

  // Prioritas 1: rentang "2-4 years" -> ambil angka terendah (syarat minimum).
  scan(new RegExp(`(\\d{1,2})\\s*(?:-|\u2013|s/d|s\\.d|to|sampai)\\s*(\\d{1,2})\\s*${unit}`, "gi"), (n) => Math.min(...n));

  // Prioritas 2: batas bawah eksplisit "min 5 years", "at least 4 years".
  scan(new RegExp(`(?:min(?:imum)?|at least|paling sedikit|minimal|sekurang)\\D{0,15}(\\d{1,2})\\s*\\+?\\s*${unit}`, "gi"), (n) => n[0]);

  // Prioritas 3: "5+ years"
  scan(new RegExp(`(\\d{1,2})\\s*\\+\\s*${unit}`, "gi"), (n) => n[0]);

  // Prioritas 4: "5 years of experience" / "5 tahun pengalaman"
  scan(new RegExp(`(\\d{1,2})\\s*${unit}\\s*(?:of\\s+)?(?:experience|pengalaman|kerja|working)`, "gi"), (n) => n[0]);

  // Prioritas 5: "experience: 5 years"
  scan(new RegExp(`(?:experience|pengalaman|pengalaman kerja)\\D{0,15}(\\d{1,2})\\s*${unit}`, "gi"), (n) => n[0]);

  // Kalau ada beberapa syarat, pakai yang paling ketat.
  return found.length ? Math.max(...found) : null;
}

const LEADERSHIP_SIGNALS =
  /\b(lead (?:a|the) team|manage (?:a|the) team|mentor(?:ing)?|coach(?:ing)?|hire|hiring|recruit|performance review|budget|roadmap|stakeholder|p&l|strategic|people management|supervise|supervising|memimpin tim|membawahi)\b/i;

export function scoreSeniority(
  title: string,
  description: string,
  profile: CandidateProfile,
  roleFamily: string | null,
): SeniorityResult {
  const cfg = profile.candidate.seniority;
  const levelScores = cfg.level_scores ?? {};
  const myYears = profile.candidate.years_experience ?? 0;

  const { level: titleLevel, matched: titleMatch } = detectLevelFromTitle(title);
  let level: SeniorityLevel = titleLevel;
  if (level === "unknown" && roleFamily && FAMILY_DEFAULT[roleFamily]) {
    level = FAMILY_DEFAULT[roleFamily];
  }

  const requiredYears = detectRequiredYears(description);

  const reasons: ScoreReason[] = [];
  const explanations: string[] = [];
  const levelKey = level === "unknown" ? "unknown" : level;
  let score = levelScores[levelKey] ?? 0.6;

  if (level === "unknown") {
    explanations.push(
      "Judul lowongan tidak menyebut level senioritas secara eksplisit, jadi dinilai netral.",
    );
  } else {
    const isTarget = cfg.target.includes(level);
    const isAcceptable = cfg.acceptable.includes(level);
    if (isTarget) {
      reasons.push({ kind: "plus", text: `Level ${level} sesuai target kamu` });
      explanations.push(`Level terdeteksi "${level}" — ini level yang kamu incar.`);
    } else if (isAcceptable) {
      reasons.push({ kind: "info", text: `Level ${level} masih bisa diterima` });
      explanations.push(`Level "${level}" bukan target utama tapi masih dalam batas wajar.`);
    } else {
      reasons.push({ kind: "minus", text: `Level ${level} di luar target kamu` });
      explanations.push(`Level "${level}" biasanya butuh pengalaman yang berbeda dari profil kamu.`);
    }
    if (titleMatch) {
      explanations.push(`Kata kunci level yang terdeteksi di judul: "${titleMatch}".`);
    }
  }

  // ---- Sinyal tahun pengalaman ----
  let yearsPenalty = 1;
  if (requiredYears !== null) {
    const gap = requiredYears - myYears;
    if (gap <= 0) {
      reasons.push({
        kind: "plus",
        text: `Minta ${requiredYears} thn, kamu punya ${myYears} thn`,
      });
      explanations.push(
        `Pengalaman kamu (${myYears} thn) memenuhi syarat minimum ${requiredYears} thn.`,
      );
    } else if (gap <= 1) {
      yearsPenalty = 0.85;
      reasons.push({
        kind: "info",
        text: `Minta ${requiredYears} thn, kamu ${myYears} thn (kurang ${gap} thn)`,
      });
      explanations.push(
        `Kurang ${gap} tahun dari syarat, tapi biasanya masih bisa dilamar dengan portofolio kuat.`,
      );
    } else if (gap <= 3) {
      yearsPenalty = 0.55;
      reasons.push({
        kind: "minus",
        text: `Minta ${requiredYears} thn, kamu ${myYears} thn (kurang ${gap} thn)`,
      });
      explanations.push(
        `Selisih ${gap} tahun cukup terasa — kemungkinan tersaring di screening otomatis.`,
      );
    } else {
      yearsPenalty = 0.25;
      reasons.push({
        kind: "minus",
        text: `Minta ${requiredYears} thn, kamu ${myYears} thn (kurang ${gap} thn)`,
      });
      explanations.push(
        `Selisih ${gap} tahun terlalu jauh — peluang lolos screening kecil.`,
      );
    }
  } else {
    explanations.push("Lowongan tidak menyebut syarat tahun pengalaman secara spesifik.");
  }

  // ---- Sinyal tanggung jawab kepemimpinan ----
  let leadPenalty = 1;
  const wantsLeadership = LEADERSHIP_SIGNALS.test(description);
  const myLevelIsSenior = profile.candidate.current_level === "senior" || profile.candidate.current_level === "lead";
  if (wantsLeadership && !myLevelIsSenior) {
    leadPenalty = 0.7;
    reasons.push({
      kind: "minus",
      text: "Lowongan menuntut kepemimpinan tim",
    });
    explanations.push(
      "Deskripsi menyebut tanggung jawab memimpin/mentoring tim, sementara level kamu belum senior/lead.",
    );
  } else if (wantsLeadership) {
    explanations.push("Ada tanggung jawab kepemimpinan, tapi level kamu mendukung.");
  }

  score = clamp(score * yearsPenalty * leadPenalty, 0, 1);

  return {
    score,
    level,
    requiredYears,
    reasons,
    explanations,
    detail: {
      detected_level: level,
      title_keyword: titleMatch,
      required_years: requiredYears,
      my_years: myYears,
      years_penalty: yearsPenalty,
      leadership_expected: wantsLeadership ? "ya" : "tidak",
      leadership_penalty: leadPenalty,
    },
  };
}

/** Ekspor kecil untuk dipakai di tempat lain (mis. deteksi gaji). */
export { parseMoney };
