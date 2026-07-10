// End-to-end driver: proves SecureStorage persists to local Supabase.
// Run: node scripts/e2e_storage.mjs  (server on :5055, Supabase local on :54321)
const BASE = "http://127.0.0.1:5055";

function authHeader(token) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

async function j(method, path, body, headers) {
  const res = await fetch(BASE + path, {
    method,
    headers: headers || { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) {}
  return { status: res.status, json };
}

async function main() {
  const out = [];
  const ok = (label, cond, extra = "") =>
    out.push(`${cond ? "✅" : "❌"} ${label} ${extra}`);
  const s = Date.now().toString(36); // unique per run

  const parent = await j("POST", "/api/v1/auth/register", { username: `dad_${s}`, password: "ParentPass1" });
  ok("register parent", parent.status === 201, `status=${parent.status}`);
  const dadToken = parent.json && parent.json.token;
  const dadId = parent.json && parent.json.user && parent.json.user.id;

  const c1 = await j("POST", "/api/v1/auth/register", { username: `kid1_${s}`, password: "KidPass123" });
  const c2 = await j("POST", "/api/v1/auth/register", { username: `kid2_${s}`, password: "KidPass123" });
  ok("register child 1", c1.status === 201);
  ok("register child 2", c2.status === 201);
  const kid1Id = c1.json && c1.json.user && c1.json.user.id;
  const kid2Id = c2.json && c2.json.user && c2.json.user.id;

  const login = await j("POST", "/api/v1/auth/login", { username: `dad_${s}`, password: "ParentPass1" });
  ok("login validates from DB", login.status === 200, `status=${login.status}`);

  const link1 = await j("POST", "/api/v1/family/link", { parentId: dadId, childId: kid1Id }, authHeader(dadToken));
  const link2 = await j("POST", "/api/v1/family/link", { parentId: dadId, childId: kid2Id }, authHeader(dadToken));
  ok("link child 1", link1.status === 201, `status=${link1.status}`);
  ok("link child 2", link2.status === 201, `status=${link2.status}`);

  const otherParent = await j("POST", "/api/v1/auth/register", { username: `imposter_${s}`, password: "Imposter1" });
  // imposter tries to link kid1 to DAD (not themselves) -> must be blocked by self-check
  const imposterLink = await j("POST", "/api/v1/family/link", { parentId: dadId, childId: kid1Id }, authHeader(otherParent.json.token));
  ok("imposter cannot link someone else's child (403)", imposterLink.status === 403, `status=${imposterLink.status}`);

  const children = await j("GET", "/api/v1/family/children", undefined, authHeader(dadToken));
  ok("parent sees 2 children", children.json && children.json.children && children.json.children.length === 2, `count=${children.json && children.json.children && children.json.children.length}`);

  const del = await j("DELETE", `/api/v1/user/${kid1Id}/data`, undefined, authHeader(dadToken));
  ok("parent deletes child data", del.status === 200, `status=${del.status}`);
  const childrenAfter = await j("GET", "/api/v1/family/children", undefined, authHeader(dadToken));
  ok("child removed from family after deletion", childrenAfter.json && childrenAfter.json.children && childrenAfter.json.children.length === 1, `count=${childrenAfter.json && childrenAfter.json.children && childrenAfter.json.children.length}`);

  console.log(out.join("\n"));
  const failed = out.filter((l) => l.startsWith("❌")).length;
  console.log(failed === 0 ? "\nALL E2E CHECKS PASSED" : `\n${failed} CHECK(S) FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error("DRIVER ERROR", e); process.exit(2); });
