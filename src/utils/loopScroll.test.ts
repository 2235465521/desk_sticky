import { describe, expect, it } from "vitest";
import {
  computeStabilizedScrollTop,
  computeWrappedScrollTop,
  shouldEnableLoop,
} from "./loopScroll";

describe("loopScroll", () => {
  it("disables loop when empty or content fits within viewport", () => {
    expect(shouldEnableLoop(0, 500, 400)).toBe(false);
    expect(shouldEnableLoop(3, 240, 400)).toBe(false);
    expect(shouldEnableLoop(3, 400, 400)).toBe(false);
    expect(shouldEnableLoop(8, 460, 400)).toBe(true);
  });

  it("wraps scrollTop seamlessly when scrolling past top or bottom seam", () => {
    const segmentHeight = 800;
    const viewportHeight = 400;

    // Inside middle safe zone -> no wrap
    expect(computeWrappedScrollTop(800, segmentHeight, viewportHeight)).toBeNull();
    expect(computeWrappedScrollTop(450, segmentHeight, viewportHeight)).toBeNull();

    // Scrolled up into segment A (< 200) -> jumps forward by +800
    expect(computeWrappedScrollTop(150, segmentHeight, viewportHeight)).toBe(950);

    // Scrolled down into segment C (> 1400) -> jumps backward by -800
    expect(computeWrappedScrollTop(1450, segmentHeight, viewportHeight)).toBe(650);
  });

  it("handles fast multi-segment scroll jumps", () => {
    const segmentHeight = 500;
    const viewportHeight = 300;
    const wrapped = computeWrappedScrollTop(1450, segmentHeight, viewportHeight);
    expect(wrapped).toBe(450);
  });

  it("stabilizes scrollTop when segment height changes", () => {
    expect(computeStabilizedScrollTop(600, 600, 648)).toBe(648);
    expect(computeStabilizedScrollTop(600, 600, 540)).toBe(540);
  });
});
