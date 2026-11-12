// dpoc-argon.zinc — minimal drill-template service (H2 item 5): healthz + /api/info +
// ONE Database module (main, neon 17). Same lifecycle as tin: x-dpoc-cluster everywhere,
// SIGTERM -> readiness 503, serve 10 s, exit; secret polled and clients swapped on
// generation change (lib/pgapp.ts verbatim from spike m-pgmoves). Rotation shows up in
// the log as db-generation events.
import pkg from "../package.json";
import { AppDb } from "./lib/pgapp.ts";

const PORT = Number(process.env.PORT ?? 3000);
const CLUSTER = process.env.DPOC_CLUSTER ?? "local";
const LANDSCAPE = process.env.DPOC_LANDSCAPE ?? "local";
const VERSION = process.env.DPOC_VERSION ?? pkg.version;
const DEPS_DIR = process.env.DPOC_DEPS_DIR ?? "/deps";
const DRAIN_MS = 10000;

const log = (evt: string, extra: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), evt, cluster: CLUSTER, ...extra }));

const db = new AppDb(`${DEPS_DIR}/database-main/secret.json`, { pollMs: 2000, max: 5 });
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
      r = json(req, 200, { cluster: CLUSTER, landscape: LANDSCAPE, version: VERSION });
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
