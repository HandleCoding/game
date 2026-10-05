<script setup lang="ts">
withDefaults(
  defineProps<{ grade?: number; attributes?: string[]; protected?: boolean }>(),
  { grade: 0, attributes: () => [] },
);
const grades = ["普通", "优秀", "史诗", "传奇", "无双"];
const names: Record<string, string> = {
  lightning: "雷",
  fire: "火",
  water: "水",
  gold: "黄金",
  dream: "梦幻",
};
const symbols: Record<string, string> = {
  lightning: "ϟ",
  fire: "♨",
  water: "◉",
  gold: "✦",
  dream: "☾",
};
</script>
<template>
  <div class="ranch-traits" aria-label="伙伴品质与属性">
    <span class="quality-pill" :data-grade="grade">{{ grades[grade] }}</span>
    <span
      v-for="a in attributes"
      :key="a"
      class="attribute-pill"
      :data-attribute="a"
      >{{ symbols[a] }} {{ names[a] }}</span
    >
    <span v-if="protected" class="protected-pill">已珍藏</span>
  </div>
</template>
