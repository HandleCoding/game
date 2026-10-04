<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from "vue";
import LobbyView from "./platform/LobbyView.vue";
import Dice from "./games/guess-number/Dice.vue";
import { gameViews, persistentViews } from "./games/registry";
import {
  state,
  activeGame,
  closePersistent,
  connected,
  pending,
  toast,
  authOpen,
  now,
  effect,
  api,
  accept,
  connect,
  autoJoin,
  start,
  tick,
  perform,
  signOut,
} from "./platform/lobby";
import type { State } from "../../../packages/contracts/src/index";
const mode = ref("login"),
  account = ref(""),
  password = ref(""),
  name = ref(""),
  error = ref(""),
  authDialog = ref<HTMLDialogElement | null>(null),
  inviteDialog = ref<HTMLDialogElement | null>(null),
  theme = ref(document.documentElement.dataset.theme || "light");
const invitation = computed(() =>
  !state.value?.room
    ? state.value?.invites.find((i) => i.expires > now.value)
    : undefined,
);
watch(authOpen, async (opened) => {
  await nextTick();
  if (opened) {
    authDialog.value?.showModal();
    authDialog.value?.querySelector("input")?.focus();
  }
});
watch(
  () => invitation.value?.id,
  async (id) => {
    await nextTick();
    if (id) inviteDialog.value?.showModal();
  },
  { immediate: true },
);
async function login() {
  if (pending.value) return;
  pending.value = true;
  error.value = "";
  try {
    await api(mode.value === "login" ? "login" : "register", {
      account: account.value,
      password: password.value,
      ...(mode.value === "register" ? { name: name.value } : {}),
    });
    password.value = "";
    accept(await api<State>("state"));
    authOpen.value = false;
    connect();
    pending.value = false;
    await autoJoin();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    pending.value = false;
  }
}
async function logout() {
  if (
    state.value?.room?.phase === "playing" &&
    !confirm("退出会结束当前对局，确定退出吗？")
  )
    return;
  await perform("logout");
}
function toggleTheme() {
  window.playroomTheme.toggle();
}
function syncTheme() {
  theme.value = document.documentElement.dataset.theme || "light";
}
let timer: ReturnType<typeof setInterval>;
onMounted(() => {
  void start();
  timer = setInterval(tick, 200);
  window.addEventListener("playroom-theme-change", syncTheme);
});
onUnmounted(() => {
  clearInterval(timer);
  signOut();
  window.removeEventListener("playroom-theme-change", syncTheme);
});
const messages = [
  "换个思路，再试一次",
  "找到一条线索！",
  "一半命中，继续推理",
  "就差一位了！",
];
</script>
<template>
  <header class="topbar">
    <div class="brand">
      <span class="brandmark"
        ><svg
          class="icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
        >
          <rect x="3" y="5" width="18" height="14" rx="4" />
          <path d="M7 12h4m-2-2v4m7-3h.01m2 3h.01" /></svg
      ></span>
      <div>一起玩<small>PLAYROOM</small></div>
    </div>
    <nav aria-label="主导航">
      <button class="quiet small nav-active" @click="closePersistent">
        游戏大厅
      </button>
    </nav>
    <div class="header-actions">
      <button
        class="quiet theme-toggle"
        :aria-label="theme === 'light' ? '切换到夜间模式' : '切换到日间模式'"
        @click="toggleTheme"
      >
        <svg
          class="icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
        >
          <path
            v-if="theme === 'light'"
            d="M20.9 13.3A9 9 0 0 1 10.7 3.1 9 9 0 1 0 20.9 13.3Z"
          />
          <template v-else>
            <circle cx="12" cy="12" r="4" />
            <path
              d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
            />
          </template>
        </svg>
      </button>
      <div v-if="state" class="row player-account">
        <span class="connection" :class="{ off: !connected }"
          ><span class="dot"></span
          >{{ connected ? "大厅已连接" : "正在连接…" }}</span
        >
        <div class="avatar">{{ state.me.name.slice(0, 1) }}</div>
        <strong class="mobile-name">{{ state.me.name }}</strong
        ><button class="quiet small" :disabled="pending" @click="logout">
          退出
        </button>
      </div>
      <button v-else class="primary small" @click="authOpen = true">
        登录 / 注册
      </button>
    </div>
  </header>
  <div
    v-if="state && !connected"
    id="network-banner"
    class="pause-banner"
    role="status"
  >
    正在重新连接，请稍候…
  </div>
  <component
    v-if="state?.room && gameViews[state.room.gameId]"
    :is="gameViews[state.room.gameId]"
    :key="state.room.code"
  /><component
    v-else-if="state && activeGame && persistentViews[activeGame]"
    :is="persistentViews[activeGame]"
    :key="state.me.id + activeGame"
  /><LobbyView v-else />
  <Teleport to="body"
    ><dialog
      v-if="authOpen"
      id="auth-dialog"
      ref="authDialog"
      aria-labelledby="auth-title"
      @cancel.prevent="authOpen = false"
    >
      <div class="row spread">
        <h2 id="auth-title">
          {{ mode === "login" ? "登录一起玩" : "创建账号" }}
        </h2>
        <button
          class="quiet small"
          aria-label="关闭登录弹窗"
          @click="authOpen = false"
        >
          关闭
        </button>
      </div>
      <p class="muted">登录后，可以继续牧场进度或邀请好友开一局。</p>
      <div class="tabs">
        <button
          :class="{ active: mode === 'login' }"
          @click="
            mode = 'login';
            error = '';
          "
        >
          登录</button
        ><button
          :class="{ active: mode === 'register' }"
          @click="
            mode = 'register';
            error = '';
          "
        >
          创建账号
        </button>
      </div>
      <form @submit.prevent="login">
        <div v-if="mode === 'register'" class="field">
          <label for="name">昵称</label
          ><input
            id="name"
            v-model="name"
            maxlength="16"
            placeholder="大家怎么称呼你"
            required
            autocomplete="nickname"
          />
        </div>
        <div class="field">
          <label for="account">账号</label
          ><input
            id="account"
            v-model="account"
            minlength="3"
            maxlength="24"
            pattern="[a-zA-Z0-9_]{3,24}"
            placeholder="字母、数字或下划线"
            required
            autocomplete="username"
          />
        </div>
        <div class="field">
          <label for="password">密码</label
          ><input
            id="password"
            v-model="password"
            type="password"
            minlength="8"
            maxlength="128"
            placeholder="至少 8 个字符"
            required
            :autocomplete="
              mode === 'login' ? 'current-password' : 'new-password'
            "
          />
        </div>
        <button
          type="submit"
          class="primary"
          style="width: 100%"
          :disabled="pending"
        >
          {{ mode === "login" ? "进入大厅" : "创建账号并进入" }}
        </button>
        <p class="error" role="alert">{{ error }}</p>
      </form>
    </dialog>
    <dialog
      v-if="invitation"
      ref="inviteDialog"
      class="invitation-dialog"
      aria-labelledby="invitation-title"
      @cancel.prevent="
        perform('invite/respond', { id: invitation.id, accept: false })
      "
    >
      <span class="tag">收到游戏邀请</span>
      <h2 id="invitation-title">{{ invitation.name }} 邀请你一起玩</h2>
      <h3>{{ invitation.gameName }}</h3>
      <p class="invitation-meta">
        每回合 {{ invitation.seconds }} 秒 ·
        {{
          invitation.disableHistory ? "记忆模式，禁用历史" : "可以查看历史记录"
        }}
      </p>
      <div class="invitation-count">
        <strong>{{
          Math.max(0, Math.ceil((invitation.expires - now) / 1000))
        }}</strong
        ><span>秒后自动拒绝</span>
      </div>
      <div class="invitation-progress">
        <i
          :style="{
            width: Math.max(0, (invitation.expires - now) / 150) + '%',
          }"
        ></i>
      </div>
      <div class="actions">
        <button
          class="quiet"
          :disabled="pending || !connected"
          @click="
            perform('invite/respond', { id: invitation.id, accept: false })
          "
        >
          拒绝</button
        ><button
          class="primary"
          :disabled="pending || !connected"
          @click="
            perform('invite/respond', { id: invitation.id, accept: true })
          "
        >
          接受邀请
        </button>
      </div>
    </dialog>
    <div
      id="toast"
      class="toast"
      :class="{ show: !!toast }"
      role="status"
      aria-live="polite"
    >
      {{ toast }}
    </div>
    <div id="effects" aria-live="polite">
      <template v-if="effect"
        ><template v-if="effect.kind === 'victory'"
          ><i
            v-for="i in 28"
            :key="i"
            class="confetti"
            :style="{
              '--x': ((i * 37) % 100) + '%',
              '--delay': (i % 7) * 0.08 + 's',
              '--travel': (i % 2 ? 1 : -1) * (30 + (i % 5) * 12) + 'px',
              '--color': ['#b3a2ff', '#a2e8c0', '#ffc979', '#f3a8dc'][i % 4],
            }"
          ></i>
          <div class="feedback-fx victory-fx">
            <div class="victory-symbol">✦</div>
            <span class="effect-label">答案揭晓</span>
            <h2>{{ effect.message }}</h2>
            <strong class="answer-effect">{{ effect.value }}</strong>
          </div></template
        >
        <div v-else-if="effect.kind === 'dice'" class="feedback-fx roll-fx">
          <Dice
            :value="effect.point"
            :rolling="effect.message === '骰子滚动中…'"
          />
          <h2>{{ effect.message }}</h2>
        </div>
        <div v-else class="feedback-fx" :class="'hit-' + effect.hits">
          <span class="effect-label">{{ effect.value }} · 本次猜测</span>
          <div class="hit-display">
            <strong>{{ effect.hits }}</strong
            ><span>位命中</span>
          </div>
          <div class="hit-meter">
            <i :style="{ width: (effect.hits || 0) * 25 + '%' }"></i>
          </div>
          <p>{{ messages[effect.hits || 0] }}</p>
        </div></template
      >
    </div></Teleport
  >
</template>
