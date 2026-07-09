import { describe, it, expect, vi } from "vitest";
import * as backup from "../../scripts/backup.mjs";

describe("backup scheduler", () => {
  it("resolveBackupDir defaults to cwd/backups", () => {
    expect(backup.resolveBackupDir({})).toMatch(/backups$/);
  });

  it("resolveBackupDir honors HK_BACKUP_DIR", () => {
    expect(backup.resolveBackupDir({ HK_BACKUP_DIR: "/tmp/x" })).toBe("/tmp/x");
  });

  it("buildBackupFileName is timestamped with encrypted suffix", () => {
    const name = backup.buildBackupFileName(new Date("2026-07-10T12:00:00Z"));
    expect(name).toMatch(/^habit_kingdom_.*\.sql\.gz\.enc$/);
  });

  it("buildPgDumpArgs requires a connection string", () => {
    expect(() => backup.buildPgDumpArgs({})).toThrow(/DATABASE_URL/);
  });

  it("buildPgDumpArgs uses SUPABASE_DB_URL as fallback", () => {
    const args = backup.buildPgDumpArgs({ SUPABASE_DB_URL: "postgres://u:p@h/db" });
    expect(args).toContain("postgres://u:p@h/db");
    expect(args[0]).toBe("--no-owner");
  });

  it("buildBackupPipeline requires a passphrase", () => {
    expect(() =>
      backup.buildBackupPipeline("/tmp/x", { DATABASE_URL: "postgres://x" }),
    ).toThrow(/passphrase/i);
  });

  it("buildBackupPipeline composes pg_dump | gzip | openssl pipeline", () => {
    const pipe = backup.buildBackupPipeline("/b/habit.sql.gz.enc", {
      DATABASE_URL: "postgres://u:p@h/db",
      HK_BACKUP_PASSPHRASE: "secret",
    });
    expect(pipe).toContain("set -o pipefail");
    expect(pipe).toContain("pg_dump");
    expect(pipe).toContain("gzip");
    expect(pipe).toContain("openssl enc -aes-256-cbc -pbkdf2 -pass pass:'secret'");
    expect(pipe).toContain("-out '/b/habit.sql.gz.enc'");
  });

  it("buildBackupPipeline escapes single quotes in passphrase", () => {
    const pipe = backup.buildBackupPipeline("/b/x.enc", {
      DATABASE_URL: "postgres://x",
      HK_BACKUP_PASSPHRASE: "sec'ret",
    });
    expect(pipe).toContain("pass:'sec'\\''ret'");
  });

  it("rotateBackups removes only the oldest beyond retention", async () => {
    const files = [
      "habit_kingdom_a.sql.gz.enc",
      "habit_kingdom_b.sql.gz.enc",
      "habit_kingdom_c.sql.gz.enc",
    ];
    const unlinked = [];
    const removed = await backup.rotateBackups("/d", {
      keep: 2,
      readdir: async () => files,
      stat: async (p: string) => ({ mtimeMs: Number(p.match(/_(\w)\./)![1].charCodeAt(0)) }),
      unlink: async (p: string) => {
        unlinked.push(p);
      },
    });
    expect(removed).toContain("habit_kingdom_a.sql.gz.enc");
    expect(removed).not.toContain("habit_kingdom_c.sql.gz.enc");
    expect(unlinked.length).toBe(1);
  });

  it("rotateBackups keeps everything when under retention", async () => {
    const removed = await backup.rotateBackups("/d", {
      keep: 5,
      readdir: async () => ["habit_kingdom_a.sql.gz.enc", "habit_kingdom_b.sql.gz.enc"],
      stat: async () => ({ mtimeMs: 1 }),
      unlink: async () => {},
    });
    expect(removed).toEqual([]);
  });

  it("runBackup executes the pipeline, verifies size, and rotates", async () => {
    const shellExec = vi.fn(async () => ({ code: 0, signal: null }));
    const result = await backup.runBackup({
      env: {
        DATABASE_URL: "postgres://x",
        HK_BACKUP_PASSPHRASE: "pw",
        HK_BACKUP_RETENTION: "3",
      },
      backupDir: "/d",
      now: new Date("2026-07-10T00:00:00Z"),
      shellExec,
      mkdir: async () => {},
      readdir: async () => [
        "habit_kingdom_old1.sql.gz.enc",
        "habit_kingdom_old2.sql.gz.enc",
        "habit_kingdom_old3.sql.gz.enc",
        "habit_kingdom_old4.sql.gz.enc",
      ],
      stat: async () => ({ size: 1234, mtimeMs: 1 }),
      unlink: async () => {},
    });
    expect(shellExec).toHaveBeenCalledTimes(1);
    expect((shellExec.mock.calls[0] as unknown[])[0]).toContain("pg_dump");
    expect(result.backupPath).toMatch(/habit_kingdom_2026-07-10.*\.sql\.gz\.enc$/);
    expect(result.size).toBe(1234);
    expect(result.removed).toContain("habit_kingdom_old1.sql.gz.enc");
  });

  it("runBackup throws when the pipeline fails", async () => {
    await expect(
      backup.runBackup({
        env: { DATABASE_URL: "postgres://x", HK_BACKUP_PASSPHRASE: "pw" },
        backupDir: "/d",
        shellExec: async () => ({ code: 1, signal: null }),
        mkdir: async () => {},
        readdir: async () => [],
        stat: async () => ({ size: 1, mtimeMs: 1 }),
        unlink: async () => {},
      }),
    ).rejects.toThrow(/pipeline failed/);
  });

  it("runBackup throws on empty backup file", async () => {
    await expect(
      backup.runBackup({
        env: { DATABASE_URL: "postgres://x", HK_BACKUP_PASSPHRASE: "pw" },
        backupDir: "/d",
        shellExec: async () => ({ code: 0, signal: null }),
        mkdir: async () => {},
        readdir: async () => [],
        stat: async () => ({ size: 0, mtimeMs: 1 }),
        unlink: async () => {},
      }),
    ).rejects.toThrow(/empty/);
  });
});
