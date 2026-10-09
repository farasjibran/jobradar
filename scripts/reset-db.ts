#!/usr/bin/env bun
/** Hapus semua data lowongan (database tetap ada, tabel dikosongkan). */

import { closeDb, getDb } from "../lib/db";

const db = getDb();
const before = (db.prepare("SELECT COUNT(*) AS n FROM jobs").get() as { n: number }).n;
db.exec("DELETE FROM jobs; DELETE FROM crawl_runs;");
db.exec("VACUUM;");
console.log(`Dihapus ${before} lowongan. Database bersih.`);
closeDb();
