/**
 * Pencocokan skill berbasis bobot (weighted), bukan cuma ada/tidak.
 *
 * Ide dasarnya:
 *  - Skill kamu punya "tier" (core/strong/working/familiar) -> bobot kepentingan.
 *  - Skill yang diminta lowongan punya "demand" -> seberapa wajib, tergantung
 *    apakah muncul di seksi Requirement (wajib) atau Nice-to-have (opsional),
 *    dan seberapa sering disebut.
 *  - Skor = (jumlah bobot skill yang match) / (total bobot yang diminta),
 *    dengan penalti kalau banyak skill WAJIB yang tidak kamu punya.
 */

import {
  ALIAS_TO_CANONICAL,
  AMBIGUOUS_ALIASES,
  skillLabel,
} from "../skills-dictionary";
import { findRanges, normalize, sectionWeight, splitSections } from "../text";
import type { CandidateProfile, SkillTier } from "../types";

/**
 * Bobot tier.
 *
 * Rentangnya sengaja tidak terlalu ekstrem: yang pertama dicek hiring
 * manager adalah APAKAH skill itu ada, bukan seberapa dalam. Kalau semua
 * skill yang diminta sudah kamu punya, skor harus tinggi walaupun sebagian
 * cuma level "working". Tier berfungsi sebagai pengali halus, bukan
 * penghalang keras.
 */
export const TIER_WEIGHT: Record<SkillTier, number> = {
  core: 1.0,
  strong: 0.85,
  working: 0.7,
  familiar: 0.5,
};

export const TIER_LABEL: Record<SkillTier, string> = {
  core: "Core",
  strong: "Strong",
  working: "Working",
  familiar: "Familiar",
};

export interface SkillDemand {
  canonical: string;
  label: string;
  /** 0..1 seberapa wajib skill ini di lowongan tsb. */
  demand: number;
  /** Bobot kamu punya skill ini (0 kalau tidak punya). */
  myWeight: number;
  mentions: number;
  required: boolean;
}

export interface SkillMatchResult {
  score: number; // 0..1
  /** false kalau deskripsi tidak menyebut skill apa pun yang dikenali. */
  assessed: boolean;
  matched: SkillDemand[];
  missing: SkillDemand[];
  /** Semua skill yang terdeteksi diminta lowongan, urut demand desc. */
  demanded: SkillDemand[];
  coverage: number; // matched weight / total demanded weight
  requiredCoverage: number; // hanya yang wajib
  reasons: string[];
  explanations: string[];
}

/** Bangun peta bobot skill milik kandidat. */
export function buildMySkillMap(
  profile: CandidateProfile,
): Map<string, { tier: SkillTier; weight: number }> {
  const map = new Map<string, { tier: SkillTier; weight: number }>();
  const skills = profile.candidate.skills ?? ({} as CandidateProfile["candidate"]["skills"]);
  for (const tier of ["core", "strong", "working", "familiar"] as SkillTier[]) {
    for (const raw of skills[tier] ?? []) {
      const canonical = ALIAS_TO_CANONICAL.get(String(raw).toLowerCase().trim());
      if (!canonical) continue;
      // Tier tertinggi menang kalau duplikat.
      const existing = map.get(canonical);
      if (!existing || TIER_WEIGHT[tier] > existing.weight) {
        map.set(canonical, { tier, weight: TIER_WEIGHT[tier] });
      }
    }
  }
  return map;
}

/**
 * Deteksi skill yang diminta oleh sebuah deskripsi lowongan.
 * Mengembalikan demand 0..1 per skill kanonik.
 */
export function detectDemand(description: string): Map<string, SkillDemand> {
  const out = new Map<string, SkillDemand>();
  const text = normalize(description);
  if (!text) return out;

  const sections = splitSections(description);
  // Kalau tidak ada seksi yang jelas, seluruh teks dianggap seksi tunggal.
  const effective = sections.length ? sections : [{ heading: "", body: text }];

  // Kumpulkan semua alias yang perlu dicari sekaligus (hindari scan berulang).
  const aliasEntries: { alias: string; canonical: string }[] = [];
  for (const [alias, canonical] of ALIAS_TO_CANONICAL.entries()) {
    aliasEntries.push({ alias, canonical });
  }
  // Cari alias panjang dulu agar "react native" menang atas "react".
  aliasEntries.sort((a, b) => b.alias.length - a.alias.length);

  const allRanges: { start: number; end: number }[] = [];

  for (const section of effective) {
    const weight = sectionWeight(section);
    const body = normalize(section.body);
    if (!body.trim()) continue;

    for (const { alias, canonical } of aliasEntries) {
      if (AMBIGUOUS_ALIASES.has(alias) && alias.length <= 2) continue;
      const ranges = findRanges(body, alias);
      if (!ranges.length) continue;

      const existing = out.get(canonical);
      const mentions = ranges.length;
      // Demand dari seksi ini: base tergantung wajib/opsional,
      // ditambah sedikit kalau disebut berkali-kali (cap).
      const freqBonus = Math.min(mentions - 1, 2) * 0.08;
      const thisDemand = Math.min(1, weight * (0.75 + freqBonus));
      const required = weight >= 0.95;

      if (!existing) {
        out.set(canonical, {
          canonical,
          label: skillLabel(canonical),
          demand: thisDemand,
          myWeight: 0,
          mentions,
          required,
        });
      } else {
        existing.mentions += mentions;
        existing.demand = Math.max(existing.demand, thisDemand);
        existing.required = existing.required || required;
      }
      allRanges.push(...ranges);
    }
  }

  return out;
}

export interface SkillsScore {
  /** 0..1 */
  ratio: number;
  result: SkillMatchResult;
}

