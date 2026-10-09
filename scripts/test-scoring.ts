#!/usr/bin/env bun
/**
 * Uji cepat mesin penilaian dengan data contoh.
 * Jalankan: bun run scripts/test-scoring.ts
 */

import { readFileSync } from "node:fs";
import { loadProfileSync } from "../lib/profile";
import { scoreJob, matchRole } from "../lib/scoring";
import { scoreSkills } from "../lib/scoring/skills";
import { detectRequiredYears, detectLevelFromTitle } from "../lib/scoring/seniority";
import { detectDomains, scoreDomain } from "../lib/scoring/domain";
import { extractSalary, detectLocations, detectWorkMode, scorePractical } from "../lib/scoring/practical";
import { parseMoney } from "../lib/text";
import type { RawJob } from "../lib/types";

const profile = loadProfileSync(readFileSync("profile.yaml", "utf8"));

let pass = 0;
let fail = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}\n         dapat: ${a}\n         harap: ${e}`);
  }
}

function approx(name: string, actual: number, min: number, max: number) {
  if (actual >= min && actual <= max) {
    pass++;
    console.log(`  ok   ${name} = ${actual}`);
  } else {
    fail++;
    console.log(`  FAIL ${name} = ${actual} (harap antara ${min} dan ${max})`);
  }
}

console.log("\n=== 1. Parse gaji ===");
check("10.000.000", parseMoney("Rp 10.000.000 per bulan"), 10000000);
check("10jt", parseMoney("gaji 10jt"), 10000000);
check("10 juta", parseMoney("sekitar 10 juta rupiah"), 10000000);
check("range 9-13jt -> min", parseMoney("Rp 9.000.000 - 13.000.000"), 9000000);
check("kosong", parseMoney(""), null);

console.log("\n=== 2. Ekstraksi rentang gaji ===");
check(
  "salaryLabel JobStreet",
  extractSalary("Rp 15,000,000 – Rp 22,000,000 per month"),
  { min: 15000000, max: 22000000 },
);
check(
  "salaryLabel kecil",
  extractSalary("Rp 8,000,000 – Rp 12,000,000 per month"),
  { min: 8000000, max: 12000000 },
);

console.log("\n=== 3. Deteksi tahun pengalaman ===");
check("min 5 years", detectRequiredYears("Minimum 5 years of experience"), 5);
check("3+ tahun", detectRequiredYears("Pengalaman 3+ tahun di bidang web"), 3);
check("2-4 years", detectRequiredYears("2-4 years experience in React"), 2);
check("at least 4 years", detectRequiredYears("at least 4 years of professional experience"), 4);
check("tidak disebut", detectRequiredYears("Bergabunglah dengan tim kami"), null);

console.log("\n=== 4. Deteksi level dari judul ===");
check("Senior Fullstack", detectLevelFromTitle("Senior Fullstack Developer").level, "senior");
check("Junior Dev", detectLevelFromTitle("Junior Frontend Developer").level, "junior");
check("Intern", detectLevelFromTitle("Software Engineer Intern").level, "intern");
check("Lead", detectLevelFromTitle("Lead Backend Engineer").level, "lead");
check("polos", detectLevelFromTitle("Backend Developer").level, "unknown");

console.log("\n=== 5. Deteksi domain ===");
const d1 = detectDomains("We are a fintech company building payment solutions");
check("fintech + payments", [...d1.keys()].sort(), ["fintech", "payments"]);
const d2 = detectDomains("Rumah sakit dan klinik kesehatan di Jakarta");
check("healthtech", [...d2.keys()], ["healthtech"]);

console.log("\n=== 6. Deteksi lokasi & mode kerja ===");
check("jaksel", detectLocations("Jakarta Selatan, Indonesia"), ["jakarta selatan"]);
check("jaktim", detectLocations("Tanjung Priok, Jakarta, Indonesia"), ["jakarta timur"]);
check("depok", detectLocations("Depok"), ["depok"]);
check("bogor", detectLocations("Cibinong, Bogor"), ["bogor"]);
check("hybrid menang atas remote", detectWorkMode("Hybrid - 2 days WFO, 3 days WFH"), "hybrid");
check("remote", detectWorkMode("Fully remote position"), "remote");
check("onsite", detectWorkMode("WFO, kerja di kantor Jakarta"), "onsite");

console.log("\n=== 7. Match role ===");
check("Fullstack Developer", matchRole("Fullstack Developer", profile).family, "fullstack");
check("React Developer -> frontend", matchRole("React Developer", profile).family, "frontend");
check("React Native Dev -> mobile", matchRole("React Native Developer", profile).family, "mobile");
check("Backend Engineer -> backend", matchRole("Backend Engineer", profile).family, "backend");
check("System Analyst", matchRole("System Analyst", profile).family, "analyst");
check("Solution Architect -> architect", matchRole("Solution Architect", profile).family, "architect");
check("Sales Manager -> null", matchRole("Sales Manager", profile).family, null);

console.log("\n=== 8. Skill scoring: lowongan cocok ===");
const goodDesc = `
Requirements:
- Minimum 3 years of experience as a Fullstack Developer
- Strong proficiency in React, Next.js, and TypeScript
- Experience with Node.js and Express for backend development
- Familiar with PostgreSQL and Redis
- Understanding of REST API design
Nice to have:
- Experience with Docker and Kubernetes
- Knowledge of GraphQL
`;
const goodSkills = scoreSkills(goodDesc, "Fullstack Developer", profile);
approx("skor skill cocok tinggi", goodSkills.ratio, 0.8, 1.0);

console.log("\n=== 9. Skill scoring: lowongan tidak cocok ===");
const badDesc = `
Requirements:
- 5 years experience with SAP ABAP and Oracle PL/SQL
- Strong knowledge of COBOL and mainframe systems
- Experience with Salesforce Apex
`;
const badSkills = scoreSkills(badDesc, "SAP Consultant", profile);
approx("skor skill tidak cocok rendah", badSkills.ratio, 0, 0.35);

console.log("\n=== 10. Skor end-to-end: lowongan ideal ===");
const idealJob: RawJob = {
  source: "jobstreet",
  externalId: "1",
  url: "https://example.com/1",
  title: "Fullstack Developer",
  company: "PT Sehat Digital Nusantara",
  location: "Jakarta Selatan",
  description: `Requirements:
