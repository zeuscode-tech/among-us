import { STATION_MAP as MAP, collides, isInsideStation, type Vec } from "./map/station.js";
import type { MovementDirection } from "./index.js";

function canStand(x: number, y: number) {
  return isInsideStation({ x, y }) && !collides(x, y);
}

export function movePosition(position: Vec, input: MovementDirection, seconds: number): Vec {
  const horizontal = Number(input.right) - Number(input.left);
  const vertical = Number(input.down) - Number(input.up);
  const length = Math.hypot(horizontal, vertical);
  if (!length || seconds <= 0) return position;
  const distance = MAP.speed * seconds;
  const steps = Math.ceil(distance / (MAP.playerRadius / 2));
  const dx = horizontal * distance / (length * steps);
  const dy = vertical * distance / (length * steps);
  let { x, y } = position;
  for (let step = 0; step < steps; step += 1) {
    if (dx && canStand(x + dx, y)) x += dx;
    if (dy && canStand(x, y + dy)) y += dy;
  }
  return { x, y };
}

// Test the segment between actors so proximity on opposite sides of a wall is insufficient.
export function withinReach(from: Vec, to: Vec, radius: number): boolean {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  if (distance > radius) return false;
  const steps = Math.ceil(distance / 8);
  for (let step = 1; step <= steps; step += 1) {
    const fraction = step / steps;
    if (collides(from.x + (to.x - from.x) * fraction, from.y + (to.y - from.y) * fraction, 1)) return false;
  }
  return true;
}
