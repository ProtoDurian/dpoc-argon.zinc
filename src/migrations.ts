// zinc schema migrations. One list per release; db-init applies the ones this release knows and ignores newer applied ones.
// RELEASE v2.0.0: schema 1
export const MIGRATIONS: { version: number; name: string; sql: string }[] = [
  { version: 1, name: "create notes", sql: "create table if not exists notes (id text primary key, body text not null, created_at timestamptz not null default now())" },
];
export const SEED = "insert into notes(id, body) values ('seed-1','seeded by db-init') on conflict (id) do nothing";
/** column the app writes the note text into in THIS release */
export const TEXT_COL = "body";
export const SCHEMA = MIGRATIONS[MIGRATIONS.length - 1].version;
