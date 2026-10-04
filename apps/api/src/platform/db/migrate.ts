import { pool, transaction } from "./store.js";
export async function migrate() {
  await transaction(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(7321042026)");
    await db.query(`
CREATE TABLE IF NOT EXISTS schema_migrations(version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS users(id text PRIMARY KEY, account text UNIQUE NOT NULL,name text NOT NULL,salt text NOT NULL,hash text NOT NULL,created bigint NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token text PRIMARY KEY,"user" text NOT NULL REFERENCES users(id),expires bigint NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires);
CREATE TABLE IF NOT EXISTS results(id text PRIMARY KEY,code text,players jsonb NOT NULL,winner text,reason text,turns integer NOT NULL,created bigint NOT NULL,game_id text NOT NULL DEFAULT 'guess-number',game_version integer NOT NULL DEFAULT 1,match_id text UNIQUE,settings_json jsonb,review_json jsonb);
CREATE TABLE IF NOT EXISTS result_players("user" text NOT NULL REFERENCES users(id),result text NOT NULL REFERENCES results(id),outcome text NOT NULL DEFAULT 'draw' CHECK(outcome IN ('win','loss','draw')),score numeric,PRIMARY KEY("user",result));
CREATE INDEX IF NOT EXISTS results_winner ON results(winner);
CREATE TABLE IF NOT EXISTS active_rooms(code text PRIMARY KEY,snapshot jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS action_receipts(actor text NOT NULL REFERENCES users(id),request_id text NOT NULL,match_id text NOT NULL,fingerprint text NOT NULL,response jsonb NOT NULL,created bigint NOT NULL,PRIMARY KEY(actor,request_id));
CREATE TABLE IF NOT EXISTS persistent_profiles(game_id text NOT NULL,world_id text NOT NULL,"user" text NOT NULL REFERENCES users(id),version integer NOT NULL,revision bigint NOT NULL DEFAULT 0,last_settled_at bigint NOT NULL,state jsonb NOT NULL,PRIMARY KEY(game_id,world_id,"user"));
CREATE TABLE IF NOT EXISTS world_jobs(id text PRIMARY KEY,game_id text NOT NULL,event_key text UNIQUE NOT NULL,due_at bigint NOT NULL,payload jsonb NOT NULL,status text NOT NULL DEFAULT 'pending');
CREATE TABLE IF NOT EXISTS import_runs(source_sha256 text PRIMARY KEY,imported_at timestamptz NOT NULL DEFAULT now(),counts jsonb NOT NULL);
INSERT INTO schema_migrations(version) VALUES(1) ON CONFLICT DO NOTHING;`);
    await db.query(`
CREATE TABLE IF NOT EXISTS ranch_wallets(
 game_id text NOT NULL CHECK(game_id='animal-ranch'),world_id text NOT NULL,"user" text NOT NULL,
 coins bigint NOT NULL CHECK(coins>=0),xp bigint NOT NULL CHECK(xp>=0),
 feed_ms bigint NOT NULL CHECK(feed_ms>=0 AND feed_ms<=60000000),
 capacity integer NOT NULL CHECK(capacity>=4 AND capacity<=16 AND capacity%2=0),
 next_animal integer NOT NULL CHECK(next_animal>=2),
 PRIMARY KEY(game_id,world_id,"user"),
 FOREIGN KEY(game_id,world_id,"user") REFERENCES persistent_profiles(game_id,world_id,"user"));
CREATE TABLE IF NOT EXISTS ranch_animals(
 game_id text NOT NULL,world_id text NOT NULL,"user" text NOT NULL,id text NOT NULL,
 data jsonb NOT NULL CHECK(
 jsonb_typeof(data->'species')='string' AND data->>'species' ~ '^[a-z][a-z0-9-]*$' AND
 (data->>'ageMs')::bigint>=0 AND (data->>'stored')::integer>=0 AND
 (data->>'stored')::integer<=(data->>'maxStored')::integer AND
 (data->>'cycleMs')::bigint>0 AND (data->>'growthMs')::bigint>0),
 PRIMARY KEY(game_id,world_id,"user",id),
 FOREIGN KEY(game_id,world_id,"user") REFERENCES ranch_wallets(game_id,world_id,"user"));
CREATE TABLE IF NOT EXISTS ranch_inventory(
 game_id text NOT NULL,world_id text NOT NULL,"user" text NOT NULL,product text NOT NULL
 CHECK(product ~ '^[a-z][a-z0-9-]*$'),
 quantity bigint NOT NULL CHECK(quantity>=0),PRIMARY KEY(game_id,world_id,"user",product),
 FOREIGN KEY(game_id,world_id,"user") REFERENCES ranch_wallets(game_id,world_id,"user"));
CREATE TABLE IF NOT EXISTS ranch_ledger(
 game_id text NOT NULL,world_id text NOT NULL,"user" text NOT NULL,id text NOT NULL,
 created bigint NOT NULL,message text NOT NULL,coins_delta bigint NOT NULL,
 PRIMARY KEY(game_id,world_id,"user",id),
 FOREIGN KEY(game_id,world_id,"user") REFERENCES ranch_wallets(game_id,world_id,"user"));
CREATE INDEX IF NOT EXISTS ranch_ledger_created ON ranch_ledger(game_id,world_id,"user",created DESC);
INSERT INTO schema_migrations(version) VALUES(2) ON CONFLICT DO NOTHING;
`);
    const applied = await db.query(
      "SELECT version FROM schema_migrations WHERE version=3",
    );
    if (!applied.rowCount) {
      await db.query(`
ALTER TABLE ranch_wallets DROP CONSTRAINT ranch_wallets_feed_ms_check;
ALTER TABLE ranch_wallets ADD CONSTRAINT ranch_wallets_feed_ms_check CHECK(feed_ms>=0 AND feed_ms<=1800000000);
INSERT INTO schema_migrations(version) VALUES(3);
`);
    }
  });
}
if (process.argv[1]?.endsWith("/migrate.ts")) {
  await migrate();
  console.log("Schema migration complete");
  await pool.end();
}
