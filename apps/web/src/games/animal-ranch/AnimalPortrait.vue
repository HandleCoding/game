<script setup lang="ts">
import { computed } from "vue";
import type { RanchSpecies } from "../../../../../packages/contracts/src/ranch";
import { spriteLocation } from "./sprites";
import { atlasMetadata } from "./atlas-metadata";
const props = defineProps<{ species: RanchSpecies; name?: string }>();
const frame = computed(() => {
  const s = spriteLocation(props.species),
    m = atlasMetadata[s.group],
    row = m.rows[s.row];
  return {
    url: s.url,
    width: m.width,
    height: m.height,
    viewBox: "0 " + row[0] + " " + m.width / 4 + " " + (row[1] - row[0]),
  };
});
</script>
<template>
  <svg
    class="portrait"
    :viewBox="frame.viewBox"
    role="img"
    :aria-label="name || species"
    preserveAspectRatio="xMidYMid meet"
  >
    <image :href="frame.url" :width="frame.width" :height="frame.height" />
  </svg>
</template>
<style scoped>
.portrait {
  display: block;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
</style>
