<script setup lang="ts">
import { computed, useId } from "vue";
import type { RanchSpecies } from "../../../../../packages/contracts/src/ranch";
import { spriteLocation } from "./sprites";
import { softAtlasMetadata } from "./soft-atlas-metadata";
const props = defineProps<{
  species: RanchSpecies;
  name?: string;
  baby?: boolean;
}>();
const clipId = "ranch-portrait-" + useId();
const frame = computed(() => {
  const s = spriteLocation(props.species, props.baby),
    m = softAtlasMetadata[s.group],
    row = m.rows[s.row];
  return {
    url: s.url,
    width: m.width,
    height: m.height,
    crop: row,
    viewBox: row.x + " " + row.y + " " + row.width + " " + row.height,
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
    <defs>
      <clipPath :id="clipId" clipPathUnits="userSpaceOnUse">
        <rect
          :x="frame.crop.x"
          :y="frame.crop.y"
          :width="frame.crop.width"
          :height="frame.crop.height"
        />
      </clipPath>
    </defs>
    <!-- The viewport can include letterboxing; clip the atlas itself to one frame. -->
    <image
      :href="frame.url"
      :width="frame.width"
      :height="frame.height"
      :clip-path="'url(#' + clipId + ')'"
    />
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
