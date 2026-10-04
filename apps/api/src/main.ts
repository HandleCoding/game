import Fastify, { type FastifyError } from "fastify";
import staticFiles from "@fastify/static";
import { fileURLToPath } from "node:url";
import { authenticate, signIn } from "./platform/accounts.js";
import { GameError, check } from "./platform/errors.js";
import { pool } from "./platform/db/store.js";
import { migrate } from "./platform/db/migrate.js";
import { RoomHub } from "./platform/rooms.js";
import { registry } from "./games/registry.js";
import { PersistentService } from "./platform/persistent.js";
await migrate();
const hub = new RoomHub();
await hub.load();
const persistent = new PersistentService();
const app = Fastify({
  bodyLimit: 8192,
  logger: false,
  ajv: { customOptions: { coerceTypes: false, removeAdditional: false } },
});
let stopping = false;
const security = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
};
const rates = new Map<string, { n: number; until: number }>();
function limit(key: string, max: number, period: number) {
  const now = Date.now();
  let r = rates.get(key);
  if (!r || r.until < now) {
    r = { n: 0, until: now + period };
    rates.set(key, r);
  }
  check(++r.n <= max, "操作太频繁了，请稍后再试", 429);
}
app.addHook("onRequest", async (req, reply) => {
  reply.headers(security).header("Cache-Control", "no-store");
  if (stopping) throw new GameError("服务升级中，请稍后重试", 503);
  if (req.method === "POST") {
    const expected = process.env.PUBLIC_ORIGIN || "http://" + req.headers.host;
    const origins = [
      expected,
      ...(process.env.ALLOWED_ORIGINS || "").split(",").filter(Boolean),
    ];
    check(
      !req.headers.origin || origins.includes(req.headers.origin),
      "请求来源不匹配",
      403,
    );
    limit(req.ip + ":" + (req.headers["x-real-ip"] || ""), 120, 60000);
  }
});
app.setErrorHandler((cause, req, reply) => {
  const error = cause as FastifyError;
  if (error instanceof GameError)
    return reply.code(error.status).send({ error: error.message });
  if (error.validation)
    return reply.code(400).send({ error: "请求参数格式不正确" });
  console.error("Request failed:", error.code || error.name);
  return reply.code(500).send({ error: "暂时出了点问题，请重试" });
});
app.get("/healthz", async () => {
  await pool.query("SELECT 1");
  return { ok: true, version: "2.0.0", database: "postgresql" };
});
app.get("/api/catalog", async () => ({
  games: registry.catalog(),
  online: [...hub.streams.keys()].filter(hub.online).length,
}));
const str = { type: "string" },
  bool = { type: "boolean" },
  seconds = { type: "integer", enum: [15, 30, 45, 60, 90] },
  value = { type: "string", pattern: "^[0-9]{4}$" };
const meta = {
  requestId: { type: "string", minLength: 8, maxLength: 100 },
  matchId: str,
  expectedRevision: { type: "integer", minimum: 0 },
};
function schema(properties: Record<string, unknown>, required: string[] = []) {
  return {
    body: {
      type: "object",
      properties: { ...properties, ...meta },
      required,
      additionalProperties: false,
    },
  };
}
for (const path of ["register", "login"])
  app.post<{ Body: { account: string; password: string; name?: string } }>(
    "/api/" + path,
    {
      schema: schema(
        {
          account: { ...str, minLength: 3, maxLength: 24 },
          password: { ...str, minLength: 8, maxLength: 128 },
          name: { ...str, minLength: 1, maxLength: 16 },
        },
        path === "register"
          ? ["account", "password", "name"]
          : ["account", "password"],
      ),
    },
    async (req, reply) => {
      limit(req.ip + ":auth", 30, 600000);
      if (path === "register") limit(req.ip + ":register", 10, 3600000);
      const { u, key } = await signIn(path === "register", req.body);
      reply.header(
        "Set-Cookie",
        "pair_session=" +
          key +
          "; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000" +
          (process.env.PUBLIC_ORIGIN?.startsWith("https:") ? "; Secure" : ""),
      );
      return { me: { id: u.id, account: u.account, name: u.name } };
    },
  );
