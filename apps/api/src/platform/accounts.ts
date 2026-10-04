import { randomBytes, scrypt as callback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { FastifyRequest } from "fastify";
import { pool } from "./db/store.js";
import { check, GameError } from "./errors.js";
export const token = () => randomBytes(24).toString("hex");
const scrypt = (password: string, salt: string) =>
  new Promise<Buffer>((resolve, reject) =>
    callback(password, salt, 64, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
export interface User {
  id: string;
  account: string;
  name: string;
  salt: string;
  hash: string;
  created: number;
}
export async function user(id: string): Promise<User | undefined> {
  return (await pool.query<User>("SELECT * FROM users WHERE id=$1", [id]))
    .rows[0];
}
export async function authenticate(req: FastifyRequest) {
  const value = /(?:^|;\s*)pair_session=([a-f0-9]{48})(?:;|$)/.exec(
    req.headers.cookie || "",
  )?.[1];
  if (!value) return null;
  return (
    (
      await pool.query<{ user: string; token: string }>(
        'SELECT "user",token FROM sessions WHERE token=$1 AND expires>$2',
        [value, Date.now()],
      )
    ).rows[0] || null
  );
}
export async function signIn(
  register: boolean,
  b: { account: string; password: string; name?: string },
) {
  check(
    /^[a-zA-Z0-9_]{3,24}$/.test(b.account),
    "账号用 3–24 位字母、数字或下划线",
  );
  check(
    b.password.length >= 8 && b.password.length <= 128,
    "密码需要 8–128 个字符",
  );
  const account = b.account.toLowerCase();
  let u = (
    await pool.query<User>("SELECT * FROM users WHERE account=$1", [account])
  ).rows[0];
  if (register) {
    check(!u, "这个账号已经有人使用了");
    check(b.name?.trim() && b.name.trim().length <= 16, "昵称需要 1–16 个字符");
    const salt = token(),
      hash = (await scrypt(b.password, salt)).toString("hex");
    u = {
      id: token(),
      account,
      name: b.name!.trim(),
      salt,
      hash,
      created: Date.now(),
    };
    try {
      await pool.query("INSERT INTO users VALUES($1,$2,$3,$4,$5,$6)", [
        u.id,
        account,
        u.name,
        salt,
        hash,
        u.created,
      ]);
    } catch (e) {
      if ((e as { code?: string }).code === "23505")
        throw new GameError("这个账号已经有人使用了");
      throw e;
    }
  } else {
    const derived = await scrypt(b.password, u?.salt || "missing-user");
    check(
      u && timingSafeEqual(derived, Buffer.from(u.hash, "hex")),
      "账号或密码不正确",
    );
  }
  const key = token();
  await pool.query("INSERT INTO sessions VALUES($1,$2,$3)", [
    key,
    u.id,
    Date.now() + 30 * 86400000,
  ]);
  return { u, key };
}
