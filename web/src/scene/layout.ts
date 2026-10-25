export type Kind = "tag" | "percent" | "bag";
export type Vec3 = [number, number, number];
export interface Slot { kind: Kind; label: string; home: Vec3; spin: Vec3; scale: number; phase: number }

const KINDS: Kind[] = ["tag", "percent", "bag"];
const LABELS = ["-30%", "-50%", "-20%", "-40%", "-70%"];
export const STEP_COUNT = 3;

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** Hero arrangement: a loose ellipse around the headline, deterministic per seed. */
export function makeSlots(count: number, seed = 7): Slot[] {
  const r = rng(seed);
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + r() * 0.4;
    const radius = 2.2 + r() * 1.6;
    return {
      kind: KINDS[i % KINDS.length]!,
      label: LABELS[i % LABELS.length]!,
      home: [Math.cos(angle) * radius * 1.4, Math.sin(angle) * radius * 0.8, -r() * 2.5],
      spin: [r() * Math.PI, r() * Math.PI, r() * Math.PI],
      scale: 0.7 + r() * 0.5,
      phase: r() * Math.PI * 2,
    };
  });
}

/** Where object i sits during step 0 (ring), 1 (column) or 2 (tight pack, "into the bag"). */
export function formation(step: number, i: number, count: number, narrow: boolean): Vec3 {
  const cx = narrow ? 0 : 3.2;
  const z = narrow ? -3 : -1;
  const a = (i / count) * Math.PI * 2;
  if (step <= 0) return [cx + Math.cos(a) * 1.3, Math.sin(a) * 1.3, z];
  if (step === 1) return [cx + (i % 2 ? 0.5 : -0.5), (i - count / 2) * 0.42, z - (i % 3) * 0.4];
  return [cx + Math.cos(a) * 0.35, Math.sin(a) * 0.35, z + 0.5];
}

export function scatterOf(slot: Slot): Vec3 {
  return [slot.home[0] * 2.2, slot.home[1] * 2.2, slot.home[2] - 2];
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** progress 0..1 across hero → steps: hold, scatter (0.2–0.35), then one formation per step. */
export function targetAt(slot: Slot, i: number, count: number, progress: number, narrow: boolean): Vec3 {
  const p = Math.min(1, Math.max(0, progress));
  if (p <= 0.2) return slot.home;
  const scattered = scatterOf(slot);
  if (p <= 0.35) return lerp3(slot.home, scattered, smooth((p - 0.2) / 0.15));
  const stepsP = ((p - 0.35) / 0.65) * STEP_COUNT;
  const step = Math.min(STEP_COUNT - 1, Math.floor(stepsP));
  const local = smooth(Math.min(1, (stepsP - step) * 2));
  const from = step === 0 ? scattered : formation(step - 1, i, count, narrow);
  return lerp3(from, formation(step, i, count, narrow), local);
}
