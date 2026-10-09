/**
 * Adapter SQLite.
 *
 * Next.js (runtime Node) memakai `node:sqlite` bawaan Node 22+.
 * Script CLI memakai Bun, dan Bun tidak menyediakan `node:sqlite`
 * (yang ada `bun:sqlite` dengan API nyaris identik).
 *
 * Adapter ini menyatukan keduanya supaya lib/db.ts tidak peduli
 * dijalankan oleh runtime mana.
 */

export interface Statement {
  run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  get(...params: unknown[]): Record<string, unknown> | undefined | null;
  all(...params: unknown[]): Record<string, unknown>[];
}

export interface Database {
  exec(sql: string): void;
  prepare(sql: string): Statement;
  close(): void;
}

export const IS_BUN = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";

export function openDatabase(path: string): Database {
  if (IS_BUN) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Database: BunDatabase } = require("bun:sqlite") as {
      Database: new (p: string) => Database;
    };
    return new BunDatabase(path);
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DatabaseSync } = require("node:sqlite") as {
    DatabaseSync: new (p: string) => Database;
  };
  return new DatabaseSync(path);
}
