<script setup lang="ts">
import { useId } from "vue";
defineProps<{ index: number }>();
const clipId = "ranch-tool-" + useId();
</script>
<template>
  <svg
    class="ranch-icon"
    viewBox="0 0 100 100"
    aria-hidden="true"
    focusable="false"
  >
    <defs>
      <clipPath :id="clipId" clipPathUnits="userSpaceOnUse">
        <rect x="0" y="0" width="100" height="100" />
      </clipPath>
    </defs>
    <image
      href="/ranch/ui/ranch-tools-v1.png"
      :x="-(index % 3) * 100"
      :y="-Math.floor(index / 3) * 100"
      width="300"
      height="300"
      preserveAspectRatio="none"
      :clip-path="'url(#' + clipId + ')'"
    />
  </svg>
</template>
<style scoped>
.ranch-icon {
  display: block;
  overflow: hidden;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
</style>
