import { describe, it, expect } from "vitest";
import { makeSlots, targetAt, formation, scatterOf } from "./layout";

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
    expect(targetAt(s, 4, 12, 0, false)).toEqual(s.home);
    expect(targetAt(s, 4, 12, 0.2, false)).toEqual(s.home);
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
    expect(formation(1, 0, 12, true)[0]).toBe(0);
    expect(formation(1, 0, 12, false)[0]).toBeGreaterThan(2);
  });
  it("always returns finite numbers", () => {
    for (let p = -0.5; p <= 1.5; p += 0.05) targetAt(s, 4, 12, p, true).forEach((v) => expect(Number.isFinite(v)).toBe(true));
  });
});
