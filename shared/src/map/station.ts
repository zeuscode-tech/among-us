import type { TaskSpotKind } from "../tasks.js";

/**
 * Карта «Орбитальная станция» — единая геометрия для клиента и сервера.
 *
 * Модуль не зависит ни от Phaser, ни от Node. Клиент рисует по нему карту,
 * сервер проверяет по нему движение (`collides`). Все координаты в пикселях мира;
 * прямоугольник — левый верхний угол + размеры.
 */

export interface Vec { x: number; y: number }
export interface Box { x: number; y: number; width: number; height: number }

export type RoomId = string;

export interface Room extends Box {
  id: RoomId;
  /** Подпись на полу. */
  label: string;
  /** Цвет пола (0xRRGGBB). */
  floor: number;
  /** Неоновый акцент стен и освещения. */
  accent: number;
}

export type Side = "top" | "bottom" | "left" | "right";

export interface Corridor extends Box {
  id: string;
  /** "h" соединяет комнаты слева и справа, "v" — сверху и снизу. */
  axis: "h" | "v";
}

export interface Door { roomId: RoomId; side: Side; from: number; to: number; corridorId: string }

export type PropKind =
  | "table" | "crate" | "console" | "reactorCore" | "bed" | "locker"
  | "navWindow" | "serverRack" | "tank" | "holoTable";

export interface Prop extends Box { kind: PropKind }


export interface TaskSpot extends Vec { id: string; kind: TaskSpotKind; roomId: RoomId }

/** Толщина стены. */
export const WALL = 24;
export const PLAYER_RADIUS = 18;
export const PLAYER_SPEED = 220;
export const MAP_WIDTH = 2600;
export const MAP_HEIGHT = 1840;

export const ROOMS: readonly Room[] = [
  { id: "lab",        label: "ЛАБОРАТОРИЯ", x: 200,  y: 140,  width: 440, height: 460, floor: 0x16323f, accent: 0x3ee6ff },
  { id: "cafeteria",  label: "СТОЛОВАЯ",    x: 1000, y: 140,  width: 600, height: 460, floor: 0x222b47, accent: 0x7f9bff },
  { id: "comms",      label: "СВЯЗЬ",       x: 1960, y: 140,  width: 440, height: 460, floor: 0x1a3326, accent: 0x5dff9e },
  { id: "reactor",    label: "РЕАКТОР",     x: 120,  y: 820,  width: 440, height: 440, floor: 0x361c22, accent: 0xff5a5a },
  { id: "storage",    label: "СКЛАД",       x: 1000, y: 820,  width: 600, height: 440, floor: 0x332c1b, accent: 0xffc44d },
  { id: "navigation", label: "НАВИГАЦИЯ",   x: 2040, y: 820,  width: 440, height: 440, floor: 0x1a2742, accent: 0x52b4ff },
  { id: "electrical", label: "ЭЛЕКТРИКА",   x: 760,  y: 1380, width: 480, height: 360, floor: 0x2e2a0e, accent: 0xfff25a },
  { id: "admin",      label: "АДМИН",       x: 1360, y: 1380, width: 480, height: 360, floor: 0x2c1f40, accent: 0xc77dff },
];

/** Коридоры шириной 160 (проход 112 между стенами). Концы касаются комнат вплотную. */
export const CORRIDORS: readonly Corridor[] = [
  { id: "lab-cafeteria",      axis: "h", x: 640,  y: 290,  width: 360, height: 160 },
  { id: "cafeteria-comms",    axis: "h", x: 1600, y: 290,  width: 360, height: 160 },
  { id: "cafeteria-storage",  axis: "v", x: 1220, y: 600,  width: 160, height: 220 },
  { id: "lab-reactor",        axis: "v", x: 300,  y: 600,  width: 160, height: 220 },
  { id: "comms-navigation",   axis: "v", x: 2140, y: 600,  width: 160, height: 220 },
  { id: "reactor-storage",    axis: "h", x: 560,  y: 960,  width: 440, height: 160 },
  { id: "storage-navigation", axis: "h", x: 1600, y: 960,  width: 440, height: 160 },
  { id: "storage-electrical", axis: "v", x: 1040, y: 1260, width: 160, height: 120 },
  { id: "storage-admin",      axis: "v", x: 1400, y: 1260, width: 160, height: 120 },
  { id: "electrical-admin",   axis: "h", x: 1240, y: 1480, width: 120, height: 160 },
];

