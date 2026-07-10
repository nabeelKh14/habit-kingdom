// E2E driver: full domain utility against the Express server's in-memory
// fallback (server-authoritative store). Self-contained: spawns the server on
// :5056, waits for readiness, drives the auth + family + habits/rewards/wallet
// + sync + COPPA-deletion flows, then tears down.
//
// Run: node scripts/e2e_domain.mjs
// Requires env for validateEnv(): JWT_SECRET, EXPO_PUBLIC_SUPABASE_URL,
// EXPO_PUBLIC_SUPABASE_ANON_KEY. These are set below so the server boots in
// in-memory mode (no DB).
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = 5056;
const BASE = `http://127.0.0.1:${PORT}`;
const auth = (t) => ({ "Content-Type": "application/json", Authorization: `Bearer ${t}` });

process.env.PORT = String(PORT);
process.env.NODE_ENV = "development";
process.env.JWT_SECRET = process.env.JWT_SECRET || "e2e-dev-secret-at-least-32-chars-long-xxxx";
process.env.EXPO_PUBLIC_SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || "https://example.supabase.co";
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "public-anon-key-placeholder";
// Force in-memory fallback (no real DB).
delete process.env.SUPABASE_DB_URL;
process.env.DISABLE_DB = "true";

function startServer() {
  const proc = spawn("npx", ["tsx", "server/index.ts"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  proc.stderr.on("data", (d) => {
    const s = d.toString();
    if (/error|Error|ECONN|EADDR/i.test(s)) process.stderr.write(`[server:stderr] ${s}`);
  });
  return proc;
}

async function waitForReady(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return true;
    } catch {
      /* not up yet */
    }
    await sleep(300);
  }
  throw new Error("server did not become ready in time");
}

