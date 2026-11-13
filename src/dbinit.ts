// db-init: one-shot entry point run by the chart's PreSync/pre-upgrade hook Job BEFORE the pods update.
// 1 check the dependencies are reachable (database; zinc has no kv/store)  2 run pending migrations under an advisory lock
// 3 seed  4 exit 0, or exit 1 (job red) if a dependency is down / a migration fails.
import pg from "pg";
import { readFileSync } from "node:fs";
import { MIGRATIONS, SEED, SCHEMA } from "./migrations.ts";

const DEPS = process.env.DPOC_DEPS_DIR ?? "/deps";
const WAIT_S = Number(process.env.DBINIT_WAIT_S ?? 60);
const log = (evt: string, x: Record<string, unknown> = {}) => console.log(JSON.stringify({ ts: new Date().toISOString(), evt, ...x }));

async function connect(): Promise<pg.Client> {
  const deadline = Date.now() + WAIT_S * 1000;
  let last = "";
  for (let i = 1; ; i++) {
    try {
      const s = JSON.parse(readFileSync(`${DEPS}/database-main/secret.json`, "utf8"));
      // migrations use the DIRECT host: a session advisory lock over the pooler (pgbouncer, transaction mode) leaks to the pooled server connection and blocks every later db-init
      const c = new pg.Client({ host: s.directHost ?? s.host, port: s.port, user: s.user, password: s.password, database: s.database, ssl: s.ssl ? { rejectUnauthorized: false, servername: s.directHost ?? s.host } : undefined, connectionTimeoutMillis: 5000 });
      c.on("error", () => {});
      await c.connect();
      await c.query("select 1");
      log("check", { dependency: "database", ok: true, attempt: i });
      return c;
    } catch (e: any) {
      last = String(e?.message ?? e);
      log("check", { dependency: "database", ok: false, attempt: i, err: last.slice(0, 200) });
      if (Date.now() > deadline) { log("dbinit-failed", { reason: "dependency down", err: last.slice(0, 200) }); process.exit(1); }
      await Bun.sleep(3000);
    }
  }
}

const c = await connect();
try {
  await c.query("select pg_advisory_lock(424242)");
  await c.query("create table if not exists schema_migrations (version int primary key, name text not null, applied_at timestamptz not null default now())");
  const done = new Set<number>((await c.query("select version from schema_migrations")).rows.map((r) => r.version));
  const applied: number[] = [];
  for (const m of MIGRATIONS) {
    if (done.has(m.version)) continue;
    await c.query("begin");
    try { await c.query(m.sql); await c.query("insert into schema_migrations(version,name) values($1,$2)", [m.version, m.name]); await c.query("commit"); }
    catch (e: any) { await c.query("rollback").catch(() => {}); log("dbinit-failed", { reason: "migration", version: m.version, err: String(e?.message ?? e).slice(0, 300) }); process.exit(1); }
    applied.push(m.version); log("migrated", { version: m.version, name: m.name });
  }
  const newer = [...done].filter((v) => v > SCHEMA);
  await c.query(SEED);
  log("dbinit-done", { release_schema: SCHEMA, applied, already: [...done].filter((v) => v <= SCHEMA), newer_than_this_release: newer });
} finally { await c.query("select pg_advisory_unlock(424242)").catch(() => {}); await c.end().catch(() => {}); }
process.exit(0);
