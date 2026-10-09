import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type { CandidateProfile } from "./types";

let cached: CandidateProfile | null = null;

export const PROFILE_PATH = path.join(process.cwd(), "profile.yaml");

export async function loadProfile(force = false): Promise<CandidateProfile> {
  if (cached && !force) return cached;
  const raw = await readFile(PROFILE_PATH, "utf8");
  const parsed = parseYaml(raw) as CandidateProfile;
  validateProfile(parsed);
  cached = parsed;
  return parsed;
}

export function loadProfileSync(raw: string): CandidateProfile {
  const parsed = parseYaml(raw) as CandidateProfile;
  validateProfile(parsed);
  return parsed;
}

export function clearProfileCache(): void {
  cached = null;
}

function validateProfile(p: CandidateProfile): void {
  const problems: string[] = [];

  if (!p?.candidate) problems.push("bagian `candidate` tidak ditemukan");
  if (!p?.scoring?.weights) problems.push("bagian `scoring.weights` tidak ditemukan");
  if (!p?.crawl) problems.push("bagian `crawl` tidak ditemukan");

  if (p?.scoring?.weights) {
    const w = p.scoring.weights;
    const total = w.skills + w.seniority + w.domain + w.practical;
    if (total !== 100) {
      problems.push(`total bobot harus 100, sekarang ${total}`);
    }
  }

  if (p?.candidate?.skills) {
    const known = ["core", "strong", "working", "familiar"];
    for (const tier of known) {
      if (!Array.isArray(p.candidate.skills[tier as "core"])) {
        problems.push(`candidate.skills.${tier} harus berupa daftar`);
      }
    }
  }

  if (problems.length) {
    throw new Error(
      `profile.yaml tidak valid:\n  - ${problems.join("\n  - ")}\n\nPerbaiki file profile.yaml lalu coba lagi.`,
    );
  }
}
