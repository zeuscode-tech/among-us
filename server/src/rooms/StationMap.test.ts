import assert from "node:assert/strict";
import test from "node:test";
import { MAP, collides, isInsideStation } from "@among-us/shared";

const STEP = 8;
const TASK_DISTANCE = 65;

/** Все точки сетки, до которых игрок может дойти от первого спавна. */
function reachable(): Array<{ x: number; y: number }> {
  const start = MAP.spawnPoints[0]!;
  const key = (x: number, y: number) => `${x},${y}`;
  const seen = new Set([key(start.x, start.y)]);
  const queue = [start];
  const out: Array<{ x: number; y: number }> = [];
  while (queue.length) {
    const p = queue.pop()!;
    out.push(p);
    for (const [dx, dy] of [[STEP, 0], [-STEP, 0], [0, STEP], [0, -STEP]] as const) {
      const n = { x: p.x + dx, y: p.y + dy };
      const r = MAP.playerRadius;
      if (n.x < r || n.y < r || n.x > MAP.width - r || n.y > MAP.height - r) continue;
      if (seen.has(key(n.x, n.y)) || collides(n.x, n.y)) continue;
      seen.add(key(n.x, n.y));
      queue.push(n);
    }
  }
  return out;
}

const area = reachable();

test("все места спавна свободны и разнесены", () => {
  for (const p of MAP.spawnPoints) assert.equal(collides(p.x, p.y), false, `спавн ${p.x},${p.y} в препятствии`);
  for (const a of MAP.spawnPoints) for (const b of MAP.spawnPoints) {
    if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= MAP.playerRadius * 2, "игроки появляются друг в друге");
  }
});

test("игрок не может выйти в открытый космос", () => {
  const outside = area.find((p) => !isInsideStation(p));
  assert.equal(outside, undefined, `утечка из станции в ${JSON.stringify(outside)}`);
});

test("до каждой комнаты можно дойти от спавна", () => {
  for (const room of MAP.rooms) {
    assert.ok(area.some((p) => p.x > room.x && p.x < room.x + room.width && p.y > room.y && p.y < room.y + room.height), `не дойти до ${room.id}`);
  }
});

test("каждая точка задания досягаема", () => {
  for (const spot of MAP.taskSpots) {
    assert.ok(area.some((p) => Math.hypot(p.x - spot.x, p.y - spot.y) <= TASK_DISTANCE - 10), `задание ${spot.id} недосягаемо`);
  }
});

test("каждый коридор соединяет ровно две комнаты", () => {
  for (const c of MAP.corridors) {
    assert.equal(MAP.doors.filter((d) => d.corridorId === c.id).length, 2, `коридор ${c.id}`);
  }
});
