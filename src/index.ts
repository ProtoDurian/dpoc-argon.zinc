// dpoc-argon.zinc — minimal drill-template service (H2 item 5): healthz + /api/info +
// ONE Database module (main, neon 17). Same lifecycle as tin: x-dpoc-cluster everywhere,
// SIGTERM -> readiness 503, serve 10 s, exit; secret polled and clients swapped on
// generation change (lib/pgapp.ts verbatim from spike m-pgmoves). Rotation shows up in
// the log as db-generation events.
import pkg from "../package.json";
import { AppDb } from "./lib/pgapp.ts";
import { INSERT_SQL, SCHEMA } from "./migrations.ts";

const PORT = Number(process.env.PORT ?? 3000);
const CLUSTER = process.env.DPOC_CLUSTER ?? "local";
const LANDSCAPE = process.env.DPOC_LANDSCAPE ?? "local";
const VERSION = process.env.DPOC_VERSION ?? pkg.version;
const DEPS_DIR = process.env.DPOC_DEPS_DIR ?? "/deps";
const DRAIN_MS = 10000;

const log = (evt: string, extra: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), evt, cluster: CLUSTER, ...extra }));

const BANNER = process.env.ZINC_BANNER ?? "unset";
const POOL_MAX = Number(process.env.ZINC_POOL_MAX ?? 5);
const db = new AppDb(`${DEPS_DIR}/database-main/secret.json`, { pollMs: 2000, max: POOL_MAX });
db.start();

let seenGens = 0;
setInterval(() => {
  const gens = db.stats.generations;
  if (gens.length > seenGens) {
    seenGens = gens.length;
    log("db-generation", { ...gens[gens.length - 1] });
  }
}, 500);

let draining = false;
function json(req: Request, status: number, body: Record<string, unknown>): Response {
  const h: Record<string, string> = { "content-type": "application/json", "x-dpoc-cluster": CLUSTER };
  if (draining) h["connection"] = "close";
  return new Response(JSON.stringify(body), { status, headers: h });
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const path = new URL(req.url).pathname;
    const t0 = Date.now();
    let r: Response;
    if (path === "/healthz") {
      r = draining ? json(req, 503, { ok: false, draining: true }) : json(req, 200, { ok: true });
    } else if (path === "/api/info") {
      r = json(req, 200, { cluster: CLUSTER, landscape: LANDSCAPE, version: VERSION, release_schema: SCHEMA, banner: BANNER, poolMax: POOL_MAX });
    } else if (path === "/api/notes" && req.method === "POST") {
      try {
        const b: any = await req.json();
        const id = String(b.id);
        await db.write((c) => c.query(INSERT_SQL, [id, String(b.text ?? "x")]), { idempotent: true });
        r = json(req, 200, { ok: true, id });
      } catch (e: any) { r = json(req, 500, { ok: false, err: String(e?.message ?? e).slice(0, 200) }); }
    } else if (path === "/api/notes/count") {
      try { const x = await db.read((c) => c.query("select count(*)::int n, coalesce((select max(version) from schema_migrations),0) sv from notes")); r = json(req, 200, { count: x.v.rows[0].n, schema: x.v.rows[0].sv }); }
      catch (e: any) { r = json(req, 500, { ok: false, err: String(e?.message ?? e).slice(0, 200) }); }
    } else if (path === "/api/notes/ids") {
      try { const p = new URL(req.url).searchParams.get("prefix") ?? ""; const x = await db.read((c) => c.query("select id from notes where id like $1 order by id", [p + "%"])); r = json(req, 200, { ids: x.v.rows.map((q: any) => q.id) }); }
      catch (e: any) { r = json(req, 500, { ok: false, err: String(e?.message ?? e).slice(0, 200) }); }
    } else {
      r = json(req, 404, { error: "not found" });
    }
    log("http", { method: req.method, path, status: r.status, ms: Date.now() - t0 });
    return r;
  },
});
log("listening", { port: PORT, landscape: LANDSCAPE, version: VERSION });

function shutdown(sig: string) {
  if (draining) return;
  draining = true;
  log("draining", { sig, serveMs: DRAIN_MS });
  const hard = setTimeout(() => process.exit(0), DRAIN_MS + 5000);
  setTimeout(async () => {
    try {
      server.stop();
      await db.stop();
    } finally {
      process.exit(0);
    }
  }, DRAIN_MS);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
