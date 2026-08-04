import { PNG } from "pngjs";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const INK = { r: 0x12, g: 0x15, b: 0x1c };
const AMBER = { r: 0xe8, g: 0xa3, b: 0x3d };

const GLYPH = [
  [1, 0, 0, 0, 1],
  [1, 0, 0, 0, 1],
  [1, 0, 0, 0, 1],
  [1, 1, 0, 1, 1],
  [1, 1, 1, 1, 1],
  [0, 1, 1, 1, 0],
];

function renderIcon(size, outPath, marginRatio = 0) {
  const png = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2;
      png.data[idx] = INK.r;
      png.data[idx + 1] = INK.g;
      png.data[idx + 2] = INK.b;
      png.data[idx + 3] = 255;
    }
  }

  const cols = GLYPH[0].length;
  const rows = GLYPH.length;
  const cell = Math.max(1, Math.floor((size * (1 - marginRatio * 2)) / Math.max(cols, rows)));
  const ox = Math.floor((size - cols * cell) / 2);
  const oy = Math.floor((size - rows * cell) / 2);

  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      if (!GLYPH[gy][gx]) continue;
      for (let dy = 0; dy < cell; dy++) {
        for (let dx = 0; dx < cell; dx++) {
          const px = ox + gx * cell + dx;
          const py = oy + gy * cell + dy;
          if (px >= size || py >= size) continue;
          const idx = (size * py + px) << 2;
          png.data[idx] = AMBER.r;
          png.data[idx + 1] = AMBER.g;
          png.data[idx + 2] = AMBER.b;
        }
      }
    }
  }

  writeFileSync(outPath, PNG.sync.write(png));
}

const outDir = fileURLToPath(new URL("../public/icons/", import.meta.url));
mkdirSync(outDir, { recursive: true });

renderIcon(192, path.join(outDir, "icon-192.png"), 0.06);
renderIcon(512, path.join(outDir, "icon-512.png"), 0.06);
renderIcon(512, path.join(outDir, "maskable-512.png"), 0.14);
renderIcon(180, path.join(outDir, "apple-touch-icon.png"), 0.06);

console.log("icons written to", outDir);