/**
 * Computes whether the 3-segment infinite loop should be active.
 * Loop is enabled only when there is at least one item and content height exceeds viewport height.
 */
export function shouldEnableLoop(
  itemCount: number,
  segmentHeight: number,
  viewportHeight: number
): boolean {
  if (itemCount === 0 || segmentHeight <= 0 || viewportHeight <= 0) {
    return false;
  }
  return segmentHeight > viewportHeight + 2;
}

/**
 * Normalizes scrollTop within a 3-segment [A, B, C] container of segment height S.
 * Keeps the scroll offset seamlessly inside the middle band without jumping visually.
 */
export function computeWrappedScrollTop(
  scrollTop: number,
  segmentHeight: number,
  viewportHeight: number
): number | null {
  if (segmentHeight <= 0 || segmentHeight <= viewportHeight) {
    return null;
  }

  const lowThreshold = segmentHeight * 0.25;
  const highThreshold = segmentHeight * 1.75;

  if (scrollTop < lowThreshold) {
    let next = scrollTop;
    while (next < lowThreshold) {
      next += segmentHeight;
    }
    return next;
  }

  if (scrollTop > highThreshold) {
    let next = scrollTop;
    while (next > highThreshold) {
      next -= segmentHeight;
    }
    return next;
  }

  return null;
}

/**
 * Adjusts scrollTop when the primary segment height changes (e.g. item added/deleted/resized)
 * so the user's current visible position stays stable.
 */
export function computeStabilizedScrollTop(
  prevScrollTop: number,
  prevSegmentHeight: number,
  nextSegmentHeight: number
): number {
  if (prevSegmentHeight <= 0 || nextSegmentHeight <= 0) {
    return nextSegmentHeight;
  }
  const delta = nextSegmentHeight - prevSegmentHeight;
  return Math.max(0, prevScrollTop + delta);
}
