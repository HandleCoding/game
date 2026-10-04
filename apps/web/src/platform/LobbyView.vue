<script setup lang="ts">
import { ref } from "vue";
import PlayerList from "./PlayerList.vue";
import {
  state,
  games,
  online,
  authOpen,
  perform,
  copy,
  pending,
} from "./lobby";
import type { GameMeta } from "../../../../packages/contracts/src/index";
const lobbyUrl = location.origin + "/",
  code = ref(""),
  rules = ref<GameMeta | null>(null);
async function create(gameId: string) {
  if (!state.value) {
    authOpen.value = true;
    return;
  }
  await perform("room/create", { gameId, seconds: 30 });
}
async function join() {
  if (!state.value) {
    history.replaceState({}, "", "/?room=" + encodeURIComponent(code.value));
    authOpen.value = true;
    return;
  }
  await perform("room/join", { code: code.value });
}
</script>
<template>
  <main class="shell">
    <div class="page-title">
      <span class="eyebrow">PLAYROOM / LOBBY</span>
      <div class="row spread" style="margin-top: 8px">
        <h1>游戏大厅</h1>
        <button class="quiet small" @click="copy(lobbyUrl)">分享大厅</button>
      </div>
      <p>
        {{
          state
            ? state.me.name + "，选个游戏，叫上好友开一局。"
            : "选个游戏，和好友一起玩。"
        }}
      </p>
    </div>
    <div class="lobby-grid">
      <div class="stack">
        <section>
          <div class="section-label">
            <h2>
              所有游戏 <span class="list-count">{{ games.length }}</span>
            </h2>
            <span class="muted">与好友开房游玩</span>
          </div>
          <div class="game-grid">
            <article
              v-for="game in games"
              :key="game.id"
              class="card game-card"
            >
              <div class="game-cover">
                <div class="number-art" aria-hidden="true">
                  <span>?</span><span>2</span><span>?</span><span>4</span>
                </div>
                <span class="cover-label">{{ game.name }}</span>
              </div>
              <div class="game-body">
                <div class="row spread">
                  <h2>{{ game.name }}</h2>
                  <span class="tag">{{ game.category }}</span>
                </div>
                <p>{{ game.description }}</p>
                <div class="meta">
                  <span
                    >{{
                      game.minPlayers === game.maxPlayers
                        ? game.minPlayers
                        : game.minPlayers + "–" + game.maxPlayers
                    }}
                    位玩家</span
                  ><span>{{ game.defaultSeconds }} 秒 / 回合</span>
                </div>
                <div class="game-actions">
                  <button
                    class="primary"
                    :disabled="pending"
                    @click="create(game.id)"
                  >
                    创建房间</button
                  ><button class="quiet" @click="rules = game">玩法说明</button>
                </div>
              </div>
            </article>
          </div>
        </section>
      </div>
      <aside class="stack">
        <section class="card">
          <PlayerList v-if="state" /><template v-else
            ><div class="section-label">
              <h2>在线玩家</h2>
              <span class="tag gray">{{ online }} 人</span>
            </div>
            <div class="empty">
              登录后查看所有在线玩家，<br />直接邀请一起玩。
            </div>
            <button class="quiet" style="width: 100%" @click="authOpen = true">
              登录查看玩家
            </button></template
          >
          <div v-if="state" class="stats">
            <div>
              <strong>{{ state.stats.played }}</strong
              ><span>完成对局</span>
            </div>
            <div>
              <strong>{{ state.stats.wins }}</strong
              ><span>获胜次数</span>
            </div>
          </div>
        </section>
        <section class="card">
          <h3>加入好友的房间</h3>
          <form class="join" style="margin-top: 14px" @submit.prevent="join">
            <input
              v-model="code"
              aria-label="六位房间码"
              inputmode="numeric"
              pattern="[0-9]{6}"
              maxlength="6"
              placeholder="6 位房间码"
              required
            /><button type="submit" :disabled="pending">加入</button>
          </form>
        </section>
        <section v-if="state?.recent.length" class="card">
          <h3>最近对局</h3>
          <div
            v-for="r in state.recent.slice(0, 4)"
            :key="r.id"
            class="activity"
          >
            <span :class="r.winner === state.me.id ? 'won' : 'muted'">{{
              r.winner === state.me.id
                ? "赢了一局"
                : r.winner
                  ? "下次再战"
                  : "对局结束"
            }}</span
            ><span class="muted">{{ r.turns }} 回合</span>
          </div>
        </section>
      </aside>
    </div>
    <footer class="footer">一起玩 · 好友游戏大厅</footer>
  </main>
  <div v-if="rules" class="modal-backdrop" @click.self="rules = null">
    <section
      class="card modal-card"
      role="dialog"
      aria-modal="true"
      aria-label="玩法说明"
    >
      <h2>{{ rules.name }} · 玩法说明</h2>
      <p v-for="rule in rules.rules" :key="rule">{{ rule }}</p>
      <button class="primary" @click="rules = null">知道了</button>
    </section>
  </div>
</template>