async function identity(req: Parameters<typeof authenticate>[0]) {
  const auth = await authenticate(req);
  check(auth, "请先登录", 401);
  return auth;
}
app.get("/api/state", async (req) => {
  const auth = await identity(req);
  return hub.run(() => hub.state(auth.user));
});
app.get("/api/events", async (req, reply) => {
  const auth = await identity(req);
  reply.hijack();
  reply.raw.writeHead(200, {
    ...security,
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  try {
    await hub.attach(auth.user, reply.raw);
  } catch {
    reply.raw.end();
  }
});
app.post("/api/logout", { schema: schema({}) }, async (req, reply) => {
  const auth = await identity(req);
  await hub.mutate(auth.user, "logout", {});
  await pool.query("DELETE FROM sessions WHERE token=$1", [auth.token]);
  for (const res of hub.streams.get(auth.user) || []) {
    res.write("event: logout\ndata: {}\n\n");
    res.end();
  }
  hub.streams.delete(auth.user);
  reply.header(
    "Set-Cookie",
    "pair_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
  );
  return { ok: true };
});
const actions: [string, string, Record<string, unknown>, string[]][] = [
  ["room/create", "create", { gameId: str, seconds, disableHistory: bool }, []],
  ["room/join", "join", { code: { ...str, pattern: "^[0-9]{6}$" } }, ["code"]],
  ["invite", "invite", { to: str }, ["to"]],
  [
    "invite/respond",
    "invite/respond",
    { id: str, accept: bool },
    ["id", "accept"],
  ],
  ["room/leave", "leave", {}, []],
  ["room/settings", "settings", { seconds, disableHistory: bool }, ["seconds"]],
  ["room/ready", "ready", { ready: bool }, ["ready"]],
  ["room/secret", "secret", { value }, ["value"]],
  ["room/dice", "dice", {}, []],
  ["room/guess", "guess", { value }, ["value"]],
  ["room/rematch", "rematch", {}, []],
];
for (const [path, op, properties, required] of actions)
  app.post<{ Body: Record<string, unknown> }>(
    "/api/" + path,
    { schema: schema(properties, required) },
    async (req) => hub.mutate((await identity(req)).user, op, req.body),
  );
app.post<{
  Params: { code: string };
  Body: {
    type: string;
    payload: Record<string, unknown>;
    requestId: string;
    matchId: string;
    expectedRevision: number;
  };
}>(
  "/api/rooms/:code/actions",
  {
    schema: schema({ type: str, payload: { type: "object" } }, [
      "type",
      "payload",
      "requestId",
      "matchId",
      "expectedRevision",
    ]),
  },
  async (req) => {
    const id = (await identity(req)).user;
    check(hub.roomFor(id)?.code === req.params.code, "你不在这个房间", 403);
    check(
      !["create", "join", "invite", "invite/respond", "logout"].includes(
        req.body.type,
      ),
      "该动作属于大厅",
    );
    return hub.mutate(id, req.body.type, {
      ...req.body.payload,
      requestId: req.body.requestId,
      matchId: req.body.matchId,
      expectedRevision: req.body.expectedRevision,
    });
  },
);
app.get<{ Params: { id: string } }>("/api/results/:id", async (req) => {
  const id = (await identity(req)).user;
  const r = (
    await pool.query(
      'SELECT r.id,r.game_id,r.review_json FROM results r JOIN result_players p ON p.result=r.id WHERE r.id=$1 AND p."user"=$2',
      [req.params.id, id],
    )
  ).rows[0];
  check(r, "没有权限查看该对局", 404);
  return {
    id: r.id,
    gameId: r.game_id,
    review: r.review_json,
    available: r.review_json !== null,
  };
});
app.get<{ Params: { gameId: string } }>("/api/games/:gameId/me", async (req) =>
  persistent.view(req.params.gameId, (await identity(req)).user),
);
app.get<{ Params: { gameId: string; owner: string } }>(
  "/api/games/:gameId/players/:owner",
  async (req) =>
    persistent.view(
      req.params.gameId,
      (await identity(req)).user,
      req.params.owner,
    ),
);
app.post<{
  Params: { gameId: string };
  Body: {
    type: string;
    payload: Record<string, unknown>;
    requestId: string;
    expectedRevision: number;
  };
}>(
  "/api/games/:gameId/actions",
  {
    schema: schema({ type: str, payload: { type: "object" } }, [
      "type",
      "payload",
      "requestId",
      "expectedRevision",
    ]),
  },
  async (req) =>
    persistent.action(req.params.gameId, (await identity(req)).user, req.body),
);
const webRoot = process.env.WEB_ROOT || process.cwd() + "/web-dist";
await app.register(staticFiles, {
  root: webRoot,
  setHeaders(res, path) {
    res.setHeader(
      "Cache-Control",
      path.includes("/assets/")
        ? "public, max-age=31536000, immutable"
        : "no-cache",
    );
  },
});
const tick = setInterval(() => {
  void hub.tick().catch((e) => console.error("Tick failed:", e.code || e.name));
}, 1000);
tick.unref();
const expiry = setInterval(() => {
  void pool
    .query("DELETE FROM sessions WHERE expires<$1", [Date.now()])
    .catch(() => {});
}, 3600000);
expiry.unref();
await app.listen({
  host: process.env.HOST || "127.0.0.1",
  port: Number(process.env.PORT || 3210),
});
async function stop() {
  if (stopping) return;
  stopping = true;
  clearInterval(tick);
  clearInterval(expiry);
  await hub.close();
  await app.close();
  await pool.end();
}
process.once("SIGTERM", () => {
  void stop().catch(() => process.exit(1));
});
process.once("SIGINT", () => {
  void stop().catch(() => process.exit(1));
});
