// zinc schema migrations. One list per release; db-init applies the ones this release knows and ignores newer applied ones.
// RELEASE v2.2.0: schema 3 = BREAKING rename (NOT expand/contract: the previous release cannot write any more)
export const MIGRATIONS: { version: number; name: string; sql: string }[] = [
  { version: 1, name: "create notes", sql: "create table if not exists notes (id text primary key, body text not null, created_at timestamptz not null default now())" },
  { version: 2, name: "expand: add author", sql: "alter table notes add column if not exists author text" },
  { version: 3, name: "BREAKING: rename body to text", sql: "do $$ begin if exists (select 1 from information_schema.columns where table_name='notes' and column_name='body') then alter table notes rename column body to text; end if; end $$" },
];
export const SEED = "insert into notes(id, text) values ('seed-1','seeded by db-init') on conflict (id) do nothing";
/** the write this release makes (args: id, text) */
export const INSERT_SQL = "insert into notes(id, text, author) values ($1, $2, 'cov') on conflict (id) do nothing";
export const SCHEMA = MIGRATIONS[MIGRATIONS.length - 1].version;
