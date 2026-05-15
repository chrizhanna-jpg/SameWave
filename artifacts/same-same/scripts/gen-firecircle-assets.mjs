/**
 * Generates local PCM WAV stubs for Firecircle ambience (no third-party APIs).
 * Run from repo root: node ./scripts/gen-firecircle-assets.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "assets", "audio", "firecircle");

function writeWav16Mono(filepath, sampleRate, getSample) {
  const durationSec = 1.0;
  const n = Math.floor(sampleRate * durationSec);
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, getSample(i / sampleRate, i)));
    data.writeInt16LE(Math.round(s * 32767 * 0.92), i * 2);
  }
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

fs.mkdirSync(outDir, { recursive: true });

writeWav16Mono(path.join(outDir, "wave_loop.wav"), 44100, (t) => {
  const f = 78;
  return Math.sin(2 * Math.PI * f * t) * 0.045;
});

writeWav16Mono(path.join(outDir, "fire_loop.wav"), 44100, (t, i) => {
  const u = ((i * 1103515245 + 12345) >>> 0) / 4294967296;
  const crack = (Math.sin(i * 12.9898) * 43758.5453) % 1;
  const burst = crack > 0.985 ? 0.22 : 0;
  const hiss = (u - 0.5) * 0.014;
  return burst + hiss;
});

writeWav16Mono(path.join(outDir, "chatter_loop.wav"), 44100, (t) => {
  const n =
    Math.sin(2 * Math.PI * 180 * t) * 0.008 +
    Math.sin(2 * Math.PI * 240 * t) * 0.006 +
    Math.sin(2 * Math.PI * 310 * t) * 0.005;
  return n * (0.55 + 0.45 * Math.sin(2 * Math.PI * 0.35 * t));
});

console.log("Wrote:", path.join(outDir, "wave_loop.wav"));
console.log("Wrote:", path.join(outDir, "fire_loop.wav"));
console.log("Wrote:", path.join(outDir, "chatter_loop.wav"));
