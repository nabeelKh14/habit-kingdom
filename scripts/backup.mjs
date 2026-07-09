#!/usr/bin/env node
// scripts/backup.mjs
// Habit Kingdom — automated, encrypted database backup scheduler.
//
// Wires the previously-orphaned scripts/db_backup.sh logic into a robust,
// env-driven, testable module + a launchd plist (macOS) so daily encrypted
// Postgres/Supabase backups actually run on a schedule (DoD: "Database backups").
//
// Design notes:
//  - Pure/exported helpers (resolveBackupDir, buildBackupFileName, buildPgDumpArgs,
//    buildBackupPipeline, rotateBackups) are unit-tested without touching real
//    pg_dump / the filesystem.
//  - runBackup() accepts injected `shellExec`, `mkdir`, `readdir`, `stat`, `unlink`
//    so tests exercise the full flow deterministically.
//  - All backup files are AES-256-CBC encrypted at rest (openssl -pbkdf2) with a
//    passphrase from HK_BACKUP_PASSPHRASE — never logged, never in the bundle.
//
// No external npm dependencies — Node >= 18 stdlib only.

import { exec } from "node:child_process";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
// ── Pure helpers ─────────────────────────────────────────────────────────────

/** @param {Record<string, string|undefined>} [env] */
export function resolveBackupDir(env = process.env) {
  return env.HK_BACKUP_DIR || path.resolve(process.cwd(), "backups");
}

export function buildBackupFileName(now = new Date()) {
  const ts = now.toISOString().replace(/[:.]/g, "-");
  return `habit_kingdom_${ts}.sql.gz.enc`;
}

/** @param {Record<string, string|undefined>} [env] */
export function buildPgDumpArgs(env = process.env) {
  const connection = env.DATABASE_URL || env.SUPABASE_DB_URL;
  if (!connection) {
    throw new Error("DATABASE_URL (or SUPABASE_DB_URL) is required for backup");
  }
  return ["--no-owner", "--no-privileges", "--format=plain", connection];
}

function shellEscape(value) {
  // Wrap in single quotes; escape any embedded single quote per POSIX sh.
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

/** @param {Record<string, string|undefined>} [env] */
export function buildBackupPipeline(backupPath, env = process.env) {
  const passphrase = env.HK_BACKUP_PASSPHRASE;
  if (!passphrase) {
    throw new Error("HK_BACKUP_PASSPHRASE is required for encrypted backup");
  }
  const cipher = env.HK_BACKUP_CIPHER || "aes-256-cbc";
  const args = buildPgDumpArgs(env).join(" ");
  const safePass = shellEscape(passphrase);
  const safePath = shellEscape(backupPath);
  // set -o pipefail so a failing pg_dump/gzip fails the whole pipeline.
  return (
    `set -o pipefail; ` +
    `pg_dump ${args} | gzip | ` +
    `openssl enc -${cipher} -pbkdf2 -pass pass:${safePass} -out ${safePath}`
  );
}

export async function rotateBackups(backupDir, opts = {}) {
  const keep = opts.keep ?? 7;
  const protect = opts.protect; // path that must never be removed (the file just written)
  const readdir = opts.readdir ?? ((d) => fs.readdir(d));
  const stat = opts.stat ?? ((p) => fs.stat(p));
  const unlink = opts.unlink ?? ((p) => fs.unlink(p));

  const names = await readdir(backupDir);
  const backups = [];
  for (const name of names) {
    if (!name.startsWith("habit_kingdom_") || !name.endsWith(".sql.gz.enc")) {
      continue;
    }
    const full = path.join(backupDir, name);
    if (protect && path.resolve(full) === path.resolve(protect)) {
      continue; // never rotate the file we just created
    }
    const s = await stat(full);
    backups.push({ name, full, mtime: s.mtimeMs });
  }
  // Oldest first; keep the `keep` most recent.
  backups.sort((a, b) => a.mtime - b.mtime);
  const excess = backups.slice(0, Math.max(0, backups.length - keep));
  const removed = [];
  for (const b of excess) {
    await unlink(b.full);
    removed.push(b.name);
  }
  return removed;
}

// ── Orchestration ─────────────────────────────────────────────────────────────

export async function runBackup(opts = {}) {
  const env = opts.env ?? process.env;
  const backupDir = opts.backupDir ?? resolveBackupDir(env);
  const now = opts.now ?? new Date();
  const shellExec =
    opts.shellExec ??
    /**
     * @param {string} cmd
     * @returns {Promise<{code:number, signal:string|null}>}
     */
    ((cmd) =>
      new Promise((resolve, reject) => {
        exec(cmd, { shell: "/bin/bash" }, (err, _stdout, stderr) => {
          if (err) {
            if (typeof err.code === "number") {
              resolve({ code: err.code, signal: null });
            } else {
              reject(err); // spawn error (e.g. command not found)
            }
          } else {
            resolve({ code: 0, signal: null });
          }
        });
      }));
  const mkdir = opts.mkdir ?? ((d) => fs.mkdir(d, { recursive: true }));
  const readdir = opts.readdir ?? ((d) => fs.readdir(d));
  const stat = opts.stat ?? ((p) => fs.stat(p));
  const unlink = opts.unlink ?? ((p) => fs.unlink(p));
  const keep = Number(env.HK_BACKUP_RETENTION ?? 7);

  await mkdir(backupDir);
  const backupPath = path.join(backupDir, buildBackupFileName(now));
  const pipeline = buildBackupPipeline(backupPath, env);

  const { code, signal } = await shellExec(pipeline);
  if (code !== 0) {
    throw new Error(`pg_dump pipeline failed (code ${code}, signal ${signal})`);
  }

  const st = await stat(backupPath);
  if (!st.size) {
    throw new Error("backup file was created but is empty");
  }

  const removed = await rotateBackups(backupDir, {
    keep,
    protect: backupPath,
    readdir,
    stat,
    unlink,
  });

  return { backupPath, size: st.size, removed };
}

// ── CLI entrypoint ────────────────────────────────────────────────────────────

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const isMain = invokedPath === fileURLToPath(import.meta.url);

if (isMain) {
  runBackup()
    .then((r) => {
      console.log(
        `Backup OK: ${r.backupPath} (${r.size} bytes); removed ${r.removed.length} old backup(s).`,
      );
      process.exit(0);
    })
    .catch((err) => {
      console.error(`Backup FAILED: ${err.message}`);
      process.exit(1);
    });
}
