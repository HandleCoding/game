<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import RanchLoading from "./RanchLoading.vue";
import {
  materialFrame,
  drawAttributeAura,
  attributeColors,
  clearMaterials,
} from "./appearance";
import { ranchAssetUrl, useOriginAsset, rememberRanchAsset } from "./assets";
import type { RanchAnimalView } from "../../../../../packages/contracts/src/ranch";
import { animalExtent } from "./sprites";
import { visualSprite } from "./visual-sprites";
const props = defineProps<{
  animals: RanchAnimalView[];
  chosen: string | null;
  owner: boolean;
  feed?: number;
  hungry: boolean;
  status?: string;
  effect: { type: string; id: number } | null;
}>();
const emit = defineEmits<{
  select: [id: string];
  feed: [];
  shop: [];
  loading: [active: boolean];
  leave: [];
}>();
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
const walkers = new Map<string, Walker>();
let background: HTMLImageElement;
const feederBox = ref({ left: 0, top: 0, width: 64, height: 44 });
const feederVisible = ref(false);
let disposed = false;
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
  cameraY = 400,
  resize: ResizeObserver | undefined;
let dragging = false,
  moved = false,
  startX = 0,
  startY = 0,
  dragX = 0,
  dragY = 0,
  effectAt = -9999,
  liveEffect = "";
