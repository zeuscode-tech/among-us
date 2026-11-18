import { STATION_MAP, buildGeometry, PLAYER_RADIUS, PLAYER_SPEED, type Corridor, type Room, type Prop, type TaskSpot, type Vec } from "./station.js";

const rooms: readonly Room[] = [
  { id: "reef", label: "РИФОВАЯ ЛАБОРАТОРИЯ", x: 230, y: 260, width: 610, height: 470, floor: 0x123845, accent: 0x55e4d2 },
  { id: "dock", label: "ШЛЮЗ", x: 1260, y: 200, width: 730, height: 530, floor: 0x183950, accent: 0x86ddff },
  { id: "kelp", label: "САД ВОДОРОСЛЕЙ", x: 2470, y: 240, width: 760, height: 490, floor: 0x234736, accent: 0x9de375 },
  { id: "ballast", label: "БАЛЛАСТ", x: 160, y: 1060, width: 680, height: 520, floor: 0x43412b, accent: 0xfbd16a },
  { id: "archive", label: "АРХИВ ГЛУБИН", x: 1260, y: 1040, width: 730, height: 540, floor: 0x2b324d, accent: 0xc1b5ff },
  { id: "sonar", label: "ГИДРОЛОКАТОР", x: 2470, y: 1040, width: 800, height: 540, floor: 0x16414b, accent: 0x62f2f7 },
  { id: "trench", label: "ОБСЕРВАТОРИЯ", x: 160, y: 1900, width: 680, height: 460, floor: 0x212947, accent: 0x989fff },
  { id: "vault", label: "ХРАНИЛИЩЕ КЕРНОВ", x: 1260, y: 1870, width: 730, height: 520, floor: 0x3b3052, accent: 0xea9ff5 },
  { id: "vent", label: "ТЕРМАЛЬНЫЙ УЗЕЛ", x: 2470, y: 1880, width: 800, height: 480, floor: 0x4c3033, accent: 0xffaa74 },
];

const corridors: readonly Corridor[] = [
  { id: "reef-dock", axis: "h", x: 840, y: 390, width: 420, height: 160 },
  { id: "dock-kelp", axis: "h", x: 1990, y: 470, width: 480, height: 160 },
  { id: "reef-ballast", axis: "v", x: 380, y: 730, width: 170, height: 330 },
  { id: "kelp-sonar", axis: "v", x: 2880, y: 730, width: 180, height: 310 },
  { id: "dock-archive", axis: "v", x: 1540, y: 730, width: 170, height: 310 },
  { id: "archive-sonar", axis: "h", x: 1990, y: 1210, width: 480, height: 185 },
  { id: "ballast-trench", axis: "v", x: 515, y: 1580, width: 160, height: 320 },
  { id: "sonar-vent", axis: "v", x: 2750, y: 1580, width: 160, height: 300 },
  { id: "trench-vault", axis: "h", x: 840, y: 2030, width: 420, height: 160 },
  { id: "vault-vent", axis: "h", x: 1990, y: 2110, width: 480, height: 160 },
  { id: "archive-vault", axis: "v", x: 1700, y: 1580, width: 160, height: 290 },
];

const props: readonly Prop[] = [
  { kind: "holoTable", x: 465, y: 407, width: 160, height: 118 },
  { kind: "bed", x: 270, y: 610, width: 130, height: 82 },
  { kind: "locker", x: 702, y: 297, width: 96, height: 45 },
  { kind: "tank", x: 1300, y: 253, width: 106, height: 106 },
  { kind: "tank", x: 1830, y: 253, width: 106, height: 106 },
  { kind: "table", x: 1300, y: 625, width: 126, height: 62 },
  { kind: "table", x: 1830, y: 640, width: 110, height: 55 },
  { kind: "tank", x: 2570, y: 300, width: 134, height: 134 },
  { kind: "tank", x: 2790, y: 395, width: 132, height: 132 },
  { kind: "tank", x: 3056, y: 535, width: 124, height: 124 },
  { kind: "reactorCore", x: 350, y: 1240, width: 220, height: 160 },
  { kind: "crate", x: 210, y: 1120, width: 72, height: 89 },
  { kind: "crate", x: 685, y: 1450, width: 100, height: 76 },
  { kind: "serverRack", x: 1350, y: 1210, width: 126, height: 245 },
  { kind: "serverRack", x: 1530, y: 1180, width: 108, height: 205 },
  { kind: "serverRack", x: 1735, y: 1200, width: 100, height: 155 },
  { kind: "holoTable", x: 2760, y: 1200, width: 210, height: 162 },
  { kind: "console", x: 2540, y: 1456, width: 135, height: 71 },
  { kind: "navWindow", x: 3220, y: 1120, width: 24, height: 320 },
  { kind: "navWindow", x: 195, y: 1970, width: 29, height: 308 },
  { kind: "holoTable", x: 388, y: 2080, width: 180, height: 100 },
  { kind: "locker", x: 654, y: 1945, width: 146, height: 53 },
  { kind: "crate", x: 1350, y: 1940, width: 100, height: 95 },
  { kind: "crate", x: 1485, y: 2020, width: 105, height: 190 },
  { kind: "crate", x: 1815, y: 1950, width: 100, height: 94 },
  { kind: "tank", x: 1730, y: 2234, width: 153, height: 104 },
  { kind: "reactorCore", x: 2870, y: 2075, width: 220, height: 192 },
  { kind: "tank", x: 2550, y: 1940, width: 128, height: 105 },
  { kind: "console", x: 3135, y: 2210, width: 83, height: 77 },
];

const taskSpots: readonly TaskSpot[] = [
  { id: "reef-sample", kind: "sample", roomId: "reef", x: 300, y: 342 },
  { id: "ballast-balance", kind: "balance", roomId: "ballast", x: 742, y: 1150 },
  { id: "kelp-trace", kind: "trace", roomId: "kelp", x: 2720, y: 640 },
  { id: "archive-decode", kind: "decode", roomId: "archive", x: 1320, y: 1494 },
  { id: "sonar-echo", kind: "echo", roomId: "sonar", x: 3105, y: 1100 },
  { id: "trench-orbit", kind: "orbit", roomId: "trench", x: 310, y: 2288 },
  { id: "vent-spectrum", kind: "spectrum", roomId: "vent", x: 3185, y: 1958 },
  { id: "vault-sample", kind: "sample", roomId: "vault", x: 1645, y: 2260 },
  { id: "dock-decode", kind: "decode", roomId: "dock", x: 1660, y: 283 },
];

const spawnPoints: readonly Vec[] = Array.from({ length: 10 }, (_, i) => ({
  x: 1470 + (i % 5) * 70, y: 433 + Math.floor(i / 5) * 72,
}));

export const MAP_INFO = {
  station: { name: "Орбитальная станция", description: "Восемь отсеков · реактор и открытый космос" },
  abyss: { name: "Глубинный маяк", description: "Девять залов · подводные шлюзы и термальный узел" },
} as const;

export type MapId = keyof typeof MAP_INFO;
export type GameMap = typeof STATION_MAP;

const abyss: GameMap = {
  id: "abyss", width: 3480, height: 2530, playerRadius: PLAYER_RADIUS, speed: PLAYER_SPEED,
  rooms, corridors, props, taskSpots, spawnPoints, ...buildGeometry(rooms, corridors, props),
};

export const GAME_MAPS: Record<MapId, GameMap> = { station: STATION_MAP, abyss };

export function isMapId(value: unknown): value is MapId {
  return value === "station" || value === "abyss";
}
