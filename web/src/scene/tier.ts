export type Tier = "high" | "low" | "none";
export interface TierEnv { webgl: boolean; reducedMotion: boolean; cores?: number; memoryGb?: number; width: number }

export const OBJECTS = { high: 16, low: 9, none: 0 } as const;

/** none = static CSS fallback; low = fewer objects, no shadows, capped DPR. */
export function detectTier(e: TierEnv): Tier {
  if (!e.webgl || e.reducedMotion) return "none";
  if ((e.cores ?? 8) <= 4 || (e.memoryGb ?? 8) <= 4 || e.width < 768) return "low";
  return "high";
}

export function readEnv(): TierEnv {
  let webgl = false;
  try {
    webgl = !!document.createElement("canvas").getContext("webgl2");
  } catch {
    webgl = false;
  }
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    webgl,
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    cores: nav.hardwareConcurrency,
    memoryGb: nav.deviceMemory,
    width: window.innerWidth,
  };
}
