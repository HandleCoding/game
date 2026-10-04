// Private operator CLI; never registered as a public HTTP action.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { pool, transaction } from "../dist/apps/api/src/platform/db/store.js";
import { migrate } from "../dist/apps/api/src/platform/db/migrate.js";
import {
  captureRanch,
  resetRanch,
  restoreRanch,
} from "../dist/apps/api/src/games/animal-ranch/reset.js";
const mode = process.argv[2],
  file = process.argv[3];
const expected = Number(process.argv[4] ?? 1);
const database = new URL(process.env.DATABASE_URL || "").pathname;
if (
  !["/playroom_prod", "/playroom_dev"].includes(database) ||
  !["reset", "restore"].includes(mode) ||
  !Number.isInteger(expected) ||
  !file
)
  throw new Error(
    "Usage: node scripts/reset-ranch.mjs reset|restore PRIVATE_BACKUP EXPECTED_PROFILES",
  );
if (database === "/playroom_prod") {
  if (process.env.RANCH_RESET_MAINTENANCE !== "1")
    throw new Error("Production reset requires maintenance");
  try {
    execFileSync("systemctl", ["is-active", "--quiet", "pair-play"]);
    throw new Error("Production service must be stopped");
  } catch (e) {
    if (e.status !== 3) throw e;
  }
  if (!file.startsWith("/var/backups/pair-play/"))
    throw new Error("Production backup must be private");
}
try {
  await migrate();
  await transaction(async (db) => {
    if (mode === "restore") {
      const backup = JSON.parse(fs.readFileSync(file, "utf8"));
      if (backup.rows.persistent_profiles.length !== expected)
        throw new Error("Backup profile count mismatch");
      await restoreRanch(db, backup);
    } else {
      const backup = await captureRanch(db, expected);
      fs.writeFileSync(file, JSON.stringify(backup), {
        flag: "wx",
        mode: 0o600,
      });
      await resetRanch(db, backup, Date.now());
    }
  });
  console.log(
    JSON.stringify({
      mode,
      profiles: expected,
      gameId: "animal-ranch",
      accountDataPreserved: true,
    }),
  );
} finally {
  await pool.end();
}
