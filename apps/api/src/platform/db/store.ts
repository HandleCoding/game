import pg from "pg";
pg.types.setTypeParser(20, Number);
export type Db = pg.Pool | pg.PoolClient;
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  options: process.env.PGSCHEMA
    ? "-c search_path=" + process.env.PGSCHEMA
    : undefined,
});
export async function transaction<T>(
  fn: (db: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const value = await fn(db);
    await db.query("COMMIT");
    return value;
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}
