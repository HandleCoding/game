<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import type { RanchAnimalView } from "../../../../../packages/contracts/src/ranch";
import { spriteLocation } from "./sprites";
import { atlasMetadata } from "./atlas-metadata";
const props = defineProps<{
  animals: RanchAnimalView[];
  chosen: string | null;
  owner: boolean;
  effect: { type: string; id: number } | null;
}>();
const emit = defineEmits<{ select: [id: string]; feed: []; shop: [] }>();
const canvas = ref<HTMLCanvasElement | null>(null),
  ready = ref(false),
  failure = ref(false),
  zoom = ref(1),
  frozen = ref(false);
type Walker = {
  id: string;
  x: number;
  y: number;
  tx: number;
  ty: number;
  until: number;
  state: "walk" | "idle" | "eat";
  dir: number;
  phase: number;
};
const walkers = new Map<string, Walker>(),
  sheets: HTMLImageElement[] = [],
  background = new Image();
let disposed=false;
let frame = 0,
  last = 0,
  elapsed = 0,
  width = 0,
  height = 0,
  dpr = 1,
  scale = 1,
  offsetX = 0,
  offsetY = 0,
  cameraX = 600,
  cameraY = 405,
  resize: ResizeObserver | undefined;
let dragging = false,
  moved = false,
  startX = 0,
  startY = 0,
  dragX = 0,
  dragY = 0,
  effectAt = -9999,
  liveEffect = "";
