export interface TiltAngles {
  rotateX: number;
  rotateY: number;
}

/**
 * Computes 3D tilt angles (degrees) from pointer coordinates inside an element rect.
 * Clamped to [-maxDeg, +maxDeg].
 */
export function computeTiltAngles(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  maxDeg = 12
): TiltAngles {
  if (rect.width <= 0 || rect.height <= 0) {
    return { rotateX: 0, rotateY: 0 };
  }

  const rawNx = ((clientX - rect.left) / rect.width) * 2 - 1;
  const rawNy = ((clientY - rect.top) / rect.height) * 2 - 1;

  const nx = Math.max(-1, Math.min(1, rawNx));
  const ny = Math.max(-1, Math.min(1, rawNy));

  const rotateX = Number((-ny * maxDeg).toFixed(2));
  const rotateY = Number((nx * maxDeg).toFixed(2));

  return { rotateX, rotateY };
}
