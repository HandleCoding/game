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
  });
}
if (process.argv[1]?.endsWith("/migrate.ts")) {
  await migrate();
  console.log("Schema migration complete");
  await pool.end();
}
