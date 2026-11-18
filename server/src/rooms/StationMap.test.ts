import assert from "node:assert/strict";
import test from "node:test";
import { GAME_MAPS, TASK_RADIUS, TASKS, collides, isInsideStation, withinReach, type GameMap, type Vec } from "@among-us/shared";

function reachable(map: GameMap): Vec[] {
  const step = 8;
  const start = map.spawnPoints[0]!;
  const key = ({ x, y }: Vec) => `${x},${y}`;
  const seen = new Set([key(start)]);
  const queue = [start];
  const out: Vec[] = [];
  while (queue.length) {
    const p = queue.pop()!;
    out.push(p);
    for (const [dx, dy] of [[step, 0], [-step, 0], [0, step], [0, -step]] as const) {
      const n = { x: p.x + dx, y: p.y + dy };
      const r = map.playerRadius;
      if (n.x < r || n.y < r || n.x > map.width - r || n.y > map.height - r) continue;
      if (seen.has(key(n)) || collides(n.x, n.y, r, map)) continue;
      seen.add(key(n));
      queue.push(n);
    }
  }
  return out;
}

for (const map of Object.values(GAME_MAPS)) {
  const area = reachable(map);
  test(`${map.id}: all spawns are clear and separated`, () => {
    for (const p of map.spawnPoints) {
      assert.ok(isInsideStation(p, map));
      assert.equal(collides(p.x, p.y, map.playerRadius, map), false);
      for (const other of map.spawnPoints) {
        if (other !== p) assert.ok(Math.hypot(other.x - p.x, other.y - p.y) >= map.playerRadius * 2);
      }
    }
  });

  test(`${map.id}: every room is reachable and the hull is sealed`, () => {
    assert.equal(area.find((p) => !isInsideStation(p, map)), undefined);
    for (const room of map.rooms) {
      assert.ok(area.some((p) => p.x > room.x && p.x < room.x + room.width && p.y > room.y && p.y < room.y + room.height), room.id);
    }
    for (const corridor of map.corridors) {
      assert.equal(map.doors.filter((entry) => entry.corridorId === corridor.id).length, 2, corridor.id);
    }
  });

  test(`${map.id}: every task is within reach and all seven types have panels`, () => {
    assert.deepEqual([...new Set(map.taskSpots.map((spot) => spot.kind))].sort(), Object.keys(TASKS).sort());
    for (const spot of map.taskSpots) {
      assert.ok(area.some((p) => withinReach(p, spot, TASK_RADIUS - 10, map)), spot.id);
    }
  });
}