/**
 * Hitung skor skills overlap.
 *
 * Rumus:
 *   coverage        = Σ(myWeight × demand) / Σ(demand)      untuk semua skill diminta
 *   requiredCoverage= coverage khusus skill yang wajib
 *   final           = 0.55×coverage + 0.45×requiredCoverage
 *
 * Memakai requiredCoverage sebagai porsi besar supaya lowongan yang minta
 * 5 skill wajib dan kamu cuma punya 2 tidak bisa dapat skor tinggi hanya
 * karena kamu punya banyak skill "nice to have".
 */
export function scoreSkills(
  description: string,
  title: string,
  profile: CandidateProfile,
): SkillsScore {
  const mySkills = buildMySkillMap(profile);
  // Judul ikut dihitung: "React Developer" di judul itu sinyal kuat.
  const demanded = detectDemand(`${title}\n${description}`);

  const explanations: string[] = [];
  const reasons: string[] = [];

  if (demanded.size === 0) {
    return {
      ratio: 0.5, // tidak ada sinyal -> netral, dan ditandai belum dinilai
      result: {
        score: 0.5,
        assessed: false,
        matched: [],
        missing: [],
        demanded: [],
        coverage: 0.5,
        requiredCoverage: 0.5,
        reasons: ["Tidak ada skill spesifik yang terdeteksi di lowongan ini"],
        explanations: ["Skor skill netral (0.5) karena deskripsi tidak menyebut skill teknis yang dikenali."],
      },
    };
  }

  const list: SkillDemand[] = [];
  for (const d of demanded.values()) {
    const mine = mySkills.get(d.canonical);
    list.push({ ...d, myWeight: mine?.weight ?? 0 });
  }
  list.sort((a, b) => b.demand * (b.required ? 1.5 : 1) - a.demand * (a.required ? 1.5 : 1));

  const totalDemand = list.reduce((s, d) => s + d.demand, 0) || 1;
  const matchedWeight = list.reduce((s, d) => s + d.demand * d.myWeight, 0);
  const coverage = matchedWeight / totalDemand;

  const requiredList = list.filter((d) => d.required);
  const reqTotal = requiredList.reduce((s, d) => s + d.demand, 0);
  const reqMatched = requiredList.reduce((s, d) => s + d.demand * d.myWeight, 0);
  const requiredCoverage = reqTotal > 0 ? reqMatched / reqTotal : coverage;

  const matched = list.filter((d) => d.myWeight > 0);
  const missing = list.filter((d) => d.myWeight === 0);

  let ratio = 0.55 * coverage + 0.45 * requiredCoverage;

  // Bonus kelengkapan: kalau SEMUA skill wajib terpenuhi, itu sinyal kuat
  // bahwa lowongan ini memang ditujukan untuk profil seperti kamu.
  if (requiredList.length && requiredCoverage >= 0.999) {
    ratio = Math.min(1, ratio + 0.06);
    reasons.push("Semua skill wajib di lowongan ini sudah kamu kuasai");
  }

  // Penalti keras: kalau tidak ada satu pun skill core kamu yang diminta,
  // kemungkinan besar ini bukan lowongan untuk kamu.
  const coreMatched = matched.filter((d) => d.myWeight >= TIER_WEIGHT.core);
  if (coreMatched.length === 0) {
    ratio *= 0.6;
    reasons.push("Tidak ada skill utama kamu yang diminta di lowongan ini");
  }

  ratio = Math.max(0, Math.min(1, ratio));

  // ---- Penjelasan manusiawi ----
  if (coreMatched.length) {
    reasons.push(
      `Skill utama cocok: ${coreMatched.slice(0, 6).map((d) => d.label).join(", ")}`,
    );
  }
  const strongMatched = matched.filter(
    (d) => d.myWeight > 0 && d.myWeight < TIER_WEIGHT.core,
  );
  if (strongMatched.length) {
    reasons.push(
      `Skill pendukung cocok: ${strongMatched.slice(0, 6).map((d) => d.label).join(", ")}`,
    );
  }
  const missingRequired = missing.filter((d) => d.required);
  if (missingRequired.length) {
    reasons.push(
      `Skill wajib belum dikuasai: ${missingRequired.slice(0, 6).map((d) => d.label).join(", ")}`,
    );
  }
  const missingOptional = missing.filter((d) => !d.required);
  if (missingOptional.length) {
    reasons.push(
      `Nice-to-have yang belum ada: ${missingOptional.slice(0, 5).map((d) => d.label).join(", ")}`,
    );
  }

  explanations.push(
    `Cakupan keseluruhan ${(coverage * 100).toFixed(0)}% dari ${list.length} skill yang disebut.`,
  );
  if (requiredList.length) {
    explanations.push(
      `Cakupan skill wajib ${(requiredCoverage * 100).toFixed(0)}% (${requiredList.filter((d) => d.myWeight > 0).length}/${requiredList.length} terpenuhi).`,
    );
  } else {
    explanations.push(
      "Deskripsi tidak memisahkan skill wajib vs nice-to-have, jadi bobotnya disamakan.",
    );
  }
  explanations.push(
    `Rumus: 0.55 × cakupan (${(coverage * 100).toFixed(0)}%) + 0.45 × cakupan wajib (${(requiredCoverage * 100).toFixed(0)}%) = ${(ratio * 100).toFixed(0)}%.`,
  );

  return {
    ratio,
    result: {
      score: ratio,
      assessed: true,
      matched: matched.sort((a, b) => b.demand * b.myWeight - a.demand * a.myWeight),
      missing: missing.sort((a, b) => b.demand - a.demand),
      demanded: list,
      coverage,
      requiredCoverage,
      reasons,
      explanations,
    },
  };
}
