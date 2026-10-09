/**
 * Orkestrator penilaian.
 *
 * Menggabungkan 4 komponen dengan bobot dari profile.yaml:
 *   skills    40
 *   seniority 25
 *   domain    20
 *   practical 15
 *                    ---
 *                   100
 */

import { normalize, round1 } from "../text";
import { detectLevelFromTitle, scoreSeniority } from "./seniority";
import { scoreDomain } from "./domain";
import { scorePractical } from "./practical";
import { scoreSkills } from "./skills";
import type {
  CandidateProfile,
  ComponentScore,
  RawJob,
  ScoredJob,
  Verdict,
} from "../types";

export interface RoleMatch {
  family: string | null;
  label: string | null;
  score: number;
  matchedKeyword: string | null;
}

/**
 * Cocokkan judul dengan role_families. Skor 0..1:
 *   keyword persis di judul -> 1.0
 *   sebagian kata cocok      -> 0.6
 */
export function matchRole(title: string, profile: CandidateProfile): RoleMatch {
  const t = normalize(title);
  const families = profile.candidate.role_families ?? {};
  let best: RoleMatch = { family: null, label: null, score: 0, matchedKeyword: null };

  for (const [family, def] of Object.entries(families)) {
    for (const kw of def.keywords) {
      const k = kw.toLowerCase().trim();
      if (!k) continue;
      if (t.includes(k)) {
        // Keyword lebih panjang = sinyal lebih kuat.
        const score = Math.min(1, 0.7 + k.length / 60);
        if (score > best.score) {
          best = { family, label: def.label, score, matchedKeyword: kw };
        }
      } else {
        // Cek overlap kata (mis. "frontend engineer" vs "front end developer").
        const titleWords = new Set(t.split(/[^a-z0-9+#.]+/).filter((w) => w.length > 2));
        const kwWords = k.split(/[^a-z0-9+#.]+/).filter((w) => w.length > 2);
        if (kwWords.length && kwWords.every((w) => titleWords.has(w))) {
          const score = 0.6;
          if (score > best.score) {
            best = { family, label: def.label, score, matchedKeyword: kw };
          }
        }
      }
    }
  }
  return best;
}

function verdictFor(total: number, threshold: number): Verdict {
  if (total >= 88) return "strong";
  if (total >= threshold + 8) return "good";
  if (total >= threshold) return "borderline";
  return "weak";
}

/**
 * Redistribusi bobot.
 *
 * Masalah yang diselesaikan: JobStreet/LinkedIn sering TIDAK mencantumkan
 * gaji, dan banyak lowongan tidak menyebut industri secara eksplisit.
 * Kalau komponen tanpa data langsung diberi nilai 0.5 × bobot, kandidat
 * kehilangan ~15 poin bukan karena lowongannya buruk, tapi karena datanya
 * tidak ada. Itu menghukum kesalahan pihak lain.
 *
 * Solusinya: komponen yang tidak punya bukti ditandai `assessed: false`,
 * bobotnya dikembalikan ke pool lalu dibagi proporsional ke komponen yang
 * datanya tersedia. Total tetap 100.
 */
export function redistributeWeights(
  components: ComponentScore[],
): ComponentScore[] {
  const assessed = components.filter((c) => c.assessed);
  // Kalau tidak ada satu pun yang bisa dinilai, biarkan apa adanya.
  if (!assessed.length) return components;

  const assessedNominal = assessed.reduce((s, c) => s + c.nominalMax, 0);
  const scale = 100 / assessedNominal;

  return components.map((c) => {
    if (!c.assessed) return { ...c, max: 0, score: 0 };
    const max = Math.round(c.nominalMax * scale * 10) / 10;
    return { ...c, max, score: round1(c.score * scale) };
  });
}

export function scoreJob(job: RawJob, profile: CandidateProfile): ScoredJob {
  const weights = profile.scoring.weights;
  const threshold = profile.scoring.threshold;

  const role = matchRole(job.title, profile);

  // ---- Komponen 1: Skills (40) ----
  const skillsRes = scoreSkills(job.description, job.title, profile);
  const skillsComponent: ComponentScore = {
    key: "skills",
    label: "Skills Overlap",
    score: round1(skillsRes.ratio * weights.skills),
    max: weights.skills,
    nominalMax: weights.skills,
    assessed: skillsRes.result.assessed,
    reasons: skillsRes.result.reasons.map((t) => ({
      kind: "info" as const,
      text: t,
    })),
    detail: {
      ratio: round1(skillsRes.ratio * 100) / 100,
      coverage: round1(skillsRes.result.coverage * 100) / 100,
      required_coverage: round1(skillsRes.result.requiredCoverage * 100) / 100,
      matched: skillsRes.result.matched.map((d) => d.label),
      missing: skillsRes.result.missing.map((d) => d.label),
      missing_required: skillsRes.result.missing.filter((d) => d.required).map((d) => d.label),
      explanation: skillsRes.result.explanations,
    },
  };

  // ---- Komponen 2: Seniority (25) ----
  const senRes = scoreSeniority(job.title, job.description, profile, role.family);
  const seniorityComponent: ComponentScore = {
    key: "seniority",
    label: "Seniority Fit",
    score: round1(senRes.score * weights.seniority),
    max: weights.seniority,
    nominalMax: weights.seniority,
    assessed: true,
    reasons: senRes.reasons,
    detail: {
      ...senRes.detail,
      explanation: senRes.explanations,
    },
  };

  // ---- Komponen 3: Domain (20) ----
  const domRes = scoreDomain(job.company, job.title, job.description, profile);
  const domainComponent: ComponentScore = {
    key: "domain",
    label: "Domain Fit",
    score: round1(domRes.score * weights.domain),
    max: weights.domain,
    nominalMax: weights.domain,
    assessed: domRes.assessed,
    reasons: domRes.reasons,
    detail: {
      ...domRes.detail,
      explanation: domRes.explanations,
    },
  };

  // ---- Komponen 4: Practical (15) ----
  const pracRes = scorePractical(
    {
      location: job.location,
      salaryText: job.salaryText,
      description: job.description,
      title: job.title,
      workMode: job.workMode,
    },
    profile,
  );
  const practicalComponent: ComponentScore = {
    key: "practical",
    label: "Practical Fit",
    score: round1(pracRes.score * weights.practical),
    max: weights.practical,
    nominalMax: weights.practical,
    assessed: pracRes.assessed,
    reasons: pracRes.reasons,
    detail: {
      ...pracRes.detail,
      explanation: pracRes.explanations,
    },
  };

  const components = redistributeWeights([
    skillsComponent,
    seniorityComponent,
    domainComponent,
    practicalComponent,
  ]);

  const total = round1(components.reduce((s, c) => s + c.score, 0));

  const passed = total >= threshold;

  return {
    job,
    total,
    passed,
    verdict: verdictFor(total, threshold),
    roleFamily: role.family,
    roleLabel: role.label,
    matchedSkills: (skillsComponent.detail.matched as string[]) ?? [],
    missingSkills: (skillsComponent.detail.missing as string[]) ?? [],
    components,
  };
}

/** Info ringkas untuk debugging: kenapa lowongan ini dibuang. */
export function explainRejection(job: RawJob, profile: CandidateProfile): string {
  const role = matchRole(job.title, profile);
  if (profile.crawl.require_role_match && !role.family) {
    return `judul "${job.title}" tidak cocok dengan role_families manapun`;
  }
  const scored = scoreJob(job, profile);
  return `skor ${scored.total} < ambang ${profile.scoring.threshold}`;
}

export { detectLevelFromTitle };
