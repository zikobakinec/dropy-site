import { describe, it, expect } from "vitest";
import { makeSlots, targetAt, formation, scatterOf, heroOf, TEXT_ZONE } from "./layout";

describe("makeSlots", () => {
  it("is deterministic for a seed and mixes all three kinds", () => {
    const a = makeSlots(9, 3);
    expect(a).toEqual(makeSlots(9, 3));
    expect(a).toHaveLength(9);
    expect(new Set(a.map((s) => s.kind))).toEqual(new Set(["tag", "percent", "bag"]));
  });
});

describe("targetAt", () => {
  const slots = makeSlots(12, 7);
  const s = slots[4]!;
  it("holds the hero pose at the top of the page", () => {
    expect(targetAt(s, 4, 12, 0, false)).toEqual(heroOf(s, false));
    expect(targetAt(s, 4, 12, 0.2, false)).toEqual(heroOf(s, false));
  });
  it("is fully scattered when the steps begin", () => {
    expect(targetAt(s, 4, 12, 0.35, false)).toEqual(scatterOf(s));
  });
  it("ends in the last step's formation and clamps beyond", () => {
    const end = formation(2, 4, 12, false);
    targetAt(s, 4, 12, 1, false).forEach((v, k) => expect(v).toBeCloseTo(end[k]!, 5));
    expect(targetAt(s, 4, 12, 5, false)).toEqual(targetAt(s, 4, 12, 1, false));
  });
  it("centres formations on narrow screens", () => {
    const meanX = (narrow: boolean) => {
      let sum = 0;
      for (let i = 0; i < 12; i++) sum += formation(1, i, 12, narrow)[0];
      return sum / 12;
    };
    expect(meanX(true)).toBeCloseTo(0, 5);
    expect(meanX(false)).toBeGreaterThan(2);
  });
  it("always returns finite numbers", () => {
    for (let p = -0.5; p <= 1.5; p += 0.05) targetAt(s, 4, 12, p, true).forEach((v) => expect(Number.isFinite(v)).toBe(true));
  });
});

describe("heroOf", () => {
  it("never leaves a wide-screen hero object inside the text column", () => {
    for (const s of makeSlots(16, 7)) {
      const [x, y] = heroOf(s, false);
      const inside = x > TEXT_ZONE.minX && x < TEXT_ZONE.maxX && y > TEXT_ZONE.minY && y < TEXT_ZONE.maxY;
      expect(inside).toBe(false);
    }
  });
  it("pushes hero objects back on narrow screens", () => {
    const s = makeSlots(9, 7)[0]!;
    expect(heroOf(s, true)[2]).toBe(s.home[2] - 3);
  });
});
