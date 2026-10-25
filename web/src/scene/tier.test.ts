import { describe, it, expect } from "vitest";
import { detectTier, OBJECTS } from "./tier";

const base = { webgl: true, reducedMotion: false, cores: 8, memoryGb: 8, width: 1440 };

describe("detectTier", () => {
  it("is none without WebGL or with reduced motion", () => {
    expect(detectTier({ ...base, webgl: false })).toBe("none");
    expect(detectTier({ ...base, reducedMotion: true })).toBe("none");
  });
  it("is low on weak or small devices", () => {
    expect(detectTier({ ...base, cores: 4 })).toBe("low");
    expect(detectTier({ ...base, memoryGb: 2 })).toBe("low");
    expect(detectTier({ ...base, width: 390 })).toBe("low");
  });
  it("is high on a capable desktop, and treats unknown hardware as capable", () => {
    expect(detectTier(base)).toBe("high");
    expect(detectTier({ webgl: true, reducedMotion: false, width: 1280 })).toBe("high");
  });
  it("draws fewer objects on low", () => {
    expect(OBJECTS.low).toBeLessThan(OBJECTS.high);
    expect(OBJECTS.none).toBe(0);
  });
});
