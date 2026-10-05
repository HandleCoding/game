/** Runtime materials retain the original animal silhouette, fur and atlas crop. */
export const attributeColors: Record<string, string> = {
  lightning: "#9b83ff",
  fire: "#ff954f",
  water: "#60caed",
  gold: "#e8bb42",
  dream: "#d78bea",
};
const materials = new Map<string, HTMLCanvasElement>();
export function materialFrame(
  sheet: HTMLImageElement,
  key: string,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  attributes: string[],
) {
  const id = key + ":" + attributes.join("+");
  const cached = materials.get(id);
  if (cached) return cached;
  const image = document.createElement("canvas");
  image.width = 160;
  image.height = Math.min(256, Math.max(32, Math.round((160 * sh) / sw)));
  const c = image.getContext("2d")!;
  c.drawImage(sheet, sx, sy, sw, sh, 0, 0, image.width, image.height);
  c.globalCompositeOperation = "source-atop";
  const tint = c.createLinearGradient(0, 0, image.width, image.height);
  attributes.forEach((a, i) =>
    tint.addColorStop(
      attributes.length === 1 ? 0 : i / (attributes.length - 1),
      attributeColors[a] || "#fff",
    ),
  );
  if (attributes.length === 1)
    tint.addColorStop(
      1,
      attributes[0] === "dream" ? "#a5c3ff" : attributeColors[attributes[0]!]!,
    );
  c.globalAlpha = attributes.includes("gold") ? 0.38 : 0.25;
  c.fillStyle = tint;
  c.fillRect(0, 0, image.width, image.height);
  const sheen = c.createLinearGradient(0, 0, image.width, image.height);
  sheen.addColorStop(0, "#ffffff00");
  sheen.addColorStop(0.34, "#ffffff00");
  sheen.addColorStop(0.47, "#fff");
  sheen.addColorStop(0.6, "#ffffff00");
  sheen.addColorStop(1, "#ffffff00");
  c.globalAlpha = attributes.includes("gold") ? 0.26 : 0.13;
  c.fillStyle = sheen;
  c.fillRect(0, 0, image.width, image.height);
  if (materials.size >= 96) materials.delete(materials.keys().next().value!);
  materials.set(id, image);
  return image;
}
export function clearMaterials() {
  materials.clear();
}
export function drawAttributeAura(
  c: CanvasRenderingContext2D,
  attributes: string[],
  width: number,
  height: number,
  ground: number,
  time: number,
  phase: number,
  frozen: boolean,
) {
  const t = frozen ? 0 : time;
  for (const [index, attr] of attributes.entries()) {
    const color = attributeColors[attr] || "#fff",
      r = Math.max(20, width * 0.62),
      center = -ground * 0.48;
    c.save();
    c.fillStyle = color;
    c.strokeStyle = color;
    c.lineWidth = 1.8;
    c.globalAlpha = 0.64;
    c.shadowColor = color;
    c.shadowBlur = 5;
    if (attr === "water" || attr === "gold" || attr === "dream") {
      c.beginPath();
      c.ellipse(
        0,
        2 + index * 2,
        r,
        attr === "water" ? r * 0.22 : r * 0.14,
        0,
        0,
        Math.PI * 2,
      );
      c.stroke();
      if (attr === "water") {
        c.globalAlpha = 0.32;
        c.beginPath();
        c.ellipse(
          0,
          3,
          r * (1.14 + Math.sin(t * 1.5) * 0.08),
          r * 0.29,
          0,
          0,
          Math.PI * 2,
        );
        c.stroke();
        c.globalAlpha = 0.64;
      }
    }
    const count = attr === "fire" ? 5 : 4;
    for (let j = 0; j < count; j++) {
      const p = phase + index * 1.8 + (j * Math.PI * 2) / count + t * 0.65;
      let x = Math.cos(p) * r,
        y = center + Math.sin(p) * height * 0.33;
      c.beginPath();
      if (attr === "lightning") {
        const h = Math.max(11, height * 0.22);
        c.moveTo(x - 4, y - h / 2);
        c.lineTo(x + 3, y - h * 0.16);
        c.lineTo(x - 2, y + h * 0.07);
        c.lineTo(x + 4, y + h * 0.5);
        c.stroke();
        c.globalAlpha = 0.28;
        c.beginPath();
        c.moveTo(x + 4, y + h * 0.5);
        c.lineTo(
          Math.cos(p + 0.5) * r,
          center + Math.sin(p + 0.5) * height * 0.33,
        );
        c.stroke();
        c.globalAlpha = 0.64;
      } else if (attr === "fire") {
        x = (j - 2) * r * 0.55;
        y = 2 - ((t * 0.22 + j * 0.2) % 1) * height * 0.7;
        const h = 16 + Math.sin(t * 2 + j) * 2;
        c.moveTo(x - 4, y);
        c.quadraticCurveTo(x - 8, y - 5, x + 1, y - h);
        c.quadraticCurveTo(x + 7, y - 3, x + 4, y);
        c.closePath();
        c.fill();
        c.fillStyle = "#ffe5a1";
        c.globalAlpha = 0.8;
        c.beginPath();
        c.ellipse(x, y - 3, 2, 4, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = color;
        c.globalAlpha = 0.64;
      } else if (attr === "water") {
        c.arc(x, y, 3 + Math.sin(p) * 0.7, 0, Math.PI * 2);
        c.stroke();
        c.fillStyle = "#e0f7ff";
        c.fillRect(x - 1, y - 2, 1.5, 1.5);
        c.fillStyle = color;
      } else {
        const size = attr === "dream" ? 6 : 5;
        c.moveTo(x, y - size);
        c.lineTo(x + size * 0.38, y - size * 0.38);
        c.lineTo(x + size, y);
        c.lineTo(x + size * 0.38, y + size * 0.38);
        c.lineTo(x, y + size);
        c.lineTo(x - size * 0.38, y + size * 0.38);
        c.lineTo(x - size, y);
        c.lineTo(x - size * 0.38, y - size * 0.38);
        c.closePath();
        c.fill();
        if (attr === "dream") {
          c.globalAlpha = 0.2;
          c.beginPath();
          c.arc(x, y, 8, 0, Math.PI * 2);
          c.fill();
          c.globalAlpha = 0.64;
        }
      }
    }
    c.restore();
  }
}
