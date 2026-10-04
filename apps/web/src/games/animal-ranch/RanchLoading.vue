<script setup lang="ts">
defineProps<{
  progress?: number;
  completed?: number;
  total?: number;
  failed?: boolean;
  pending?: boolean;
}>();
defineEmits<{ retry: []; leave: [] }>();
</script>
<template>
  <section
    class="ranch-entry"
    aria-label="牧场加载"
    :aria-busy="!failed"
    data-testid="ranch-loading"
  >
    <div class="entry-card">
      <div class="entry-mark" aria-hidden="true">
        <svg viewBox="0 0 64 64" width="50" height="50">
          <path
            d="M32 53V30"
            stroke="#60853a"
            stroke-width="5"
            stroke-linecap="round"
          />
          <path d="M31 36C12 38 8 22 9 13c16-1 26 8 22 23Z" fill="#8fba56" />
          <path d="M33 28C32 12 46 7 56 9c0 14-9 22-23 19Z" fill="#b0ce70" />
          <path
            d="M20 55h24"
            stroke="#b59963"
            stroke-width="4"
            stroke-linecap="round"
          />
        </svg>
      </div>
      <p class="entry-eyebrow">一起牧场</p>
      <h2>{{ failed ? "小路有点堵，稍后再试试" : "正在走进你的牧场" }}</h2>
      <p class="entry-caption">
        {{
          failed
            ? "部分图片未能加载，已完成的资源会保留。"
            : pending
              ? "正在读取牧场存档…"
              : "铺好草地，让小动物们准备出门。"
        }}
      </p>
      <div class="entry-meter">
        <progress
          v-if="pending"
          max="100"
          aria-label="正在读取牧场存档"
        ></progress>
        <progress
          v-else
          :value="progress ?? ((completed || 0) / (total || 1)) * 100"
          :max="100"
          aria-label="牧场资源加载进度"
        ></progress>
        <span class="entry-percent">{{
          pending
            ? "准备中"
            : Math.floor(progress ?? ((completed || 0) / (total || 1)) * 100) +
              "%"
        }}</span>
      </div>
      <p class="entry-count" role="status">
        {{
          pending
            ? "你的伙伴正在等你"
            : (completed || 0) + " / " + (total || 0) + " 项资源已就绪"
        }}
      </p>
      <p class="entry-tip">
        {{
          failed
            ? "可以重试，或先回大厅。"
            : "首次进入需要一点时间，之后会更快。"
        }}
      </p>
      <div class="entry-actions">
        <button v-if="failed" class="entry-retry" @click="$emit('retry')">
          重新加载
        </button>
        <button class="entry-leave" @click="$emit('leave')">返回大厅</button>
      </div>
    </div>
  </section>
</template>
<style scoped>
.ranch-entry {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: max(20px, env(safe-area-inset-top)) 20px
    max(20px, env(safe-area-inset-bottom));
  background: radial-gradient(
    ellipse at 50% 25%,
    #f9f8dd,
    #e5edcb 65%,
    #cddfae
  );
  color: #435333;
}
.entry-card {
  width: min(100%, 420px);
  text-align: center;
}
.entry-mark {
  display: grid;
  place-items: center;
  margin: 0 auto 20px;
  width: 78px;
  height: 78px;
  border-radius: 28px;
  background: #fff9df;
  border: 2px solid #d4b985;
  box-shadow: 0 5px 0 #d9c39355;
}
.entry-mark span {
  font-size: 42px;
}
.entry-eyebrow {
  font-size: 13px;
  letter-spacing: 4px;
  color: #8a7446;
  margin: 0 0 10px;
}
h2 {
  font-size: clamp(22px, 5vw, 28px);
  margin: 0 0 12px;
}
.entry-caption {
  font-size: 14px;
  line-height: 1.7;
  margin: 0 0 28px;
}
.entry-meter {
  display: flex;
  align-items: center;
  gap: 12px;
}
progress {
  display: block;
  width: 100%;
  height: 14px;
  flex: 1;
  min-width: 0;
  border: 1px solid #b9bf91;
  border-radius: 20px;
  overflow: hidden;
  background: #d3dcb7;
  accent-color: #83ac44;
}
progress::-webkit-progress-bar {
  background: #d3dcb7;
  border-radius: 20px;
}
progress::-webkit-progress-value {
  background: linear-gradient(90deg, #92b959, #b0d775);
  border-radius: 20px;
}
progress::-moz-progress-bar {
  background: #92b959;
  border-radius: 20px;
}
.entry-percent {
  width: 46px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.entry-count {
  font-size: 13px;
  margin: 12px 0 26px;
}
.entry-tip {
  font-size: 12px;
  color: #738153;
  line-height: 1.7;
}
.entry-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-top: 20px;
}
.entry-actions button {
  min-height: 44px;
  padding: 10px 22px;
  border-radius: 22px;
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}
.entry-retry {
  border: 1px solid #698e35;
  background: #8db94c;
  color: #233319;
  font-weight: 700;
}
.entry-leave {
  border: 1px solid #9aaa7c;
  background: #ffffff50;
  color: #50603c;
}
@media (max-height: 480px) {
  .entry-mark {
    width: 50px;
    height: 50px;
    margin-bottom: 10px;
  }
  .entry-mark span {
    font-size: 30px;
  }
  .entry-caption {
    margin-bottom: 16px;
  }
  .entry-count {
    margin: 10px 0;
  }
  .entry-actions {
    margin-top: 10px;
  }
}
</style>
