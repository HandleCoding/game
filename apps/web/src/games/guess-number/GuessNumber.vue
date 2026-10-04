<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import {
  state,
  now,
  connected,
  pending,
  perform,
  leave,
  copy,
  showEffect,
} from "../../platform/lobby";
import PlayerList from "../../platform/PlayerList.vue";
import Dice from "./Dice.vue";
import type { RoomView } from "../../../../../packages/contracts/src/index";
const initialRoom = state.value!.room! as RoomView,
  myId = state.value!.me.id;
const room = computed(
    () => (state.value?.room as RoomView | null) || initialRoom,
  ),
  me = computed(() => room.value.players.find((p) => p.id === myId)!),
  other = computed(() => room.value.players.find((p) => p.id !== myId)),
  mine = computed(() => room.value.turn === myId),
  secret = ref(""),
  guess = ref(""),
  showSecret = ref(false),
  historyMode = ref("mine"),
  rolling = ref(false),
  rollingPoint = ref(1),
  frameFlash = ref(false);
const remaining = computed(() =>
  room.value.paused
    ? Math.ceil((room.value.remaining || 0) / 1000)
    : Math.max(
        0,
        Math.ceil(((room.value.deadline || now.value) - now.value) / 1000),
      ),
);
const ownTurn = computed(
  () =>
    mine.value && connected.value && !room.value.paused && remaining.value > 0,
);
const canGuess = computed(() => ownTurn.value && !pending.value);
const list = computed(() => {
  const result = room.value.history
    .map((h, index) => ({ ...h, index }))
    .filter(
      (h) =>
        historyMode.value === "all" ||
        (historyMode.value === "mine" ? h.player === myId : h.player !== myId),
    );
  return room.value.phase === "finished" ? result : result.reverse();
});
watch(
  () => [room.value.code, room.value.matchId, room.value.phase],
  () => {
    showSecret.value = false;
    historyMode.value = room.value.phase === "finished" ? "all" : "mine";
    if (room.value.phase !== "playing") guess.value = "";
    secret.value = "";
  },
  { immediate: true },
);
watch(
  () => ownTurn.value,
  (active) => {
    if (active) {
      frameFlash.value = false;
      requestAnimationFrame(() => (frameFlash.value = true));
    } else frameFlash.value = false;
  },
  { immediate: true },
);
function digits(event: Event, target: "secret" | "guess") {
  const value = (event.target as HTMLInputElement).value
    .replace(/[^0-9]/g, "")
    .slice(0, 4);
  if (target === "secret") secret.value = value;
  else guess.value = value;
}
async function submitGuess() {
  if (!canGuess.value) return;
  const result = await perform("room/guess", { value: guess.value });
  if (result) {
    guess.value = "";
    if (result.feedback && result.feedback.hits < 4)
      showEffect({ kind: "guess", ...result.feedback });
  }
}
async function settings(event: Event, key: "seconds" | "disableHistory") {
  const input = event.target as HTMLInputElement;
  await perform("room/settings", {
    seconds: key === "seconds" ? Number(input.value) : room.value.seconds,
    disableHistory:
      key === "disableHistory" ? input.checked : room.value.disableHistory,
  });
}
async function roll() {
  if (rolling.value || pending.value) return;
  rolling.value = true;
  const cycle = setInterval(
    () => (rollingPoint.value = 1 + Math.floor(Math.random() * 6)),
    80,
  );
  showEffect(
    { kind: "dice", point: rollingPoint.value, message: "骰子滚动中…" },
    0,
  );
  const timer = setInterval(
    () =>
      showEffect(
        { kind: "dice", point: rollingPoint.value, message: "骰子滚动中…" },
        0,
      ),
    100,
  );
  try {
    await new Promise((r) => setTimeout(r, 650));
    clearInterval(cycle);
    clearInterval(timer);
    const result = await perform("room/dice");
    if (result?.room) {
      const rolled = result.room as RoomView;
      showEffect(
        {
          kind: "dice",
          point:
            rolled.players.find((p) => p.id === myId)?.die ||
            rolled.lastTie?.[myId],
          message:
            rolled.phase === "dice" && rolled.lastTie
              ? "平局啦，再掷一次！"
              : "看看谁先出招",
        },
        1100,
      );
    }
  } finally {
    clearInterval(cycle);
    clearInterval(timer);
    rolling.value = false;
  }
}
function keyboard() {
  const v = window.visualViewport;
  document.documentElement.style.setProperty(
    "--keyboard-lift",
    Math.max(0, v ? window.innerHeight - v.height - v.offsetTop : 0) + "px",
  );
}
onMounted(() => {
  keyboard();
  window.visualViewport?.addEventListener("resize", keyboard);
  window.visualViewport?.addEventListener("scroll", keyboard);
  window.addEventListener("resize", keyboard);
});
onUnmounted(() => {
  window.visualViewport?.removeEventListener("resize", keyboard);
  window.visualViewport?.removeEventListener("scroll", keyboard);
  window.removeEventListener("resize", keyboard);
  document.documentElement.style.removeProperty("--keyboard-lift");
});
watch(
  () => room.value.phase,
  (phase, old) => {
    if (
      phase === "finished" &&
      old &&
      old !== "finished" &&
      room.value.reason === "guessed"
    )
      showEffect(
        {
          kind: "victory",
          message:
            room.value.winner === myId ? "这一局，你赢了！" : "下局再战！",
          value:
            room.value.revealed?.[
              room.value.winner === myId ? other.value!.id : myId
            ],
        },
        3000,
      );
  },
);
const roomLink = computed(() => location.origin + "/?room=" + room.value.code);
</script>
<template>
  <div
    id="turn-frame"
    :class="{ active: ownTurn, flash: frameFlash }"
    aria-hidden="true"
  ></div>
  <main class="shell" :class="{ 'with-guess-dock': room.phase === 'playing' }">
    <div class="room-header">
      <div>
        <span class="eyebrow">NUMBER DUEL</span>
        <div class="room-info" style="margin-top: 5px">
          <h1>猜数字</h1>
          <span class="room-code">#{{ room.code }}</span>
        </div>
      </div>
      <div class="actions">
        <button class="quiet small" @click="copy(roomLink)">邀请链接</button
        ><button class="quiet small" :disabled="pending" @click="leave">
          离开房间
        </button>
      </div>
    </div>
    <div class="room-grid">
      <div class="stack">
        <section class="card stage">
          <template v-if="room.phase === 'waiting'"
            ><span class="tag">开局准备</span>
            <h2>
              {{ other ? "人齐了，准备开始吧" : "房间开好了，等一位好友" }}
            </h2>
            <p>
              {{
                other
                  ? "两个人都准备后，再各自设置秘密数字。"
                  : "邀请在线好友，或者把房间链接发给他们。"
              }}
            </p>
            <div class="versus">
              <div class="contender">
                <div class="avatar">{{ me.name.slice(0, 1) }}</div>
                <strong>{{ me.name }}</strong
                ><span class="status-pill" :class="{ good: me.ready }">{{
                  me.ready ? "已准备" : "还没准备"
                }}</span>
              </div>
              <span class="vs">VS</span>
              <div class="contender">
                <div class="avatar alt" :class="{ 'waiting-slot': !other }">
                  {{ other?.name.slice(0, 1) || "＋" }}
                </div>
                <strong>{{ other?.name || "等待好友" }}</strong
                ><span class="status-pill" :class="{ good: other?.ready }">{{
                  other ? (other.ready ? "已准备" : "还没准备") : "空位等你"
                }}</span>
              </div>
            </div>
            <div class="room-settings">
              <label for="seconds">每回合</label
              ><select
                id="seconds"
                :value="room.seconds"
                :disabled="room.host !== me.id || pending || !connected"
                @change="settings($event, 'seconds')"
              >
                <option v-for="s in [15, 30, 45, 60, 90]" :key="s" :value="s">
                  {{ s }} 秒
                </option></select
              ><span class="muted">超时跳过</span>
            </div>
            <label class="memory-setting"
              ><input
                type="checkbox"
                :checked="room.disableHistory"
                :disabled="room.host !== me.id || pending || !connected"
                @change="settings($event, 'disableHistory')"
              /><span
                ><strong>禁用历史 · 记忆模式</strong
                ><small>对局中隐藏历史，结束后双方可复盘。</small></span
              ></label
            ><button
              :class="me.ready ? 'quiet' : 'primary'"
              :disabled="pending || !connected"
              @click="perform('room/ready', { ready: !me.ready })"
            >
              {{ me.ready ? "取消准备" : "我准备好了" }}</button
            ><button
              v-if="!other"
              class="quiet small"
              style="margin-top: 14px"
              @click="copy(roomLink)"
            >
              复制邀请链接
            </button></template
          >
          <template v-else-if="room.phase === 'secrets'"
            ><span class="tag">01 · 藏好你的数字</span>
            <h2>{{ me.secretSet ? "秘密已锁定" : "只有你知道的四位数" }}</h2>
            <p>
              {{
                me.secretSet
                  ? "等对方提交后，一起掷骰决定先手。"
                  : "输入 0000–9999 的四位数字，可以重复。"
              }}
            </p>
            <template v-if="me.secretSet"
              ><div class="locked">••••</div>
              <span class="tag green">已提交</span></template
            >
            <form
              v-else
              class="secret-form"
              @submit.prevent="perform('room/secret', { value: secret })"
            >
              <label for="secret">你的秘密数字</label
              ><input
                id="secret"
                :value="secret"
                @input="digits($event, 'secret')"
                type="password"
                class="digit-input"
                inputmode="numeric"
                pattern="[0-9]{4}"
                maxlength="4"
                minlength="4"
                autocomplete="off"
                placeholder="••••"
                required
              /><button
                type="submit"
                class="primary"
                :disabled="pending || !connected"
              >
                锁定秘密数字
              </button>
              <p class="hint">提交后本局不能修改，对方看不到。</p>
            </form>
            <div class="versus">
              <div v-for="p in room.players" :key="p.id" class="contender">
                <div class="avatar" :class="{ alt: p.id !== me.id }">
                  {{ p.name.slice(0, 1) }}
                </div>
                <strong>{{ p.name }}</strong
                ><span class="status-pill">{{
                  p.secretSet ? "已锁定" : "正在设置"
                }}</span>
              </div>
            </div></template
          >
          <template v-else-if="room.phase === 'dice'"
            ><span class="tag">02 · 掷骰决定先手</span>
            <h2>
              {{ room.diceRound > 1 ? "平局啦，再掷一次" : "看看谁先出招" }}
            </h2>
            <p>双方各掷一枚骰子，点数更高的人先猜。</p>
            <div class="versus">
              <div v-for="p in room.players" :key="p.id" class="contender">
                <div class="avatar" :class="{ alt: p.id !== me.id }">
                  {{ p.name.slice(0, 1) }}
                </div>
                <strong>{{ p.name }}</strong
                ><Dice :value="p.die" />
              </div>
            </div>
            <button
              class="primary"
              :disabled="
                !!me.die || room.paused || rolling || pending || !connected
              "
              @click="roll"
            >
              {{ me.die ? "等待对方掷骰" : "掷骰子" }}
            </button></template
          >
          <template v-else-if="room.phase === 'playing'"
            ><span class="tag" :class="{ green: mine }">{{
              mine ? "轮到你了" : "等待对方出招"
            }}</span>
            <div
              class="timer"
              :class="{ low: remaining <= 5 }"
              :style="{
                '--progress':
                  Math.min(100, (remaining / room.seconds) * 100) + '%',
              }"
            >
              <strong>{{ remaining }}</strong>
            </div>
            <h2 class="turn-label">
              {{ mine ? "猜猜对方的四位数" : other?.name + " 正在思考" }}
            </h2>
            <p>
              {{
                mine
                  ? "系统只告诉你命中了几位，不透露具体位置。"
                  : "可以先想一想你的下一步，输入草稿。"
              }}
            </p></template
          >
          <template v-else
            ><span class="tag" :class="{ green: room.winner === me.id }"
              >对局结束</span
            >
            <div class="result-mark">
              {{ room.winner === me.id ? "✦" : "◇" }}
            </div>
            <h2>
              {{
                room.winner === me.id
                  ? "这一局，你赢了！"
                  : room.winner
                    ? "好胜负，下局再来"
                    : "这局先到这里"
              }}
            </h2>
            <p>
              {{
                room.reason === "guessed"
                  ? "四个位置全部命中，答案揭晓。"
                  : room.reason === "left"
                    ? "有玩家离开了对局。"
                    : "重连时间已结束。"
              }}
            </p>
            <div class="reveal-grid">
              <div v-for="p in room.players" :key="p.id">
                <small>{{ p.name }} 的秘密</small
                ><strong>{{ room.revealed?.[p.id] || "未提交" }}</strong>
              </div>
            </div>
            <p class="hint">
              {{ room.turnCount }} 回合 · 每回合 {{ room.seconds }} 秒
            </p>
            <div class="actions" style="margin-top: 24px">
              <button
                class="primary"
                :disabled="pending || !connected"
                @click="perform('room/rematch')"
              >
                再来一局</button
              ><button class="quiet" @click="leave">回到大厅</button>
            </div></template
          >
          <div v-if="room.paused" class="pause-banner" role="status">
            好友暂时离线，倒计时已暂停。<span
              v-for="(deadline, id) in room.away"
              :key="id"
            >
              {{ Math.max(0, Math.ceil((deadline - now) / 1000)) }} 秒重连</span
            >
          </div>
        </section>
        <section v-if="room.phase === 'playing'" class="card">
          <div class="row spread">
            <div v-for="p in room.players" :key="p.id" class="player-line">
              <div class="avatar" :class="{ alt: p.id !== me.id }">
                {{ p.name.slice(0, 1) }}
              </div>
              <div class="details">
                <strong>{{ p.name }}{{ p.id === me.id ? "（你）" : "" }}</strong
                ><small>{{
                  !p.online
                    ? "暂时离线"
                    : p.id === room.turn
                      ? "正在猜测"
                      : "等待回合"
                }}</small>
              </div>
            </div>
          </div>
        </section>
      </div>
      <aside class="stack">
        <section v-if="room.phase === 'waiting'" class="card">
          <PlayerList :can-invite="room.players.length < 2" />
        </section>
        <section v-else class="card">
          <div class="secret-info">
            <div class="row spread">
              <label>我的秘密</label
              ><button
                class="quiet small"
                :disabled="!room.ownSecret"
                @click="showSecret = !showSecret"
              >
                {{ showSecret ? "隐藏" : "查看" }}
              </button>
            </div>
            <div class="secret-digits" style="margin-top: 8px">
              {{
                room.ownSecret
                  ? showSecret
                    ? room.ownSecret
                    : "••••"
                  : "尚未设置"
              }}
            </div>
          </div>
          <template v-if="room.disableHistory && room.phase !== 'finished'"
            ><h2>记忆模式</h2>
            <p class="history-note">
              对局中隐藏历史列表，仅显示对方最近一次猜测。结束后开放双方完整记录。
            </p>
            <span class="tag gray">历史记录已禁用</span></template
          ><template v-else
            ><div class="section-label">
              <h2>{{ room.phase === "finished" ? "对局复盘" : "猜测记录" }}</h2>
              <span class="tag gray">{{ room.history.length }}</span>
            </div>
            <div class="history-tabs">
              <button
                v-for="(label, key) in {
                  mine: '我的猜测',
                  other: '对方猜测',
                  all: '全部',
                }"
                :key="key"
                :class="{ active: historyMode === key }"
                @click="historyMode = key"
              >
                {{ label }}
              </button>
            </div>
            <div class="history-list">
              <div v-for="h in list" :key="h.index" class="history-line">
                <div>
                  <span :class="h.timeout ? 'muted' : 'guess-digits'">{{
                    h.timeout ? "本回合超时" : h.value
                  }}</span
                  ><small
                    >{{ room.players.find((p) => p.id === h.player)?.name }} ·
                    第 {{ h.index + 1 }} 回合</small
                  >
                </div>
                <span class="hit-count" :class="{ all: h.hits === 4 }">{{
                  h.timeout ? "跳过" : h.hits + " 位命中"
                }}</span>
              </div>
              <div v-if="!list.length" class="empty">
                还没有猜测记录。<br />每次出招，都会留在这里。
              </div>
            </div>
            <p class="history-note">
              {{
                room.phase === "finished"
                  ? "双方的猜测与命中数量已公开，按回合顺序查看。"
                  : "只比较相同位置。不会标出命中的是哪一位。"
              }}
            </p></template
          >
        </section>
      </aside>
    </div>
    <section
      v-if="room.phase === 'playing'"
      class="guess-dock"
      :class="{ 'my-turn': mine }"
      aria-label="猜测输入区"
    >
      <div class="opponent-summary">
        <div class="row spread">
          <strong>{{ other?.name || "对方" }}</strong
          ><span class="opponent-status">{{
            room.paused
              ? "对局已暂停"
              : !other?.online
                ? "暂时离线"
                : mine
                  ? "等待你的猜测"
                  : "正在思考"
          }}</span>
        </div>
        <div v-if="room.disableHistory" class="latest-opponent" role="status">
          <template v-if="room.lastOpponentGuess"
            >上次猜测 <strong>{{ room.lastOpponentGuess.value }}</strong
            ><span class="tag"
              >{{ room.lastOpponentGuess.hits }} 位命中</span
            ></template
          ><template v-else>对方还没有提交过猜测</template>
        </div>
        <p v-else class="dock-note">
          {{
            mine
              ? "轮到你了，可以边看记录边输入。"
              : "可以先输入草稿，轮到你后再提交。"
          }}
        </p>
      </div>
      <form class="guess-form" @submit.prevent="submitGuess">
        <div class="row spread">
          <label for="guess">你的猜测</label
          ><span class="dock-turn"
            >{{ mine ? "轮到你" : "等待对方" }} ·
            <strong>{{ remaining }}</strong> 秒</span
          >
        </div>
        <div class="row">
          <input
            id="guess"
            :value="guess"
            @input="digits($event, 'guess')"
            class="digit-input"
            inputmode="numeric"
            pattern="[0-9]{4}"
            maxlength="4"
            minlength="4"
            autocomplete="off"
            placeholder="0000"
            required
            :disabled="!connected || room.paused"
          /><button type="submit" class="primary" :disabled="!canGuess">
            {{ mine ? "提交猜测" : "等待回合" }}
          </button>
        </div>
      </form>
    </section>
    <footer class="footer">两人准备 · 数字可重复 · 只算同位置命中</footer>
  </main>
</template>