/** Мебель. Вся она твёрдая — сквозь неё не пройти. */
export const PROPS: readonly Prop[] = [
  // Столовая: четыре стола вокруг свободного центра, где появляются игроки.
  { kind: "table", x: 1060, y: 196, width: 130, height: 60 },
  { kind: "table", x: 1410, y: 196, width: 130, height: 60 },
  { kind: "table", x: 1060, y: 500, width: 130, height: 60 },
  { kind: "table", x: 1410, y: 500, width: 130, height: 60 },
  // Лаборатория
  { kind: "holoTable", x: 360, y: 300, width: 120, height: 90 },
  { kind: "bed",       x: 228, y: 470, width: 70,  height: 104 },
  { kind: "bed",       x: 542, y: 470, width: 70,  height: 104 },
  { kind: "locker",    x: 228, y: 164, width: 96,  height: 34 },
  // Связь
  { kind: "serverRack", x: 1988, y: 168, width: 50,  height: 130 },
  { kind: "serverRack", x: 2322, y: 168, width: 50,  height: 130 },
  { kind: "console",    x: 2120, y: 164, width: 120, height: 40 },
  // Реактор
  { kind: "reactorCore", x: 270, y: 970,  width: 140, height: 140 },
  { kind: "tank",        x: 150, y: 848,  width: 60,  height: 60 },
  { kind: "tank",        x: 150, y: 1172, width: 60,  height: 60 },
  // Склад
  { kind: "crate", x: 1048, y: 848,  width: 70, height: 70 },
  { kind: "crate", x: 1124, y: 848,  width: 70, height: 70 },
  { kind: "crate", x: 1048, y: 1164, width: 70, height: 70 },
  { kind: "crate", x: 1430, y: 1164, width: 70, height: 70 },
  { kind: "crate", x: 1510, y: 1180, width: 54, height: 54 },
  { kind: "tank",  x: 1510, y: 848,  width: 60, height: 60 },
  // Навигация
  { kind: "navWindow", x: 2432, y: 880,  width: 24, height: 320 },
  { kind: "console",   x: 2340, y: 1000, width: 60, height: 80 },
  // Электрика
  { kind: "serverRack", x: 788,  y: 1596, width: 50, height: 120 },
  { kind: "serverRack", x: 1162, y: 1596, width: 50, height: 120 },
  // Админ
  { kind: "holoTable", x: 1540, y: 1510, width: 140, height: 90 },
  { kind: "locker",    x: 1720, y: 1682, width: 96,  height: 34 },
];

/** Точки заданий. На карте есть панель для каждого типа задачи. */
export const TASK_SPOTS: readonly TaskSpot[] = [
  { id: "trace-electrical", kind: "trace", roomId: "electrical", x: 1000, y: 1420 },
  { id: "decode-admin",     kind: "decode", roomId: "admin",      x: 1420, y: 1690 },
  { id: "echo-comms",       kind: "echo", roomId: "comms",      x: 2290, y: 560 },
  { id: "sample-lab",       kind: "sample", roomId: "lab",        x: 590,  y: 190 },
  { id: "balance-reactor",  kind: "balance",  roomId: "reactor",    x: 180,  y: 1040 },
  { id: "spectrum-storage", kind: "spectrum",  roomId: "storage",    x: 1450, y: 870 },
  { id: "orbit-navigation", kind: "orbit",  roomId: "navigation", x: 2300, y: 1220 },
];

/** 10 мест появления: две ряда по пять в центре столовой. */
export const SPAWN_POINTS: readonly Vec[] = Array.from({ length: 10 }, (_, i) => ({
  x: 1160 + (i % 5) * 70,
  y: 340 + Math.floor(i / 5) * 72,
}));

// ───────────────────────── генерация стен ─────────────────────────

const touchSide = (c: Corridor, r: Room): Side | null => {
  if (c.axis === "h") {
    if (c.y < r.y || c.y + c.height > r.y + r.height) return null;
    if (c.x + c.width === r.x) return "left";
    if (c.x === r.x + r.width) return "right";
  } else {
    if (c.x < r.x || c.x + c.width > r.x + r.width) return null;
    if (c.y + c.height === r.y) return "top";
    if (c.y === r.y + r.height) return "bottom";
  }
  return null;
};

