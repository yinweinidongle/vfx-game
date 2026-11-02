/** Fade a lingering giant/halo when a subsequent tracking shot crosses its volume.
 * Coordinates are local to the spirit, whose wheel is centered at (0, 3.4, -.8).
 * Bolts and their real flight histories remain visible and keep dealing damage.
 */
export function spiritViewFade(x, y, z) {
  const distance = Math.max(Math.abs(z + .8), Math.max(0, Math.hypot(x, y - 3.4) - 4.2));
  const t = Math.max(0, Math.min(1, (distance - .8) / 1.8));
  return t * t * (3 - 2 * t);
}
