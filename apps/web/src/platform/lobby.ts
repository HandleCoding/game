import { shallowRef, ref } from "vue";
import type { State, GameMeta } from "../../../../packages/contracts/src/index";
export const state = shallowRef<State | null>(null),
  games = ref<GameMeta[]>([]),
  online = ref(0),
  connected = ref(false),
  pending = ref(false),
  toast = ref(""),
  authOpen = ref(false),
  now = ref(Date.now()),
  effect = ref<{
    kind: string;
    value?: string;
    hits?: number;
    point?: number;
    message?: string;
  } | null>(null);
let events: EventSource | null = null,
  offset = 0,
  toastTimer: ReturnType<typeof setTimeout>,
  effectTimer: ReturnType<typeof setTimeout>;
export function notify(text: string) {
  toast.value = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = ""), 3500);
}
export function showEffect(
  value: NonNullable<typeof effect.value>,
  duration = 2200,
) {
  effect.value = value;
  clearTimeout(effectTimer);
  if (duration) effectTimer = setTimeout(() => (effect.value = null), duration);
}
export async function api<T>(
  path: string,
  data?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const r = await fetch("/api/" + path, {
    signal,
    method: data === undefined ? "GET" : "POST",
    headers: data === undefined ? {} : { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const value = await r.json();
  if (!r.ok) {
    if (r.status === 401) signOut();
    const error = new Error(value.error || "暂时无法连接") as Error & {
      status: number;
    };
    error.status = r.status;
    throw error;
  }
  return value;
}
export function accept(value: State) {
  state.value = value;
  games.value = value.games;
  offset = value.serverNow - Date.now();
  now.value = Date.now() + offset;
}
export function signOut() {
  events?.close();
  events = null;
  state.value = null;
  connected.value = false;
}
export function connect() {
  events?.close();
  events = new EventSource("/api/events");
  events.onopen = () => (connected.value = true);
  events.onerror = () => (connected.value = false);
  events.addEventListener("state", (e) => accept(JSON.parse(e.data)));
  events.addEventListener("notice", (e) => notify(JSON.parse(e.data).message));
  events.addEventListener("logout", signOut);
  events.addEventListener("persistent-change", (e) =>
    window.dispatchEvent(
      new CustomEvent("playroom-persistent-change", {
        detail: JSON.parse(e.data),
      }),
    ),
  );
}
export async function perform(
  path: string,
  data: Record<string, unknown> = {},
) {
  if (pending.value) return;
  pending.value = true;
  try {
    let result: State;
    const room = state.value?.room;
    if (
      room &&
      path.startsWith("room/") &&
      !["room/create", "room/join"].includes(path)
    ) {
      result = await api<State>("rooms/" + room.code + "/actions", {
        type: path.slice(5),
        payload: data,
        requestId: crypto.randomUUID(),
        matchId: room.matchId,
        expectedRevision: room.revision,
      });
    } else result = await api<State>(path, data);
    if (path === "logout") {
      signOut();
      return;
    }
    accept(result);
    return result;
  } catch (error) {
    if ((error as { status?: number }).status === 409) {
      try {
        accept(await api<State>("state"));
      } catch {}
    }
    notify((error as Error).message);
    return undefined;
  } finally {
    pending.value = false;
  }
}
export async function invite(id: string) {
  if (!state.value) {
    authOpen.value = true;
    return;
  }
  if (!state.value.room)
    if (
      !(await perform("room/create", { gameId: "guess-number", seconds: 30 }))
    )
      return;
  if (await perform("invite", { to: id })) notify("邀请已发出，等对方回应");
}
export async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    notify("链接已复制");
  } catch {
    notify("请复制地址栏链接分享");
  }
}
export async function autoJoin() {
  const code = new URLSearchParams(location.search).get("room");
  if (code && state.value && !state.value.room) {
    if (await perform("room/join", { code })) history.replaceState({}, "", "/");
  }
}
export async function start() {
  try {
    const c = await api<{ games: GameMeta[]; online: number }>("catalog");
    games.value = c.games;
    online.value = c.online;
    try {
      accept(await api<State>("state"));
      connect();
      await autoJoin();
    } catch {}
  } catch {
    notify("暂时无法连接大厅");
  }
}
export function tick() {
  now.value = Date.now() + offset;
}
export function elapsed(start: number | null) {
  if (!start) return "";
  const s = Math.max(0, Math.floor((now.value - start) / 1000));
  return Math.floor(s / 60) + " 分 " + (s % 60) + " 秒";
}
export async function leave() {
  if (
    state.value?.room?.phase === "playing" &&
    !window.confirm("离开会结束当前对局，确定离开吗？")
  )
    return;
  await perform("room/leave");
}

export const activeGame = ref<string | null>(
  new URLSearchParams(location.search).get("game"),
);
export function openPersistent(id: string) {
  activeGame.value = id;
  history.replaceState({}, "", "/?game=" + encodeURIComponent(id));
  if (!state.value) authOpen.value = true;
}
export function closePersistent() {
  activeGame.value = null;
  history.replaceState({}, "", "/");
  void api("presence", { gameId: null }).catch(() => {});
}
