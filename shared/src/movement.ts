import { STATION_MAP as MAP, collides, isInsideStation, type Vec } from "./map/station.js";
import type { GameMap } from "./map/maps.js";
import type { MovementDirection } from "./index.js";

function canStand(x: number, y: number, map: GameMap) {
  return isInsideStation({ x, y }, map) && !collides(x, y, map.playerRadius, map);
}

export function movePosition(position: Vec, input: MovementDirection, seconds: number, map: GameMap = MAP): Vec {
  const horizontal = Number(input.right) - Number(input.left);
  const vertical = Number(input.down) - Number(input.up);
  const length = Math.hypot(horizontal, vertical);
  if (!length || seconds <= 0) return position;
  const distance = map.speed * seconds;
  const steps = Math.ceil(distance / (map.playerRadius / 2));
  const dx = horizontal * distance / (length * steps);
  const dy = vertical * distance / (length * steps);
  let { x, y } = position;
  for (let step = 0; step < steps; step += 1) {
    if (dx && canStand(x + dx, y, map)) x += dx;
    if (dy && canStand(x, y + dy, map)) y += dy;
  }
  return { x, y };
}

// Test the segment between actors so proximity on opposite sides of a wall is insufficient.
export function withinReach(from: Vec, to: Vec, radius: number, map: GameMap = MAP): boolean {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  if (distance > radius) return false;
  const steps = Math.ceil(distance / 8);
  for (let step = 1; step <= steps; step += 1) {
    const fraction = step / steps;
    if (collides(from.x + (to.x - from.x) * fraction, from.y + (to.y - from.y) * fraction, 1, map)) return false;
  }
  return true;
}
