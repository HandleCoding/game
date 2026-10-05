<script setup lang="ts">
import { computed } from "vue";
const props = defineProps<{ product: string }>();
const kind = computed(() => {
  const groups: Record<string, string> = {
    "duck-gift": "egg",
    "goose-gift": "egg",
    "sheep-gift": "wool",
    "alpaca-gift": "wool",
    "buffalo-gift": "milk",
    "parrot-gift": "feather",
    "peacock-gift": "feather",
    "owl-gift": "feather",
    "horse-gift": "shoe",
    "bear-gift": "honey",
    "monkey-gift": "fruit",
    "pig-gift": "feed",
  };
  return (
    groups[props.product] ||
    (props.product.includes("egg")
      ? "egg"
      : props.product.includes("milk")
        ? "milk"
        : /fur|wool/.test(props.product)
          ? "wool"
          : "gift")
  );
});
</script>
<template>
  <svg class="product-icon" viewBox="0 0 80 80" aria-hidden="true">
    <ellipse cx="40" cy="67" rx="23" ry="5" fill="#152f1810" />
    <g v-if="kind === 'egg'" stroke="#d9cba9" stroke-width="2">
      <path
        d="M18 47C18 28 27 12 37 12s20 19 20 35c0 26-39 26-39 0"
        fill="#fffaf0"
      />
      <path
        d="M39 54c0-13 6-26 15-26s15 14 15 27c0 19-30 19-30-1"
        fill="#f6ddb0"
      />
      <path
        d="M27 35q2-9 7-12"
        fill="none"
        stroke="#fff"
        stroke-width="5"
        stroke-linecap="round"
      />
    </g>
    <g v-else-if="kind === 'milk'" stroke="#aac6c3" stroke-width="2">
      <path d="M28 22v9l-6 10v24q18 7 36 0V41l-6-10v-9" fill="#f8fffc" />
      <rect x="27" y="14" width="26" height="10" rx="4" fill="#81bcb3" />
      <rect x="22" y="44" width="36" height="15" fill="#d5ece3" />
      <path d="M40 45c-12 13 12 13 0 0" fill="#6ba994" stroke="none" />
    </g>
    <g v-else-if="kind === 'wool'">
      <path
        d="M14 40a14 14 0 0 1 13-19 16 16 0 0 1 28 0 14 14 0 0 1 14 19 15 15 0 0 1-12 24H26A15 15 0 0 1 14 40"
        fill="#f7f4ee"
        stroke="#d7cfc1"
        stroke-width="2"
      />
      <path
        d="M28 42q-8-9 1-15m7 22q-9-8 0-14m10 18q-9-8 0-14m10 4q-6-9 0-14"
        fill="none"
        stroke="#e4ddd1"
        stroke-width="3"
        stroke-linecap="round"
      />
    </g>
    <g v-else-if="kind === 'feather'">
      <path
        d="M22 62C8 39 22 10 62 13c-2 29-15 49-40 49"
        fill="#84bec0"
        stroke="#529a9b"
        stroke-width="2"
      />
      <path
        d="m16 70 40-50M30 50l-8-12m18 2-9-15m0 25 17-2m-8-8 16-4"
        stroke="#dff0da"
        stroke-width="2"
        fill="none"
      />
    </g>
    <g v-else-if="kind === 'shoe'">
      <path
        d="M19 48V30a21 21 0 0 1 42 0v18l-9 8V30a12 12 0 0 0-24 0v26z"
        fill="#a5b9bc"
        stroke="#728e96"
        stroke-width="3"
      />
      <path
        d="M23 47v-8m0-8 2-8m30 24v-8m0-8-2-8"
        fill="none"
        stroke="#edf5f4"
        stroke-width="3"
        stroke-linecap="round"
      />
    </g>
    <g v-else-if="kind === 'honey'">
      <rect
        x="20"
        y="24"
        width="40"
        height="40"
        rx="12"
        fill="#ebbf54"
        stroke="#c79943"
        stroke-width="2"
      />
      <rect x="23" y="14" width="34" height="12" rx="4" fill="#b59b70" />
      <rect x="23" y="35" width="34" height="19" rx="3" fill="#fff0c7" />
      <path d="m40 39 6 4v7l-6 3-6-3v-7z" fill="#d99b31" />
    </g>
    <g v-else-if="kind === 'fruit'">
      <path
        d="M17 42h46l-5 23H22z"
        fill="#dcb47b"
        stroke="#b58c5e"
        stroke-width="2"
      />
      <path
        d="M22 43c-3-27 39-27 36 0"
        fill="none"
        stroke="#b58c5e"
        stroke-width="5"
      />
      <circle cx="29" cy="40" r="10" fill="#df9276" />
      <circle cx="46" cy="38" r="11" fill="#d8c373" />
      <path d="m32 27-5-5m18 4 7-6" stroke="#65945e" stroke-width="4" />
      <path
        d="M19 52h42m-34-7 3 19m11-19v19m11-19-3 19"
        stroke="#efd5a8"
        stroke-width="2"
      />
    </g>
    <g v-else-if="kind === 'feed'">
      <path
        d="M22 22h36l-4 16 9 26H17l9-26z"
        fill="#d9bc83"
        stroke="#b1945b"
        stroke-width="2"
      />
      <path
        d="M25 29h30M40 57V39m0 9-9-6m9 1 9-6"
        stroke="#72945a"
        stroke-width="3"
      />
      <path d="M26 39h28" stroke="#a68754" stroke-width="3" />
    </g>
    <g v-else>
      <path d="m24 17 16 6 16-6-5 28H29z" fill="#9ebed1" />
      <circle
        cx="40"
        cy="48"
        r="21"
        fill="#ecc765"
        stroke="#cdab4f"
        stroke-width="2"
      />
      <path
        d="m40 32 4 10 11 1-8 7 2 11-9-6-9 6 2-11-8-7 11-1z"
        fill="#fff1b9"
      />
    </g>
  </svg>
</template>
