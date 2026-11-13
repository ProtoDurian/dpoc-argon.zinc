// zinc schema migrations. One list per release; db-init applies the ones this release knows and ignores newer applied ones.
// RELEASE v2.1.0: schema 2 = EXPAND (nullable column; the previous release keeps working on it)
export const MIGRATIONS: { version: number; name: string; sql: string }[] = [
  { version: 1, name: "create notes", sql: "create table if not exists notes (id text primary key, body text not null, created_at timestamptz not null default now())" },
  { version: 2, name: "expand: add author", sql: "alter table notes add column if not exists author text" },
];
export const SEED = "insert into notes(id, body) values ('seed-1','seeded by db-init') on conflict (id) do nothing";
/** the write this release makes (args: id, text) */
export const INSERT_SQL = "insert into notes(id, body, author) values ($1, $2, 'cov') on conflict (id) do nothing";
export const SCHEMA = MIGRATIONS[MIGRATIONS.length - 1].version;
