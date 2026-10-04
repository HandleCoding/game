<script setup lang="ts">
defineProps<{ value?: number | null; rolling?: boolean }>();
const dots: Record<number, number[]> = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};
</script>
<template>
  <div
    class="dice"
    :class="{ pending: !value, 'rolling-die': rolling }"
    :aria-label="value ? '骰子 ' + value + ' 点' : '等待掷骰'"
  >
    <template v-if="value"
      ><i
        v-for="i in 9"
        :key="i"
        :class="{ blank: !dots[value]?.includes(i) }"
      ></i></template
    ><template v-else>?</template>
  </div>
</template>