const pointers = new Map<number, { x: number; y: number }>();
let pinchDistance = 0,
  pinchZoom = 1;
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
frozen.value = reduced.matches;
function randomSeed(id: string) {
  let n = 0;
  for (const c of id) n = (n * 31 + c.charCodeAt(0)) >>> 0;
  return n;
}
function sync() {
  const ids = new Set(props.animals.map((a) => a.id));
  for (const id of walkers.keys()) if (!ids.has(id)) walkers.delete(id);
  props.animals.forEach((a, i) => {
    if (!walkers.has(a.id)) {
      const seed = randomSeed(a.id);
      const x = 410 + (i % 4) * 135 + (seed % 25),
        y = 360 + Math.floor(i / 4) * 85;
      walkers.set(a.id, {
        id: a.id,
        x,
        y,
        tx: x,
        ty: y,
        until: elapsed + 1 + (i % 3),
        state: "idle",
        dir: 1,
        phase: seed % 100,
      });
    }
  });
}
function getImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(url));
    img.src = url;
  });
}
function measure() {
  const element = canvas.value;
  if (!element) return;
  const box = element.getBoundingClientRect();
  const first = width === 0;
  width = box.width;
  height = box.height;
  if (first)
    zoom.value =
      Math.max(width / 1200, height / 800) /
      Math.min(width / 1200, height / 800);
  dpr = Math.min(devicePixelRatio || 1, 2);
  element.width = Math.round(width * dpr);
  element.height = Math.round(height * dpr);
}
function clampCamera() {
  const fit = Math.min(width / 1200, height / 800);
  scale = fit * zoom.value;
  const visibleW = width / scale,
    visibleH = height / scale;
  cameraX =
    visibleW >= 1200
      ? 600
      : Math.max(visibleW / 2, Math.min(1200 - visibleW / 2, cameraX));
  cameraY =
    visibleH >= 800
      ? 400
      : Math.max(visibleH / 2, Math.min(800 - visibleH / 2, cameraY));
  offsetX = width / 2 - cameraX * scale;
  offsetY = height / 2 - cameraY * scale;
}
function roundBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r = 8,
) {
  ctx.beginPath();
  ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();
}
function tag(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
) {
  ctx.font = "bold 15px system-ui";
  const w = ctx.measureText(text).width + 22;
  ctx.fillStyle = color;
  roundBox(ctx, x - w / 2, y - 12, w, 27);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.fillText(text, x, y + 6);
}
function draw(now: number) {
  if(disposed)return;
  frame = requestAnimationFrame(draw);
  if (document.hidden) {
    last = now;
    return;
  }
  const dt = Math.min((now - last) / 1000 || 0, 0.06);
  last = now;
  if (!frozen.value) elapsed += dt;
  const element = canvas.value,
    ctx = element?.getContext("2d");
  if (!ctx || !width || !ready.value) return;
  clampCamera();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#b9daa2";
  ctx.fillRect(0, 0, width, height);
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);
  ctx.drawImage(background, 0, 0, 1200, 800);
  for (const a of props.animals) {
    const w = walkers.get(a.id);
    if (!w) continue;
    if (a.hungry) w.state="idle";
    if (!frozen.value && !a.hungry && a.id !== props.chosen) {
      if (w.state === "walk") {
        const dx = w.tx - w.x,
          dy = w.ty - w.y,
          d = Math.hypot(dx, dy);
        if (d < 4) {
          w.state =
            liveEffect === "buyFeed" && elapsed - effectAt < 10
              ? "eat"
              : "idle";
          w.until = elapsed + 2 + (w.phase % 4);
        } else {
          w.x += (dx / d) * dt * 27;
          w.y += (dy / d) * dt * 27;
          w.dir = dx >= 0 ? 1 : -1;
        }
      } else if (elapsed > w.until) {
        const p = w.phase++ * 1.71;
        w.tx = 340 + (Math.sin(p) * 0.5 + 0.5) * 600;
        w.ty = 330 + (Math.cos(p * 0.7) * 0.5 + 0.5) * 270;
        w.state = "walk";
      }
    }
  }
  const sorted = [...props.animals].sort(
    (a, b) => (walkers.get(a.id)?.y || 0) - (walkers.get(b.id)?.y || 0),
  );
  for (const a of sorted) {
    const w = walkers.get(a.id);
    if (!w) continue;
    const location = spriteLocation(a.species),
      sheet = sheets[location.group];
    if (!sheet) continue;
    const size = (a.baby ? 90 : 115) * (w.y / 1200 + 0.67),
      row = atlasMetadata[location.group].rows[location.row],
      col =
        !frozen.value && w.state === "walk"
          ? Math.floor(elapsed * 7 + w.phase) % 4
          : 0;
    ctx.save();
    ctx.translate(w.x, w.y);
    ctx.fillStyle = "rgba(58,74,28,.25)";
    ctx.beginPath();
    ctx.ellipse(0, -4, size * 0.33, size * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    if (a.id === props.chosen) {
      ctx.strokeStyle = "#fff9b4";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(0, -4, size * 0.42, size * 0.12, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.save();
    ctx.scale(w.dir, 1);
    const bob = frozen.value
      ? 0
      : Math.sin(elapsed * (w.state === "walk" ? 14 : 2.4) + w.phase) *
        (w.state === "walk" ? 2 : 1);
    if (w.state === "eat" && !frozen.value) {
      ctx.translate(0, 4);
      ctx.rotate(Math.sin(elapsed * 4) * 0.08);
    }
    ctx.drawImage(
      sheet,
      (col * sheet.width) / 4,
      row[0],
      sheet.width / 4,
      row[1] - row[0],
      -size / 2,
      -size + 8 + bob,
      size,
      size,
    );
    ctx.restore();
    if (a.hungry) tag(ctx, "饿了", -2, -size - 6, "#c97735");
    else if (a.stored > 0)
      tag(ctx, "收获 " + a.stored, 0, -size - 6, "#458443");
    if (a.id === props.chosen) {
      ctx.font = "bold 16px system-ui";
      ctx.textAlign = "center";
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#476033";
      ctx.lineWidth = 4;
      ctx.strokeText(a.name, 0, 22);
      ctx.fillText(a.name, 0, 22);
    }
    ctx.restore();
  }
  const age = elapsed - effectAt;
  if (age >= 0 && age < 2.4) {
    for (let i = 0; i < 12; i++) {
      const p = (i * Math.PI) / 6,
        dist = age * 65;
      ctx.globalAlpha = 1 - age / 2.4;
      ctx.fillStyle = liveEffect === "sellProducts" ? "#ffce42" : "#fff7a3";
      ctx.beginPath();
      ctx.arc(
        600 + Math.cos(p) * dist,
        400 + Math.sin(p) * dist - age * 40,
        5,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    tag(
      ctx,
      liveEffect === "harvest"
        ? "收获装进仓库啦"
        : liveEffect === "sellProducts"
          ? "金币到账啦"
          : liveEffect === "buyFeed"
            ? "开饭啦！"
            : "新伙伴来到牧场",
      600,
      320 - age * 24,
      "#588c37",
    );
  }
}
function zoomBy(delta: number) {
  zoom.value = Math.max(1, Math.min(2.4, zoom.value + delta));
}
function fit() {
  zoom.value = 1;
  cameraX = 600;
  cameraY = 400;
}
function position(e: PointerEvent) {
  const b = canvas.value!.getBoundingClientRect();
  return { x: e.clientX - b.left, y: e.clientY - b.top };
}
function down(e: PointerEvent) {
  const p = position(e);
  pointers.set(e.pointerId, p);
  canvas.value?.setPointerCapture(e.pointerId);
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
    pinchZoom = zoom.value;
    moved = true;
  } else {
    dragging = true;
    moved = false;
    startX = dragX = p.x;
    startY = dragY = p.y;
  }
}
function move(e: PointerEvent) {
  if (!pointers.has(e.pointerId)) return;
  const p = position(e);
  pointers.set(e.pointerId, p);
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    zoom.value = Math.max(
      1,
      Math.min(
        2.4,
        (pinchZoom * Math.hypot(a.x - b.x, a.y - b.y)) /
          Math.max(pinchDistance, 1),
      ),
    );
    return;
  }
  if (!dragging) return;
  if (Math.hypot(p.x - startX, p.y - startY) > 7) moved = true;
  if (moved) {
    cameraX -= (p.x - dragX) / scale;
    cameraY -= (p.y - dragY) / scale;
  }
  dragX = p.x;
  dragY = p.y;
}
function up(e: PointerEvent) {
  const p = position(e);
  pointers.delete(e.pointerId);
  if (e.type !== "pointercancel" && !moved && pointers.size === 0) {
    const x = (p.x - offsetX) / scale,
      y = (p.y - offsetY) / scale;
    const a = [...props.animals].reverse().find((a) => {
      const w = walkers.get(a.id)!;
      return (
        Math.abs(x - w.x) < Math.max(48, 24 / scale) &&
        y > w.y - 120 &&
        y < w.y + 25
      );
    });
    if (a) emit("select", a.id);
    else if (x < 220 && y > 290 && y < 540 && props.owner) emit("feed");
    else if (x < 260 && y < 300) emit("shop");
  }
  if (!pointers.size) dragging = false;
}
function wheel(e: WheelEvent) {
  e.preventDefault();
  zoomBy(e.deltaY > 0 ? -0.12 : 0.12);
}
function reducedChange() {
  frozen.value = reduced.matches;
}
const sheetLoads = new Map<number, Promise<void>>();
async function ensureSheets() {
  await Promise.all(
    [...new Set(props.animals.map((a) => spriteLocation(a.species).group))].map(
      async (i) => {
        if (sheets[i]) return;
        if (!sheetLoads.has(i))
          sheetLoads.set(
            i,
            getImage("/ranch/scene/animals-" + i + ".png").then((img) => {
              sheets[i] = img;
            }),
          );
        await sheetLoads.get(i);
      },
    ),
  );
}
watch(
  () => props.animals,
  () => {
    sync();
    if (ready.value)
      void ensureSheets().catch(() => {
        failure.value = true;
      });
  },
  { deep: true },
);
watch(
  () => props.effect,
  (e) => {
    if (!e) return;
    effectAt = elapsed;
    liveEffect = e.type;
    if (e.type === "buyFeed")
      for (const w of walkers.values()) {
        w.tx = 190 + (w.phase % 3) * 45;
        w.ty = 365 + (w.phase % 4) * 28;
        w.state = "walk";
      }
  },
);
onMounted(async () => {
  sync();
  resize = new ResizeObserver(measure);
  if (canvas.value) resize.observe(canvas.value);
  reduced.addEventListener("change", reducedChange);
  try {
    const [image] = await Promise.all([
      getImage("/ranch/scene/pasture.png"),
      ensureSheets(),
    ]);
    if(disposed)return;
    background.src = image.src;
    ready.value = true;
    measure();
    frame = requestAnimationFrame(draw);
  } catch {
    failure.value = true;
  }
});
onUnmounted(() => {
  disposed=true;
  cancelAnimationFrame(frame);
  resize?.disconnect();
  reduced.removeEventListener("change", reducedChange);
});
</script>
<template>
  <section class="living-pasture" aria-label="动态牧场">
    <canvas
      ref="canvas"
      class="pasture-canvas"
      data-testid="ranch-canvas"
      aria-label="牧场场景，可点击动物查看，拖动平移，双指缩放"
      @pointerdown="down"
      @pointermove="move"
      @pointerup="up"
      @pointercancel="up"
      @wheel="wheel"
    ></canvas>
    <div v-if="!ready" class="scene-loading" role="status">
      {{ failure ? "场景素材未加载，请刷新重试" : "小动物们正在出来玩…" }}
    </div>
    <div class="scene-controls">
      <button aria-label="缩小牧场" @click="zoomBy(-0.3)">−</button
      ><button aria-label="查看牧场全景" @click="fit">全景</button
      ><button aria-label="放大牧场" @click="zoomBy(0.3)">＋</button
      ><button
        :aria-label="frozen ? '播放动物动画' : '暂停动物动画'"
        @click="frozen = !frozen"
      >
        {{ frozen ? "▶" : "Ⅱ" }}
      </button>
    </div>
    <span class="scene-hint">点动物看详情 · 拖动 / 双指缩放</span>
    <div class="animal-picker" aria-label="选择牧场动物">
      <button
        v-for="a in animals"
        :key="a.id"
        :aria-label="'查看' + a.name"
        :aria-pressed="chosen === a.id"
        @click="emit('select', a.id)"
      >
        {{ a.name }}<span v-if="a.stored"> · {{ a.stored }}</span>
      </button>
    </div>
  </section>
</template>
<style scoped>
.living-pasture {
  position: relative;
  background: #b9daa2;
  border: 4px solid #98724e;
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 12px 40px #593f2420;
}
.pasture-canvas {
  display: block;
  width: 100%;
  height: clamp(400px, 58vw, 680px);
  touch-action: none;
  cursor: grab;
}
.pasture-canvas:active {
  cursor: grabbing;
}
.scene-controls {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  gap: 4px;
}
.scene-controls button {
  min-width: 44px;
  min-height: 44px;
  background: #fff5d9ed;
  border: 2px solid #b59765;
  color: #574627;
  border-radius: 12px;
  font-weight: 800;
}
.scene-hint {
  position: absolute;
  left: 12px;
  top: 12px;
  color: #435333;
  background: #fff7dbe8;
  padding: 7px 12px;
  border-radius: 10px;
  font-size: 12px;
  pointer-events: none;
}
.animal-picker {
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 10px;
  display: flex;
  gap: 5px;
  overflow: auto;
  padding: 3px;
  scrollbar-width: thin;
}
.animal-picker button {
  white-space: nowrap;
  background: #fff4ddeb;
  border: 1px solid #9b8557;
  border-radius: 12px;
  min-height: 44px;
  padding: 4px 12px;
  color: #4b5130;
  font-weight: 700;
  font-size: 12px;
}
.animal-picker [aria-pressed="true"] {
  background: #d7ed8e;
}
.scene-loading {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #435333;
  background: #e8efd6;
}
@media (max-width: 640px) {
  .living-pasture {
    border-width: 3px;
    border-radius: 14px;
  }
  .pasture-canvas {
    height: 390px;
  }
  .scene-hint {
    top: 65px;
    left: 10px;
    font-size: 11px;
  }
  .scene-controls {
    top: 10px;
    right: 10px;
  }
}
@media (prefers-reduced-motion: reduce) {
  * {
    scroll-behavior: auto !important;
  }
}
</style>