/** Проёмы в стенах комнат там, где примыкают коридоры. */
function buildDoors(rooms: readonly Room[], corridors: readonly Corridor[]): Door[] {
  return corridors.flatMap((corridor) =>
    rooms.flatMap((room) => {
      const side = touchSide(corridor, room);
      if (!side) return [];
      const [from, to] = corridor.axis === "h"
        ? [corridor.y + WALL, corridor.y + corridor.height - WALL]
        : [corridor.x + WALL, corridor.x + corridor.width - WALL];
      return [{ roomId: room.id, side, from, to, corridorId: corridor.id }];
    }),
  );
}
/** Вычитает проёмы из отрезка [a, b]. */
function cut(a: number, b: number, holes: Array<[number, number]>): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let cur = a;
  for (const [from, to] of [...holes].sort((p, q) => p[0] - q[0])) {
    if (from > cur) out.push([cur, from]);
    cur = Math.max(cur, to);
  }
  if (cur < b) out.push([cur, b]);
  return out;
}

function buildWalls(rooms: readonly Room[], corridors: readonly Corridor[], doors: readonly Door[]): Box[] {
  const walls: Box[] = [];
  for (const r of rooms) {
    const holes = (side: Side) =>
      doors.filter((d) => d.roomId === r.id && d.side === side).map((d): [number, number] => [d.from, d.to]);
    const right = r.x + r.width;
    const bottom = r.y + r.height;
    for (const [a, b] of cut(r.x, right, holes("top"))) walls.push({ x: a, y: r.y, width: b - a, height: WALL });
    for (const [a, b] of cut(r.x, right, holes("bottom"))) walls.push({ x: a, y: bottom - WALL, width: b - a, height: WALL });
    for (const [a, b] of cut(r.y, bottom, holes("left"))) walls.push({ x: r.x, y: a, width: WALL, height: b - a });
    for (const [a, b] of cut(r.y, bottom, holes("right"))) walls.push({ x: right - WALL, y: a, width: WALL, height: b - a });
  }
  for (const c of corridors) {
    if (c.axis === "h") {
      walls.push({ x: c.x, y: c.y, width: c.width, height: WALL }, { x: c.x, y: c.y + c.height - WALL, width: c.width, height: WALL });
    } else {
      walls.push({ x: c.x, y: c.y, width: WALL, height: c.height }, { x: c.x + c.width - WALL, y: c.y, width: WALL, height: c.height });
    }
  }
  return walls;
}

export function buildGeometry(rooms: readonly Room[], corridors: readonly Corridor[], props: readonly Prop[]) {
  const doors = buildDoors(rooms, corridors);
  const walls = buildWalls(rooms, corridors, doors);
  const obstacles: readonly Box[] = [...walls, ...props];
  return { doors, walls, obstacles, walkable: [...rooms, ...corridors] };
}
const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

/** Пересекает ли круг игрока (центр x, y) хоть одно препятствие. Та же формула, что на сервере. */
export function collides(x: number, y: number, radius = PLAYER_RADIUS, map: typeof STATION_MAP = STATION_MAP): boolean {
  return map.obstacles.some((o) => {
    const nx = clamp(x, o.x, o.x + o.width);
    const ny = clamp(y, o.y, o.y + o.height);
    const dx = x - nx;
    const dy = y - ny;
    return dx * dx + dy * dy < radius * radius;
  });
}

/** Внутри ли точка комнаты или коридора (а не в открытом космосе). */
export function isInsideStation(p: Vec, map: typeof STATION_MAP = STATION_MAP): boolean {
  return map.walkable.some((a) => p.x >= a.x && p.x <= a.x + a.width && p.y >= a.y && p.y <= a.y + a.height);
}

export function roomAt(p: Vec, map: typeof STATION_MAP = STATION_MAP): Room | undefined {
  return map.rooms.find((r) => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height);
}

export const STATION_MAP = {
  id: "station" as "station" | "abyss",
  width: MAP_WIDTH,
  height: MAP_HEIGHT,
  playerRadius: PLAYER_RADIUS,
  speed: PLAYER_SPEED,
  spawnPoints: SPAWN_POINTS,
  rooms: ROOMS,
  corridors: CORRIDORS,
  props: PROPS,
  taskSpots: TASK_SPOTS,
  ...buildGeometry(ROOMS, CORRIDORS, PROPS),
};
