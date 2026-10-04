import { writeFile, chmod } from "node:fs/promises";
import { spawnSync } from "node:child_process";
const url = new URL(process.env.DATABASE_URL || "");
if (!["/playroom_prod", "/playroom_dev"].includes(url.pathname))
  throw Error("Unsupported database");
if (url.pathname === "/playroom_prod") {
  if (process.env.RANCH_LIFECYCLE_MAINTENANCE !== "1" || process.env.PGSCHEMA)
    throw Error("Production requires closed ingress and maintenance flag");
  if (
    spawnSync("systemctl", ["is-active", "--quiet", "pair-play"]).status === 0
  )
    throw Error("Stop production writer before migration");
}
const { transaction, pool } =
  await import("../dist/apps/api/src/platform/db/store.js");
const { migrate } = await import("../dist/apps/api/src/platform/db/migrate.js");
const { migrateRanchProfiles } =
  await import("../dist/apps/api/src/games/animal-ranch/migration.js");
try {
  await migrate();
  const report = await transaction((db) => migrateRanchProfiles(db));
  if (process.argv[2]) {
    await writeFile(process.argv[2], JSON.stringify(report, null, 2), {
      mode: 0o600,
    });
    await chmod(process.argv[2], 0o600);
  }
  console.log(JSON.stringify(report)); // Counts only; no account identities, secrets or individual balances.
} finally {
  await pool.end();
}
