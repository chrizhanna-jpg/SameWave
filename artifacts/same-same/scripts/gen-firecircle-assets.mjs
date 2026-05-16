/**
 * Generates local PCM WAV ambience loops (fire + ocean). No third-party APIs.
 * Run: pnpm run gen:firecircle
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "assets", "audio", "firecircle");

function writeWav16Mono(filepath, sampleRate, durationSec, fillBuffer) {
  const n = Math.floor(sampleRate * durationSec);
  const data = Buffer.alloc(n * 2);
  fillBuffer(data, sampleRate, n);
  const hdr = Buffer.alloc(44);
  hdr.write("RIFF", 0);
  hdr.writeUInt32LE(36 + data.length, 4);
  hdr.write("WAVE", 8);
  hdr.write("fmt ", 12);
  hdr.writeUInt32LE(16, 16);
  hdr.writeUInt16LE(1, 20);
  hdr.writeUInt16LE(1, 22);
  hdr.writeUInt32LE(sampleRate, 24);
  hdr.writeUInt32LE(sampleRate * 2, 28);
  hdr.writeUInt16LE(2, 32);
  hdr.writeUInt16LE(16, 34);
  hdr.write("data", 36);
  hdr.writeUInt32LE(data.length, 40);
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  fs.writeFileSync(filepath, Buffer.concat([hdr, data]));
}

function hash01(i) {
  return ((i * 1103515245 + 12345) >>> 0) / 4294967296;
}

function lowPassStep(y, white, coeff) {
  return y + coeff * (white - y);
}

fs.mkdirSync(outDir, { recursive: true });

const SR = 44100;
const OCEAN_SEC = 6;
const FIRE_SEC = 5;

writeWav16Mono(path.join(outDir, "wave_loop.wav"), SR, OCEAN_SEC, (data, sampleRate, n) => {
  let surfY = 0;
  let bedY = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const n1 = hash01(i) - 0.5;
    const n2 = hash01(i + 7919) - 0.5;
    surfY = lowPassStep(surfY, n1 * 0.4 + n2 * 0.25, 0.016);
    bedY = lowPassStep(bedY, hash01(i + 33) - 0.5, 0.008);
    const swell =
      Math.sin(2 * Math.PI * 0.11 * t) * 0.13 +
      Math.sin(2 * Math.PI * 0.07 * t + 1.2) * 0.085 +
      Math.sin(2 * Math.PI * 0.19 * t + 0.4) * 0.045;
    const wash = surfY * (0.5 + 0.5 * Math.sin(2 * Math.PI * 0.23 * t + 0.8));
    const hiss = (hash01(i + 17) - 0.5) * 0.011 * (0.35 + 0.65 * Math.sin(2 * Math.PI * 0.85 * t));
    const s = swell + wash + bedY * 0.35 + hiss;
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767 * 0.88), i * 2);
  }
});

writeWav16Mono(path.join(outDir, "fire_loop.wav"), SR, FIRE_SEC, (data, sampleRate, n) => {
  let rumbleY = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const white = hash01(i) - 0.5;
    rumbleY = lowPassStep(rumbleY, white, 0.028);
    const bed = rumbleY * 0.14;
    const sub = Math.sin(2 * Math.PI * 38 * t) * 0.016;
    const crack = hash01(Math.floor(t * 26) + 3);
    const phase = (t * 26) % 1;
    const pop =
      crack > 0.935
        ? 0.32 * Math.exp(-phase * 24)
        : crack > 0.87
          ? 0.1 * Math.exp(-phase * 14)
          : 0;
    const hiss = (hash01(i + 401) - 0.5) * 0.014;
    const s = bed + sub + pop + hiss;
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767 * 0.88), i * 2);
  }
});

console.log("Wrote:", path.join(outDir, "wave_loop.wav"), `(${OCEAN_SEC}s ocean)`);
console.log("Wrote:", path.join(outDir, "fire_loop.wav"), `(${FIRE_SEC}s fire)`);
