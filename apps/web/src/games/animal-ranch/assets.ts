import { computed, reactive, watch } from "vue";

// Only the public game uses CDN; cloud development remains same-origin.
const cdnOrigin =
  location.hostname === "game.aicoding.ltd"
    ? "https://static.aicoding.ltd"
    : "";
const originOnly = reactive(new Set<string>());
const sources = reactive(new Map<string, string>());
const pending = new Map<string, Promise<void>>();
const queue: Array<() => void> = [];
let active = 0;
export function ranchAssetUrl(path: string): string {
  return cdnOrigin && !originOnly.has(path) ? cdnOrigin + path : path;
}
export function useOriginAsset(path: string): void {
  originOnly.add(path);
}
export function rememberRanchAsset(path: string, source: string): void {
  if (cdnOrigin) sources.set(path, source);
}
function drain() {
  while (active < 2 && queue.length) {
    active++;
    queue.shift()!();
  }
}
async function downloadSource(url: string): Promise<string> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(), 45000);
  };
  arm();
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      credentials: "omit",
    });
    if (!response.ok) throw new Error("图片下载失败");
    const chunks: ArrayBuffer[] = [];
    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        arm();
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(
          value.buffer.slice(
            value.byteOffset,
            value.byteOffset + value.byteLength,
          ) as ArrayBuffer,
        );
      }
    } else chunks.push(await response.arrayBuffer());
    const source = await new Promise<string>((resolve, reject) => {
      const file = new FileReader();
      file.onload = () => resolve(file.result as string);
      file.onerror = () => reject(new Error("图片读取失败"));
      file.readAsDataURL(
        new Blob(chunks, {
          type: response.headers.get("Content-Type") || "image/webp",
        }),
      );
    });
    const image = new Image();
    image.src = source;
    await image.decode();
    if (controller.signal.aborted || !image.naturalWidth)
      throw new Error("图片解码失败");
    return source;
  } finally {
    clearTimeout(timer!);
  }
}
function requestSource(path: string): Promise<void> {
  if (sources.has(path)) return Promise.resolve();
  const existing = pending.get(path);
  if (existing) return existing;
  const job = new Promise<void>((resolve, reject) => {
    queue.push(() => {
      (async () => {
        if (sources.has(path)) return;
        const url = ranchAssetUrl(path);
        try {
          rememberRanchAsset(path, await downloadSource(url));
        } catch (error) {
          if (url === path) throw error;
          useOriginAsset(path);
          rememberRanchAsset(path, await downloadSource(path));
        }
      })()
        .then(resolve, reject)
        .finally(() => {
          active--;
          drain();
        });
    });
  }).finally(() => pending.delete(path));
  pending.set(path, job);
  drain();
  return job;
}
/** Inline SVG images use decoded data URLs: remote SVG image painting is unreliable
 * across browsers even when the CDN request itself succeeds. Scene assets are reused. */
export function useRanchAssetSource(path: () => string) {
  watch(
    path,
    (value) => {
      if (cdnOrigin)
        void requestSource(value).catch(() => {
          // A normal origin image remains available if both streamed attempts fail.
          useOriginAsset(value);
          sources.set(value, value);
        });
    },
    { immediate: true },
  );
  return computed(() =>
    cdnOrigin ? sources.get(path()) || undefined : path(),
  );
}