async function j(method, path, body, headers) {
  const res = await fetch(BASE + path, {
    method,
    headers: headers || { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  return { status: res.status, json };
}

async function main() {
  const server = startServer();
  const out = [];
  const ok = (label, cond, extra = "") => out.push(`${cond ? "PASS" : "FAIL"} ${label} ${extra}`);

  let failed = 0;
  try {
    await waitForReady();

    // register parent + child
    const parent = await j("POST", "/api/v1/auth/register", { username: `dad_${Date.now().toString(36)}`, password: "ParentPass1" });
    const child = await j("POST", "/api/v1/auth/register", { username: `kid_${Date.now().toString(36)}`, password: "KidPass123" });
    const pTok = parent.json.token, cTok = child.json.token;
    const pId = parent.json.user.id, cId = child.json.user.id;
    ok("register parent returns token + id", !!(pTok && pId), `status=${parent.status}`);
    ok("register child returns token + id", !!(cTok && cId), `status=${child.status}`);

    // link child to parent
    const link = await j("POST", "/api/v1/family/link", { parentId: pId, childId: cId }, auth(pTok));
    ok("link child to parent (201)", link.status === 201, `status=${link.status}`);

    // parent creates a habit for the child (via profileId)
    const habit = await j("POST", "/api/v1/habits", { name: "Brush teeth", coinReward: 15, frequency: "daily", profileId: cId }, auth(pTok));
    ok("parent creates habit for child (201)", habit.status === 201, `status=${habit.status}`);
    const habitId = habit.json.id;

    // child completes the habit -> earns coins
    const complete = await j("POST", `/api/v1/habits/${habitId}/complete`, {}, auth(cTok));
    ok("child completes habit -> +15 coins", complete.status === 201 && complete.json.newBalance === 15, `bal=${complete.json?.newBalance}`);
    ok("completion recorded", complete.json?.completion?.id != null);

    // child completes again -> +15 more (balance 30)
    const complete2 = await j("POST", `/api/v1/habits/${habitId}/complete`, {}, auth(cTok));
    ok("second completion -> balance 30", complete2.json?.newBalance === 30, `bal=${complete2.json?.newBalance}`);

    // parent creates a reward (cost 25)
    const reward = await j("POST", "/api/v1/rewards", { name: "Extra screen time", cost: 25, profileId: cId }, auth(pTok));
    ok("parent creates reward for child (201)", reward.status === 201, `status=${reward.status}`);
    const rewardId = reward.json.id;

    // child redeems reward -> -25 (balance 5)
    const redeem = await j("POST", `/api/v1/rewards/${rewardId}/redeem`, {}, auth(cTok));
    ok("child redeems reward -> -25 (balance 5)", redeem.status === 201 && redeem.json.newBalance === 5, `bal=${redeem.json?.newBalance}`);

    // child tries to redeem again with insufficient funds (balance 5 < 25)
    const redeem2 = await j("POST", `/api/v1/rewards/${rewardId}/redeem`, {}, auth(cTok));
    ok("redeem blocked when insufficient funds (402)", redeem2.status === 402, `status=${redeem2.status}`);

    // parent admin bonus +50 -> balance 55
    const bonus = await j("POST", "/api/v1/admin/bonus", { amount: 50, profileId: cId }, auth(pTok));
    ok("parent bonus +50 -> balance 55", bonus.json?.newBalance === 55, `bal=${bonus.json?.newBalance}`);

    // child reads own wallet
    const wallet = await j("GET", `/api/v1/wallet?profileId=${cId}`, undefined, auth(cTok));
    ok("wallet reflects balance 55", wallet.json?.balance === 55, `bal=${wallet.json?.balance}`);

    // imposter (unlinked) cannot read child wallet
    const imp = await j("POST", "/api/v1/auth/register", { username: `imp_${Date.now().toString(36)}`, password: "Imposter1" });
    const impWallet = await j("GET", `/api/v1/wallet?profileId=${cId}`, undefined, auth(imp.json.token));
    ok("unlinked parent blocked from child wallet (403)", impWallet.status === 403, `status=${impWallet.status}`);

    // sync download returns full dataset for child
    const dl = await j("GET", "/api/v1/sync/download", undefined, auth(cTok));
    ok("sync/download returns habits(1)+wallet(55)+stats(completions=2)",
      dl.json?.habits?.length === 1 && dl.json?.wallet?.balance === 55 && dl.json?.stats?.totalCompletions === 2,
      `habits=${dl.json?.habits?.length} bal=${dl.json?.wallet?.balance} comp=${dl.json?.stats?.totalCompletions}`);

    // sync upload round-trips: push a new reward then download sees it
    const up = await j("POST", "/api/v1/sync/upload", {
      habits: [{ id: "upl-habit-1", name: "Read book", coinReward: 5, profileId: cId }],
      rewards: [{ id: "upl-rew-1", name: "Sticker", cost: 3, profileId: cId }],
      completions: [], redemptions: [], achievements: [], wallet: null, stats: null,
    }, auth(cTok));
    ok("sync/upload accepts payload", up.status === 200 && up.json?.syncedHabits === 1, `status=${up.status}`);

    // COPPA delete child cascades to domain data
    const del = await j("DELETE", `/api/v1/user/${cId}/data`, undefined, auth(pTok));
    ok("parent deletes child data (200)", del.status === 200, `status=${del.status}`);
    const dlAfter = await j("GET", "/api/v1/sync/download", undefined, auth(cTok));
    ok("child data gone after deletion (wallet 0, no habits)",
      dlAfter.json?.habits?.length === 0 && dlAfter.json?.wallet?.balance === 0,
      `habits=${dlAfter.json?.habits?.length} bal=${dlAfter.json?.wallet?.balance}`);
  } catch (e) {
    out.push(`FAIL driver error: ${e?.message || e}`);
    failed++;
  } finally {
    server.kill("SIGTERM");
  }

  console.log(out.join("\n"));
  const fails = out.filter((l) => l.startsWith("FAIL")).length;
  console.log(fails === 0 ? "\nALL DOMAIN E2E CHECKS PASSED" : `\n${fails} CHECK(S) FAILED`);
  process.exit(fails === 0 ? 0 : 1);
}

main().catch((e) => { console.error("DRIVER ERROR", e); process.exit(2); });
