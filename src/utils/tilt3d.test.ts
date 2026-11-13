import { describe, expect, it } from "vitest";
import { computeTiltAngles } from "./tilt3d";

describe("computeTiltAngles", () => {
  const rect = { left: 0, top: 0, width: 360, height: 460 };

  it("returns 0deg at exact center", () => {
    expect(computeTiltAngles(180, 230, rect, 12)).toEqual({
      rotateX: 0,
      rotateY: 0,
    });
  });

  it("clamps to max 12deg at corners", () => {
    expect(computeTiltAngles(0, 0, rect, 12)).toEqual({
      rotateX: 12,
      rotateY: -12,
    });
    expect(computeTiltAngles(360, 460, rect, 12)).toEqual({
      rotateX: -12,
      rotateY: 12,
    });
  });

  it("clamps out-of-bounds coordinates safely", () => {
    expect(computeTiltAngles(999, -200, rect, 12)).toEqual({
      rotateX: 12,
      rotateY: 12,
    });
  });
});
