<script setup lang="ts">
import { computed } from "vue";
import { state, invite, elapsed, connected, pending } from "./lobby";
const props = withDefaults(defineProps<{ canInvite?: boolean }>(), {
  canInvite: true,
});
const others = computed(
  () => state.value?.players.filter((p) => p.id !== state.value?.me.id) || [],
);
</script>
<template>
  <div class="section-label">
    <h2>在线玩家</h2>
    <span class="tag gray">{{ others.length }} 人</span>
  </div>
  <div class="online-list">
    <div v-for="(p, i) in others" :key="p.id" class="player-line">
      <div class="avatar" :class="{ alt: i % 2 === 0 }">
        {{ p.name.slice(0, 1) }}
      </div>
      <div class="details">
        <strong>{{ p.name }}</strong
        ><small v-if="!p.game">在线 · 可邀请</small
        ><small v-else
          >{{ p.game.name }} ·
          {{
            p.game.phase === "waiting"
              ? "等待开局"
              : p.game.phase === "finished"
                ? "对局结束"
                : "游戏中"
          }}<br /><span v-if="p.game.startedAt && p.game.phase !== 'finished'"
            >开局 {{ elapsed(p.game.startedAt) }}</span
          ></small
        >
      </div>
      <button
        :class="p.busy ? 'quiet small' : 'primary small'"
        :disabled="p.busy || !props.canInvite || !connected || pending"
        @click="invite(p.id)"
      >
        {{ p.busy ? "游戏中" : "邀请" }}
      </button>
    </div>
    <div v-if="!others.length" class="empty">
      还没有其他玩家在线。<br />分享大厅链接，叫大家一起玩吧。
    </div>
  </div>
</template>