- Minimum 3 years experience as Fullstack Developer
- Strong in React, Next.js, TypeScript, Node.js
- Experience with PostgreSQL, Redis, Docker
- Familiar with REST API and microservices
- Experience in healthcare or enterprise software
Nice to have: Kubernetes, GraphQL, CI/CD
We build a healthcare SaaS platform for hospitals and clinics.`,
  salaryText: "Rp 11,000,000 – 14,000,000 per month",
  workMode: "Hybrid",
  employmentType: "Full time",
  postedAt: "2026-01-01",
  scrapedAt: new Date().toISOString(),
};
const ideal = scoreJob(idealJob, profile);
console.log(`  Total: ${ideal.total}/100 (${ideal.verdict})`);
for (const c of ideal.components) {
  console.log(`    ${c.label.padEnd(16)} ${String(c.score).padStart(5)} / ${c.max}`);
}
approx("lowongan ideal >= 70", ideal.total, 70, 100);
check("lolos ambang", ideal.passed, true);

console.log("\n=== 11. Skor end-to-end: lowongan buruk ===");
const badJob: RawJob = {
  source: "linkedin",
  externalId: "2",
  url: "https://example.com/2",
  title: "Senior SAP Consultant",
  company: "PT Bank Besar Tbk",
  location: "Jakarta Pusat",
  description: `Requirements:
- Minimum 8 years experience in SAP ABAP
- Deep knowledge of Oracle PL/SQL and COBOL
- Lead a team of 10 developers
- Banking compliance and core banking experience required`,
  salaryText: "Rp 40,000,000 per month",
  workMode: "On-site",
  employmentType: "Full time",
  postedAt: "2026-01-01",
  scrapedAt: new Date().toISOString(),
};
const bad = scoreJob(badJob, profile);
console.log(`  Total: ${bad.total}/100 (${bad.verdict})`);
for (const c of bad.components) {
  console.log(`    ${c.label.padEnd(16)} ${String(c.score).padStart(5)} / ${c.max}`);
}
approx("lowongan buruk < 70", bad.total, 0, 69.9);
check("tidak lolos ambang", bad.passed, false);
// "SAP" adalah nama produk, bukan penanda industri enterprise.
// Lowongan bank harus dinilai sebagai domain banking, bukan enterprise.
check(
  "domain bank terdeteksi, bukan enterprise",
  bad.components.find((c) => c.key === "domain")?.detail.detected,
  ["Perbankan"],
);

console.log("\n=== 12. Bobot total ===");
const w = profile.scoring.weights;
check("total bobot nominal", w.skills + w.seniority + w.domain + w.practical, 100);

console.log("\n=== 13. Redistribusi bobot saat data hilang ===");
// Lowongan tanpa gaji, tanpa lokasi jelas, tanpa industri terdeteksi.
const sparseJob: RawJob = {
  source: "linkedin",
  externalId: "3",
  url: "https://example.com/3",
  title: "Fullstack Developer",
  company: "PT Tanpa Info",
  location: "",
  description: "Requirements: React, Next.js, TypeScript, Node.js, PostgreSQL",
  salaryText: null,
  workMode: null,
  employmentType: null,
  postedAt: null,
  scrapedAt: new Date().toISOString(),
};
const sparse = scoreJob(sparseJob, profile);
const totalMax = sparse.components.reduce((s, c) => s + c.max, 0);
check("total bobot efektif tetap 100", Math.round(totalMax), 100);
check(
  "practical ditandai tidak dinilai",
  sparse.components.find((c) => c.key === "practical")?.assessed,
  false,
);
check(
  "domain tidak dinilai (tidak ada sinyal industri)",
  sparse.components.find((c) => c.key === "domain")?.assessed,
  false,
);
approx(
  "skills dapat bobot lebih besar setelah redistribusi",
  sparse.components.find((c) => c.key === "skills")?.max ?? 0,
  40.1,
  100,
);
console.log("    bobot efektif:", sparse.components.map((c) => `${c.key}=${c.max}`).join(" "));

console.log("\n=== 14. Normalisasi gaji tahunan -> bulanan ===");
const yearlyJob: RawJob = {
  ...sparseJob,
  externalId: "4",
  salaryText: "Rp 180,000,000 – Rp 250,000,000 per year",
  location: "Jakarta Selatan",
};
const yearly = scoreJob(yearlyJob, profile);
check(
  "gaji tahunan dikonversi ke bulanan",
  yearly.components.find((c) => c.key === "practical")?.detail.salary_min,
  15000000,
);

console.log("\n=== 15. Skor maksimal teoretis ===");
const perfect = ideal.components.reduce((s, c) => s + c.nominalMax, 0);
check("maksimum nominal 100", perfect, 100);

console.log("\n" + "=".repeat(50));
console.log(` HASIL: ${pass} lulus, ${fail} gagal`);
console.log("=".repeat(50));

if (fail > 0) process.exitCode = 1;
