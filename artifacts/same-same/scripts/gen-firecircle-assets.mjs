/**
 * Procedural beach-campfire ambience loops (PCM WAV, no third-party APIs).
 *
 * Design notes (game-audio best practice):
 * - Layered 2D beds: distant ocean swell + surf wash + soft foam hiss; fire rumble +
 *   mid hiss + sparse high crackle pops (not a periodic metronome).
 * - Pink noise for natural fire/ocean texture; crackles use exponential decay envelopes.
 * - Longer loops (12–16 s) + equal-power seam crossfade so repeats are less obvious.
 *
 * Run: pnpm run gen:firecircle
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "assets", "audio", "firecircle");

const SR = 44100;
const OCEAN_SEC = 16;
const FIRE_SEC = 10;

/** Deterministic RNG for reproducible builds. */
function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(0x77617665); // "wave"

/** Paul Kellet refined pink noise (one sample per call). */
function createPink() {
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  return () => {
    const white = rand() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    const out = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
    b6 = white * 0.115926;
    return out * 0.11;
  };
}

function lowPass(y, x, coeff) {
  return y + coeff * (x - y);
}

function highPass(y, x, prevX, coeff) {
  const hp = coeff * (y + x - prevX);
  return hp;
}

/** Equal-power crossfade so loop seam is inaudible. */
function seamlessLoop(samples, overlapSec = 0.1) {
  const overlap = Math.min(
    Math.floor(overlapSec * SR),
    Math.floor(samples.length / 4),
  );
  if (overlap < 8) return;
  const n = samples.length;
  for (let i = 0; i < overlap; i++) {
    const w = Math.sin((i / overlap) * Math.PI * 0.5);
    const head = i;
    const tail = n - overlap + i;
    const a = samples[head];
    const b = samples[tail];
    samples[head] = a * (1 - w) + b * w;
    samples[tail] = b * (1 - w) + a * w;
  }
}

function normalize(samples, peak = 0.82) {
  let max = 0;
  for (const s of samples) {
    const a = Math.abs(s);
    if (a > max) max = a;
  }
  if (max < 1e-6) return;
  const g = peak / max;
  for (let i = 0; i < samples.length; i++) samples[i] *= g;
}

function writeWav16Mono(filepath, sampleRate, samples) {
  const n = samples.length;
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    data.writeInt16LE(Math.round(s * 32767), i * 2);
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

function synthOcean(durationSec) {
  const n = Math.floor(SR * durationSec);
  const samples = new Float64Array(n);
  const pink = createPink();
  let surfLp = 0;
  let bedLp = 0;
  let foamHp = 0;
  let foamPrev = 0;

  // Periods divide loop length → seamless swell without seam crossfade on sines alone.
  const swellHz = [1 / durationSec, 1 / (durationSec * 0.67), 1 / (durationSec * 0.42)];

  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const p = pink();

    surfLp = lowPass(surfLp, p, 0.012);
    bedLp = lowPass(bedLp, p, 0.004);

    const foamIn = rand() * 2 - 1;
    foamHp = highPass(foamHp, foamIn, foamPrev, 0.992);
    foamPrev = foamIn;

    const swell =
      Math.sin(2 * Math.PI * swellHz[0] * t) * 0.12 +
      Math.sin(2 * Math.PI * swellHz[1] * t + 0.9) * 0.075 +
      Math.sin(2 * Math.PI * swellHz[2] * t + 2.1) * 0.038;

    const waveLfo =
      0.42 +
      0.58 *
        (0.5 +
          0.5 * Math.sin(2 * Math.PI * (1 / (durationSec * 1.3)) * t + 0.3));
    const surf = surfLp * waveLfo * 0.52;
    const bed = bedLp * 0.3;
    const foam = foamHp * 0.028 * (0.25 + 0.75 * waveLfo);

    samples[i] = swell + surf + bed + foam;
  }

  seamlessLoop(samples, 0.12);
  normalize(samples, 0.88);
  return samples;
}

function synthFire(durationSec) {
  const n = Math.floor(SR * durationSec);
  const samples = new Float64Array(n);
  const pink = createPink();
  let rumble = 0;
  let roar = 0;
  let hiss = 0;
  let hissHp = 0;
  let hissPrev = 0;

  // Irregular crackle pops + occasional wood snaps (not periodic).
  const crackles = [];
  let t = 0.08 + rand() * 0.15;
  while (t < durationSec - 0.05) {
    const snap = rand() > 0.72;
    const intensity = 0.4 + rand() * 0.6;
    const decayMs = snap ? 18 + rand() * 35 : 30 + rand() * 90;
    const peak = snap
      ? 0.14 + rand() * 0.28 * intensity
      : 0.08 + rand() * 0.2 * intensity;
    crackles.push({ t, peak, decayMs, snap });
    t += 0.035 + rand() * 0.2;
  }

  for (let i = 0; i < n; i++) {
    const time = i / SR;
    const p = pink();
    const white = rand() * 2 - 1;

    rumble = lowPass(rumble, p, 0.014);
    roar = lowPass(roar, p, 0.045);
    hiss = lowPass(hiss, p, 0.075);
    const hissIn = hiss - rumble * 0.35 + white * 0.04;
    hissHp = highPass(hissHp, hissIn, hissPrev, 0.955);
    hissPrev = hissIn;

    const flame =
      0.62 +
      0.38 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 0.24 * time + 0.6));
    let s =
      rumble * 0.16 * flame +
      roar * 0.09 * flame +
      hissHp * 0.07;

    for (const c of crackles) {
      const dt = (time - c.t) * 1000;
      if (dt < 0 || dt > c.decayMs * 2.8) continue;
      const env = Math.exp(-dt / c.decayMs);
      const attack = dt < 4 ? dt / 4 : 1;
      const burst = c.snap ? white : hissHp;
      s += c.peak * env * attack * (0.35 + 0.65 * burst);
    }

    samples[i] = s;
  }

  seamlessLoop(samples, 0.08);
  normalize(samples, 0.85);
  return samples;
}

fs.mkdirSync(outDir, { recursive: true });

const ocean = synthOcean(OCEAN_SEC);
const fire = synthFire(FIRE_SEC);

writeWav16Mono(path.join(outDir, "wave_loop.wav"), SR, ocean);
writeWav16Mono(path.join(outDir, "fire_loop.wav"), SR, fire);

console.log("Wrote:", path.join(outDir, "wave_loop.wav"), `(${OCEAN_SEC}s beach swell)`);
console.log("Wrote:", path.join(outDir, "fire_loop.wav"), `(${FIRE_SEC}s campfire)`);
