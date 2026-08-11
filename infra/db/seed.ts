import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/witnessgrid';

// Deterministic abstract "scene" PNGs written to each seeded media key so the
// local object store can serve dev media without a real upload. The scene is
// derived from the incident id (the key's parent segment), so the original and
// its thumbnail share the same composition. No image libraries: the PNG
// encoder is built from node:zlib plus hand-rolled chunks.

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sceneSeed(key: string): number {
  const id = key.split('/')[1] ?? key;
  const digest = createHash('sha256').update(id).digest();
  return digest.readUInt32LE(0);
}

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width: number, height: number, rgba: Buffer): Buffer {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// Dusk/night palettes that sit comfortably next to the site's slate chrome.
const SCENES = [
  { sky: [46, 38, 62], skyLow: [22, 24, 34], ground: [16, 19, 26], block: [11, 13, 19], sun: [232, 163, 61], stars: true },
  { sky: [36, 50, 68], skyLow: [20, 25, 36], ground: [15, 20, 28], block: [9, 12, 18], sun: [127, 168, 201], stars: false },
  { sky: [30, 38, 52], skyLow: [18, 21, 29], ground: [14, 18, 24], block: [8, 11, 16], sun: [217, 138, 176], stars: true },
  { sky: [40, 32, 50], skyLow: [20, 20, 28], ground: [15, 18, 25], block: [10, 12, 18], sun: [207, 125, 74], stars: false },
  { sky: [26, 52, 62], skyLow: [16, 26, 31], ground: [13, 20, 26], block: [8, 13, 18], sun: [91, 168, 147], stars: true },
] as const;

function blendInto(px: Buffer, i: number, r: number, g: number, b: number, a: number): void {
  const ia = 255 - a;
  px[i] = (r * a + px[i]! * ia) / 255;
  px[i + 1] = (g * a + px[i + 1]! * ia) / 255;
  px[i + 2] = (b * a + px[i + 2]! * ia) / 255;
}

function sceneForKey(key: string): Buffer {
  const thumb = key.includes('.thumb.');
  const width = thumb ? 288 : 640;
  const height = thumb ? 192 : 480;
  const rand = mulberry32(sceneSeed(key));
  const scene = SCENES[Math.floor(rand() * SCENES.length)]!;
  const horizon = Math.floor(height * (0.56 + rand() * 0.12));
  const sunX = Math.floor(width * (0.18 + rand() * 0.64));
  const sunR = Math.max(6, Math.floor(width * (0.04 + rand() * 0.03)));
  const px = Buffer.alloc(width * height * 4);

  const skyTop = scene.sky;
  const skyBottom = scene.skyLow;
  for (let y = 0; y < width * height; y += width) {
    const row = y / width;
    const k = Math.min(1, Math.max(0, row / Math.max(1, horizon)));
    const r = Math.round(skyTop[0] + (skyBottom[0] - skyTop[0]) * k);
    const g = Math.round(skyTop[1] + (skyBottom[1] - skyTop[1]) * k);
    const b = Math.round(skyTop[2] + (skyBottom[2] - skyTop[2]) * k);
    for (let x = 0; x < width; x++) {
      const i = (y + x) * 4;
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = 255;
    }
  }

  // Stars, sparse, above the horizon, subtle.
  if (scene.stars) {
    for (let s = 0; s < Math.floor(width * height * 0.002); s++) {
      const sx = Math.floor(rand() * width);
      const sy = Math.floor(rand() * horizon * 0.8);
      const i = (sy * width + sx) * 4;
      blendInto(px, i, 235, 232, 220, Math.floor(90 + rand() * 90));
    }
  }

  // Sun or moon with a soft glow, sitting on the horizon.
  const sunCy = horizon - Math.floor(sunR / 2);
  for (let by = -sunR * 3; by <= sunR * 3; by++) {
    const row = sunCy + by;
    if (row < 0 || row >= height) continue;
    for (let bx = -sunR * 3; bx <= sunR * 3; bx++) {
      const col = sunX + bx;
      if (col < 0 || col >= width) continue;
      const dx = bx / sunR;
      const dy = by / sunR;
      const d = Math.sqrt(dx * dx + dy * dy);
      const i = (row * width + col) * 4;
      if (d <= 1) {
        px[i] = scene.sun[0];
        px[i + 1] = scene.sun[1];
        px[i + 2] = scene.sun[2];
        px[i + 3] = 255;
      } else if (d <= 1.9) {
        blendInto(px, i, scene.sun[0], scene.sun[1], scene.sun[2], Math.floor((1.9 - d) * 90));
      }
    }
  }

  // Skyline silhouette with sparse lit windows.
  const buildings = 4 + Math.floor(rand() * 4);
  let bx = -width * 0.05;
  while (bx < width * 1.05 && buildings > 0) {
    const bw = Math.floor(width * (0.05 + rand() * 0.14));
    const bh = Math.floor(height * (0.08 + rand() * 0.3));
    for (let by = horizon - bh; by < Math.min(height, horizon + 2); by++) {
      for (let x = bx; x < Math.min(width, bx + bw); x++) {
        if (x < 0) continue;
        const i = (by * width + x) * 4;
        px[i] = scene.block[0];
        px[i + 1] = scene.block[1];
        px[i + 2] = scene.block[2];
        px[i + 3] = 255;
      }
    }
    const cell = Math.max(3, Math.floor(bw / 4));
    for (let wy = 0; wy < bh - cell; wy += cell) {
      for (let wx = 0; wx < bw - cell; wx += cell) {
        if (rand() < 0.16) {
          for (let y = 0; y < cell; y++) {
            for (let x = 0; x < cell; x++) {
              const i = ((horizon - bh + wy + y) * width + (bx + wx + x)) * 4;
              if (i >= 0 && i + 3 < px.length) {
                blendInto(px, i, 240, 190, 106, 220);
              }
            }
          }
        }
      }
    }
    bx += bw + Math.floor(width * 0.02);
  }

  // Ground with a faint horizon glow line.
  for (let y = horizon + 1; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      px[i] = scene.ground[0];
      px[i + 1] = scene.ground[1];
      px[i + 2] = scene.ground[2];
      px[i + 3] = 255;
    }
  }
  for (let x = 0; x < width; x++) {
    const i = (Math.min(height - 1, horizon) * width + x) * 4;
    blendInto(px, i, scene.sun[0], scene.sun[1], scene.sun[2], 70);
  }
  for (let x = 0; x < width; x++) {
    const i = (Math.min(height - 1, horizon + 1) * width + x) * 4;
    blendInto(px, i, scene.sun[0], scene.sun[1], scene.sun[2], 40);
  }

  return encodePng(width, height, px);
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
  let sql: postgres.Sql | undefined;
  try {
    sql = postgres(url, { max: 1 });
    await sql`select 1`;
  } catch (err) {
    console.error(
      'DATABASE_URL unreachable — install & start PostgreSQL + PostGIS, then run `pnpm seed` from the repository root.'
    );
    console.error(`DATABASE_URL=${url}`);
    console.error(err);
    process.exit(1);
  }

  const seedPath = path.join(__dirname, 'seed.sql');
  const seedText = await readFile(seedPath, 'utf8');

  try {
    await sql.begin(async (tx) => {
      await tx.unsafe(seedText);
    });
    console.log(`Seed applied (${seedPath}).`);

    const mediaRows = await sql<
      { url: string; thumbnail_url: string | null }[]
    >`SELECT url, thumbnail_url FROM media WHERE url LIKE 'records/%'`;
    const mediaDir = process.env.LOCAL_MEDIA_DIR
      ? path.resolve(process.env.LOCAL_MEDIA_DIR)
      : path.resolve(__dirname, '../../backend/.media');
    for (const row of mediaRows) {
      for (const key of [row.url, row.thumbnail_url]) {
        if (!key) continue;
        const filePath = path.join(mediaDir, ...key.split('/'));
        await mkdir(path.dirname(filePath), { recursive: true });
        await writeFile(filePath, sceneForKey(key));
      }
    }
    console.log(`Materialised ${mediaRows.length} seed media objects under ${mediaDir}.`);
  } catch (err) {
    console.error('Seed failed. If tables are missing, run `pnpm migrate` from the repository root first.');
    console.error(err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

await main();