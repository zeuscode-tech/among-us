import { MAP, type MoveInput, type PlayerState, type RoomState } from "@among-us/shared";

interface InternalRoom {
  code: string;
  players: Map<string, PlayerState>;
}

const COLORS = [0x5eead4, 0xf87171, 0x60a5fa, 0xfbbf24, 0xc084fc, 0xfb7185, 0xa3e635, 0x38bdf8, 0xf97316, 0xe879f9];
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export class RoomStore {
  private readonly rooms = new Map<string, InternalRoom>();
  private readonly socketToRoom = new Map<string, string>();
  private readonly lastMoveAt = new Map<string, number>();

  constructor(private readonly random: () => number = Math.random) {}

  create(socketId: string, rawName: string): RoomState {
    const name = validateName(rawName);
    this.leave(socketId);
    const code = this.createUniqueCode();
    const room: InternalRoom = { code, players: new Map() };
    room.players.set(socketId, makePlayer(socketId, name, true, 0));
    this.rooms.set(code, room);
    this.socketToRoom.set(socketId, code);
    return publicRoom(room);
  }

  join(socketId: string, rawCode: string, rawName: string): RoomState {
    const code = rawCode.trim().toUpperCase();
    const name = validateName(rawName);
    const room = this.rooms.get(code);
    if (!room) throw new RoomError("ROOM_NOT_FOUND", "Комната не найдена");
    if (room.players.size >= 10) throw new RoomError("ROOM_FULL", "В комнате уже 10 игроков");
    if ([...room.players.values()].some((player) => player.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      throw new RoomError("NAME_TAKEN", "Это имя уже занято в комнате");
    }

    this.leave(socketId);
    room.players.set(socketId, makePlayer(socketId, name, false, room.players.size));
    this.socketToRoom.set(socketId, code);
    return publicRoom(room);
  }

  move(socketId: string, input: MoveInput, now = Date.now()): RoomState | null {
    if (!isMoveInput(input)) return null;
    const room = this.getRoomForSocket(socketId);
    const player = room?.players.get(socketId);
    if (!room || !player) return null;

    const previous = this.lastMoveAt.get(socketId) ?? now - 50;
    const dt = Math.min(Math.max(now - previous, 16), 100) / 1000;
    this.lastMoveAt.set(socketId, now);
    const rawX = Number(input.right) - Number(input.left);
    const rawY = Number(input.down) - Number(input.up);
    const length = Math.hypot(rawX, rawY) || 1;
    const dx = (rawX / length) * MAP.speed * dt;
    const dy = (rawY / length) * MAP.speed * dt;

    const nextX = clamp(player.x + dx, MAP.playerRadius, MAP.width - MAP.playerRadius);
    if (!collides(nextX, player.y)) player.x = nextX;
    const nextY = clamp(player.y + dy, MAP.playerRadius, MAP.height - MAP.playerRadius);
    if (!collides(player.x, nextY)) player.y = nextY;

    return publicRoom(room);
  }

  leave(socketId: string): RoomState | null {
    const code = this.socketToRoom.get(socketId);
    if (!code) return null;
    const room = this.rooms.get(code);
    this.socketToRoom.delete(socketId);
    this.lastMoveAt.delete(socketId);
    if (!room) return null;

    const wasHost = room.players.get(socketId)?.isHost ?? false;
    room.players.delete(socketId);
    if (room.players.size === 0) {
      this.rooms.delete(code);
      return null;
    }
    if (wasHost) {
      const nextHost = room.players.values().next().value as PlayerState | undefined;
      if (nextHost) nextHost.isHost = true;
    }
    return publicRoom(room);
  }

  roomCodeFor(socketId: string): string | undefined {
    return this.socketToRoom.get(socketId);
  }

  private getRoomForSocket(socketId: string): InternalRoom | undefined {
    const code = this.socketToRoom.get(socketId);
    return code ? this.rooms.get(code) : undefined;
  }

  private createUniqueCode(): string {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      let code = "";
      for (let i = 0; i < 6; i += 1) code += CODE_ALPHABET[Math.floor(this.random() * CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
    throw new RoomError("CODE_GENERATION_FAILED", "Не удалось создать код комнаты");
  }
}

export class RoomError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

function validateName(rawName: string): string {
  const name = rawName.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 20) {
    throw new RoomError("INVALID_NAME", "Имя должно содержать от 2 до 20 символов");
  }
  if (!/^[\p{L}\p{N}_ -]+$/u.test(name)) {
    throw new RoomError("INVALID_NAME", "В имени разрешены буквы, цифры, пробел, _ и -");
  }
  return name;
}

function makePlayer(id: string, name: string, isHost: boolean, index: number): PlayerState {
  return {
    id,
    name,
    x: 220 + (index % 5) * 70,
    y: 360 + Math.floor(index / 5) * 70,
    color: COLORS[index % COLORS.length] ?? 0xffffff,
    isHost,
  };
}

function publicRoom(room: InternalRoom): RoomState {
  return { code: room.code, players: [...room.players.values()].map((player) => ({ ...player })), maxPlayers: 10 };
}

function isMoveInput(value: MoveInput): boolean {
  return !!value && [value.up, value.down, value.left, value.right].every((flag) => typeof flag === "boolean") && Number.isSafeInteger(value.sequence);
}

function collides(x: number, y: number): boolean {
  return MAP.obstacles.some((obstacle) => {
    const nearestX = clamp(x, obstacle.x, obstacle.x + obstacle.width);
    const nearestY = clamp(y, obstacle.y, obstacle.y + obstacle.height);
    return Math.hypot(x - nearestX, y - nearestY) < MAP.playerRadius;
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