let pendingTap: { type: "select" | "feed" | "shop"; id?: string } | null = null;
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
      const columns = Math.min(4, Math.ceil(Math.sqrt(props.animals.length)));
      const row = Math.floor(i / columns);
      const x =
          600 +
          ((i % columns) - (columns - 1) / 2) * 150 +
          (row % 2 ? 30 : -12) +
          (seed % 10),
        y = 365 + row * 90;
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
const loaded = new Map<string, HTMLImageElement>();
const pending = new Map<string, Promise<HTMLImageElement>>();
const cancelLoads = new Set<() => void>();
const resourceUrls = ref<string[]>([]);
const completed = ref(0);
const total = computed(() => resourceUrls.value.length);
let preparing = false;
function updateProgress() {
  completed.value = resourceUrls.value.filter((url) => loaded.has(url)).length;
}
const ratios = ref<Record<string, number>>({});
const progress = computed(() =>
  total.value
    ? (resourceUrls.value.reduce(
        (n, url) => n + (loaded.has(url) ? 1 : ratios.value[url] || 0),
        0,
      ) /
        total.value) *
      100
    : 0,
);
function getImage(url: string) {
  const cached = loaded.get(url);
  if (cached) return Promise.resolve(cached);
  const existing = pending.get(url);
  if (existing) return existing;
  const attempt = async (sourceUrl: string) => {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout>;
    let rejectAbort: (error: Error) => void;
    const aborted = new Promise<never>((_, reject) => {
      rejectAbort = reject;
    });
    const cancel = () => {
      controller.abort();
      rejectAbort(new Error("资源下载暂时没有响应"));
    };
    const arm = () => {
      clearTimeout(timeout);
      timeout = setTimeout(cancel, 45000);
    };
    ratios.value[url] = 0;
    cancelLoads.add(cancel);
    arm();
    try {
      const work = (async () => {
        const response = await fetch(sourceUrl, {
          signal: controller.signal,
          credentials: "omit",
        });
        if (!response.ok) throw new Error("资源暂时无法下载");
        arm();
        const length = Number(response.headers.get("Content-Length")) || 0;
        const chunks: ArrayBuffer[] = [];
        let received = 0;
        if (response.body) {
          const reader = response.body.getReader();
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            arm(); // Active transfers can exceed 25s; only an idle transfer times out.
            chunks.push(
              value.buffer.slice(
                value.byteOffset,
                value.byteOffset + value.byteLength,
              ) as ArrayBuffer,
            );
            received += value.byteLength;
            if (length)
              ratios.value[url] = Math.min(0.95, (received / length) * 0.95);
          }
        } else {
          const buffer = await response.arrayBuffer();
          chunks.push(buffer);
        }
        arm();
        const blob = new Blob(chunks, {
          type: response.headers.get("Content-Type") || "image/webp",
        });
        // data: is already allowed by our CSP. Do not weaken CSP to permit blob: images.
        const source = await new Promise<string>((resolve, reject) => {
          const file = new FileReader();
          file.onload = () => resolve(file.result as string);
          file.onerror = () => reject(new Error("图片读取失败"));
          file.readAsDataURL(blob);
        });
        const img = new Image();
        img.src = source;
        await img.decode();
        if (controller.signal.aborted || disposed)
          throw new Error("加载已取消");
        if (!img.naturalWidth) throw new Error("Empty image");
        rememberRanchAsset(url, source);
        loaded.set(url, img);
        updateProgress();
        return img;
      })();
      return await Promise.race([work, aborted]);
    } finally {
      clearTimeout(timeout!);
      cancelLoads.delete(cancel);
    }
  };
  const promise = (async () => {
    const source = ranchAssetUrl(url);
    try {
      return await attempt(source);
    } catch (error) {
      if (disposed || source === url) throw error;
      // Retain byte progress, decoding, idle timeout and the two-worker limit on fallback.
      useOriginAsset(url);
      return await attempt(url);
    }
  })().finally(() => pending.delete(url));
  pending.set(url, promise);
  return promise;
}
function neededUrls() {
  return [
    "/ranch/scene/pasture-v1.webp",
    "/ranch/ui/ranch-tools-v1.webp",
    ...new Set(
      props.animals.map(
        (a) => visualSprite(a.species, a.baby, a.attributes).url,
      ),
    ),
  ];
}
async function prepareScene() {
  if (preparing || disposed) return;
  preparing = true;
  ready.value = false;
  failure.value = false;
  emit("loading", true);
  cancelAnimationFrame(frame);
  try {
    // Props can change during slow downloads; include newly required stages before entering.
    while (!disposed) {
      resourceUrls.value = neededUrls();
      updateProgress();
      const queue = resourceUrls.value.filter((url) => !loaded.has(url));
      let next = 0;
      const errors: unknown[] = [];
      await Promise.all(
        Array.from({ length: Math.min(2, queue.length) }, async () => {
          while (next < queue.length && !disposed) {
            const url = queue[next++];
            try {
              await getImage(url);
            } catch (error) {
              errors.push(error);
              if (!disposed)
                console.warn(
                  "牧场资源加载未完成",
                  url,
                  error instanceof Error ? error.message : "网络异常",
                );
            }
          }
        }),
      );
      const results = errors.map(() => ({ status: "rejected" }));
      if (disposed) return;
      if (results.some((r) => r.status === "rejected"))
        throw new Error("Resources unavailable");
      if (neededUrls().some((url) => !loaded.has(url))) continue;
      background = loaded.get("/ranch/scene/pasture-v1.webp")!;
      sync();
      ready.value = true;
      measure();
      // Paint the first scene before revealing the HUD and interactive tools.
      draw(performance.now());
      emit("loading", false);
      break;
    }
  } catch {
    if (!disposed) {
      ready.value = false;
      failure.value = true;
    }
  } finally {
    preparing = false;
  }
}
function measure() {
  const element = canvas.value;
  if (!element) return;
  const box = element.getBoundingClientRect();
  width = box.width;
  height = box.height;

  dpr = Math.min(devicePixelRatio || 1, 2);
  element.width = Math.round(width * dpr);
  element.height = Math.round(height * dpr);
}
function clampCamera() {
  const cover = Math.max(width / 1200, height / 800);
  scale = cover * zoom.value;
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
  const next = {
    left: Math.max(8, Math.min(width - 72, offsetX + 110 * scale - 32)),
    top: offsetY + 440 * scale - 22,
    width: 64,
    height: 44,
  };
  feederVisible.value =
    offsetX + 110 * scale >= 0 &&
    offsetX + 110 * scale <= width &&
    next.top >= 0 &&
    next.top + next.height <= height;
  if (
    Object.keys(next).some(
      (k) =>
        Math.abs(
          next[k as keyof typeof next] -
            feederBox.value[k as keyof typeof next],
        ) > 0.25,
    )
  )
    feederBox.value = next;
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
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
function tag(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
) {
  const font = Math.max(15, 12 / scale);
  ctx.font = "bold " + font + "px system-ui";
  const pad = Math.max(11, 8 / scale);
  const w = ctx.measureText(text).width + pad * 2;
  ctx.fillStyle = color;
  roundBox(ctx, x - w / 2, y - font, w, font * 1.9, font * 0.5);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.fillText(text, x, y + font * 0.36);
}
/** Native aspect and measured foot baseline, with species/depth scale. */
function bodyGeometry(a: RanchAnimalView, w: Walker, col = 0) {
  const visual = visualSprite(a.species, a.baby, a.attributes, col),
    row = visual.frame;
  const density = Math.min(1, Math.sqrt(7 / Math.max(1, props.animals.length)));
  const extent =
    animalExtent[a.species] *
    (a.baby ? 0.62 : 1) *
    (0.83 + (w.y - 330) / 1450) *
    density;
  const ratio = extent / Math.max(row.bodyWidth, row.bodyHeight);
  return {
    ...visual,
    row,
    left: -row.centerX * ratio,
    bodyWidth: row.bodyWidth * ratio,
    width: row.width * ratio,
    height: row.height * ratio,
    ground: row.ground * ratio,
  };
}
function groundShadow(ctx: CanvasRenderingContext2D, bodyWidth: number) {
  const radius = Math.max(14, bodyWidth * 0.42);
  ctx.save();
  ctx.translate(radius * 0.23, 1);
  ctx.scale(1, 0.28);
  const shade = ctx.createRadialGradient(0, 0, 1, 0, 0, radius);
  shade.addColorStop(0, "rgba(57,72,29,.25)");
  shade.addColorStop(0.5, "rgba(57,72,29,.13)");
  shade.addColorStop(1, "rgba(57,72,29,0)");
  ctx.fillStyle = shade;
  ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
  ctx.restore();
  ctx.fillStyle = "rgba(54,65,27,.14)";
  ctx.beginPath();
  ctx.ellipse(
    0,
    0,
    radius * 0.55,
    Math.max(2, radius * 0.07),
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();
}
function draw(now: number) {
  if (disposed) return;
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
    if (a.hungry) w.state = "idle";
    if (!frozen.value && !a.hungry && a.id !== props.chosen) {
      if (w.state === "walk") {
        const dx = w.tx - w.x,
          dy = w.ty - w.y,
          d = Math.hypot(dx, dy);
        if (d < 4) {
          w.state =
            liveEffect === "buyFeed" && elapsed - effectAt < 18
              ? "eat"
              : "idle";
          w.until = elapsed + 2 + (w.phase % 4);
        } else {
          const speed =
            liveEffect === "buyFeed" && elapsed - effectAt < 18 ? 65 : 27;
          w.x += (dx / d) * dt * speed;
          w.y += (dy / d) * dt * speed;
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
    const col =
      !frozen.value && w.state === "walk"
        ? Math.floor(elapsed * 6 + w.phase) % 4
        : 0;
    const body = bodyGeometry(a, w, col),
      sheet = loaded.get(body.url);
    if (!sheet) continue;
    const { row } = body;
    ctx.save();
    ctx.translate(w.x, w.y);
    groundShadow(ctx, body.bodyWidth);
    drawAttributeAura(
      ctx,
      body.generated
        ? (a.attributes ?? []).filter((a) => a !== body.primary)
        : (a.attributes ?? []),
      body.bodyWidth,
      body.height,
      body.ground,
      elapsed,
      w.phase,
      frozen.value,
    );
    if (a.id === props.chosen) {
      ctx.strokeStyle = "#fff9b4";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(
        0,
        0,
        Math.max(18, body.width * 0.48),
        Math.max(6, body.width * 0.11),
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }
    ctx.save();
    ctx.scale(w.dir, 1);
    const bob = frozen.value
      ? 0
      : Math.sin(elapsed * (w.state === "walk" ? 12 : 2.1) + w.phase) *
        (w.state === "walk" ? 0.6 : 0.25);
    if (w.state === "eat" && !frozen.value)
      ctx.rotate(Math.sin(elapsed * 3 + w.phase) * 0.018);
    const attrs = a.attributes ?? [];
    if (attrs.length && !body.generated) {
      const painted = materialFrame(
        sheet,
        a.species + ":" + a.baby + ":" + col,
        row.x,
        row.y,
        row.width,
        row.height,
        attrs,
      );
      ctx.shadowColor = attributeColors[attrs[0]!]!;
      ctx.shadowBlur = 6;
      ctx.drawImage(
        painted,
        body.left,
        -body.ground + bob,
        body.width,
        body.height,
      );
    } else {
      ctx.drawImage(
        sheet,
        row.x,
        row.y,
        row.width,
        row.height,
        body.left,
        -body.ground + bob,
        body.width,
        body.height,
      );
    }
    ctx.restore();
    if (a.stored > 0)
      tag(
        ctx,
        "可收获 " + a.stored + (a.hungry ? " · 缺粮" : ""),
        0,
        -body.ground - 13,
        "#458443",
      );
    else if (a.status === "completed")
      tag(ctx, "生产完成 · 选择去向", 0, -body.ground - 13, "#7c963b");
    else if (a.hungry) tag(ctx, "需要喂食", 0, -body.ground - 13, "#c97735");
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
  if (age >= 0 && age < 2.4 && !frozen.value) {
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
            : liveEffect === "fuseAnimals"
              ? "名宠融合完成"
              : liveEffect === "upgrade"
                ? "新位置准备好了"
                : "新伙伴来到牧场",
      600,
      320 - age * 24,
      "#588c37",
    );
  }
}
function zoomBy(delta: number) {
  const min =
    Math.min(width / 1200, height / 800) / Math.max(width / 1200, height / 800);
  zoom.value = Math.max(min, Math.min(2.4, zoom.value + delta));
}
function fit() {
  zoom.value =
    Math.min(width / 1200, height / 800) / Math.max(width / 1200, height / 800);
  cameraX = 600;
  cameraY = 400;
}
function position(e: PointerEvent) {
  const b = canvas.value!.getBoundingClientRect();
  return { x: e.clientX - b.left, y: e.clientY - b.top };
}
function down(e: PointerEvent) {
  pendingTap = null;
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
      Math.min(width / 1200, height / 800) /
        Math.max(width / 1200, height / 800),
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
  pendingTap = null;
  const p = position(e);
  pointers.delete(e.pointerId);
  if (e.type !== "pointercancel" && !moved && pointers.size === 0) {
    const x = (p.x - offsetX) / scale,
      y = (p.y - offsetY) / scale;
    const a = [...props.animals]
      .sort((a, b) => (walkers.get(b.id)?.y || 0) - (walkers.get(a.id)?.y || 0))
      .find((a) => {
        const w = walkers.get(a.id)!;
        const body = bodyGeometry(a, w);
        return (
          Math.abs(x - w.x) < Math.max(body.width / 2, 22 / scale) &&
          y > w.y - Math.max(body.ground, 44 / scale) &&
          y < w.y + Math.max(10, 8 / scale)
        );
      });
    if (props.owner && x > 45 && x < 145 && y > 310 && y < 430)
      pendingTap = { type: "feed" };
    else if (a) pendingTap = { type: "select", id: a.id };
    else if (x < 260 && y < 300) pendingTap = { type: "shop" };
  }
  if (!pointers.size) dragging = false;
}
function tap(e: MouseEvent) {
  // Open dialogs from the completed click, not pointerup: touch browsers may
  // otherwise retarget the following synthesized click to a purchase button.
  e.preventDefault();
  const action = pendingTap;
  pendingTap = null;
  if (action?.type === "select" && action.id) emit("select", action.id);
  else if (action?.type === "feed") emit("feed");
  else if (action?.type === "shop") emit("shop");
}
function wheel(e: WheelEvent) {
  e.preventDefault();
  zoomBy(e.deltaY > 0 ? -0.12 : 0.12);
}
function reducedChange() {
  frozen.value = reduced.matches;
}
watch(
  () => props.animals,
  () => {
    sync();
    if (ready.value && neededUrls().some((url) => !loaded.has(url)))
      void prepareScene();
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
        if (feederVisible.value) {
          w.tx = 165 + (w.phase % 3) * 32;
          w.ty = 350 + (w.phase % 4) * 30;
          w.state = "walk";
        } else {
          w.state = "eat";
          w.until = elapsed + 4 + (w.phase % 3);
        }
      }
  },
);
onMounted(() => {
  sync();
  resize = new ResizeObserver(measure);
  if (canvas.value) resize.observe(canvas.value);
  reduced.addEventListener("change", reducedChange);
  void prepareScene();
});
onUnmounted(() => {
  clearMaterials();
  disposed = true;
  for (const cancel of cancelLoads) cancel();
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
      data-art-style="soft-realistic"
      :data-life-stages="
        animals
          .map((a) => a.species + ':' + (a.baby ? 'baby' : 'adult'))
          .join(',')
      "
      aria-label="牧场场景，可点击动物查看，拖动平移，双指缩放"
      @pointerdown="down"
      @pointermove="move"
      @pointerup="up"
      @pointercancel="up"
      @wheel="wheel"
      @click="tap"
    ></canvas>
    <RanchLoading
      v-if="!ready"
      class="scene-loading"
      :progress="progress"
      :completed="completed"
      :total="total"
      :failed="failure"
      @retry="prepareScene"
      @leave="emit('leave')"
    />
    <button
      v-if="ready && owner && feederVisible"
      class="feeder-hitbox"
      data-testid="side-feeder"
      :style="{
        left: feederBox.left + 'px',
        top: feederBox.top + 'px',
        width: feederBox.width + 'px',
        height: feederBox.height + 'px',
      }"
      :aria-label="'左侧食槽，剩余' + (feed ?? 0) + '份饲料，点击添加食物'"
      :title="
        hungry
          ? '需要喂食，点击添加饲料'
          : '剩余 ' + (feed ?? 0) + ' 份，点击添加饲料'
      "
      @click="emit('feed')"
    >
      <span class="feeder-caption" :class="{ empty: hungry }">食槽</span>
    </button>
    <span
      v-else-if="ready && !owner && feederVisible"
      class="feeder-visitor-caption"
      :title="hungry ? '需要喂食 · 只读参观' : '饲料充足 · 只读参观'"
      :style="{
        left: feederBox.left + feederBox.width / 2 + 'px',
        top: feederBox.top + feederBox.height + 'px',
      }"
      >食槽</span
    >
    <div v-if="ready" class="scene-controls">
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

    <div v-if="ready" class="animal-picker" aria-label="选择牧场动物">
      <button
        v-for="a in animals"
        :key="a.id"
        :aria-label="'查看' + a.name"
        :aria-pressed="chosen === a.id"
        @click="emit('select', a.id)"
      >
        {{ a.name }}<span v-if="a.stored"> · 可收获 {{ a.stored }}</span
        ><span v-else-if="a.status === 'completed'"> · 生产完成</span
        ><span v-else-if="a.hungry"> · 缺粮</span>
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

.living-pasture {
  position: absolute;
  inset: 0;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}
.pasture-canvas {
  width: 100%;
  height: 100%;
}
.scene-controls {
  right: max(12px, env(safe-area-inset-right));
  top: 50%;
  transform: translateY(-50%);
  flex-direction: column;
  gap: 7px;
}
.scene-controls button {
  width: 44px;
  min-height: 44px;
  padding: 0;
  border-radius: 50%;
  font-size: 13px;
  background: linear-gradient(#f8edcddd, #d8bb89e6);
  border: 2px solid #ac8656;
  box-shadow: 0 3px 0 #72553350;
}
.animal-picker {
  left: max(10px, env(safe-area-inset-left));
  right: max(10px, env(safe-area-inset-right));
  bottom: calc(128px + env(safe-area-inset-bottom));
  justify-content: center;
  gap: 6px;
  padding: 3px;
}
.animal-picker button {
  flex-shrink: 0;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  min-height: 44px;
  background: #fff5d3ce;
  backdrop-filter: blur(4px);
  padding: 4px 12px;
  font-size: 12px;
  border-radius: 24px;
}
.feeder-hitbox {
  position: absolute;
  border: 0;
  padding: 0;
  min-height: 44px;
  min-width: 44px;
  background: transparent !important;
  cursor: pointer;
  border-radius: 20px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  color: #486d2f;
  touch-action: manipulation;
}
.feeder-hitbox:focus-visible {
  outline: 3px solid #fffbe0;
  outline-offset: 4px;
}
.feeder-caption,
.feeder-visitor-caption {
  background: linear-gradient(#e6bf86e8, #bb8b57e8);
  color: #fff5d8;
  border: 1px solid #956333;
  border-radius: 6px;
  padding: 5px 11px;
  box-shadow: 0 2px 2px #5d452537;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
  text-shadow: 0 1px #845a31;
}
.feeder-caption.empty {
  border-color: #c87234;
}
.feeder-visitor-caption {
  position: absolute;
  transform: translate(-50%, -100%);
  pointer-events: none;
}
@media (max-width: 640px) {
  .living-pasture {
    border: 0;
    border-radius: 0;
  }
  .pasture-canvas {
    height: 100%;
  }
  .scene-controls {
    top: 48%;
    right: max(9px, env(safe-area-inset-right));
  }
  .animal-picker {
    bottom: calc(112px + env(safe-area-inset-bottom));
  }
}
@media (max-height: 500px) and (min-width: 641px) {
  .scene-controls {
    flex-direction: row;
    top: auto;
    bottom: calc(90px + env(safe-area-inset-bottom));
    transform: none;
  }
  .animal-picker {
    justify-content: flex-start;
    max-width: 240px;
    bottom: calc(90px + env(safe-area-inset-bottom));
    right: auto;
  }
}
:global([data-theme="dark"]) .pasture-canvas {
  filter: brightness(0.78) saturate(0.85);
}
</style>
