export const EVENTS = {
  ROOM_CREATE: "room:create",
  ROOM_JOIN: "room:join",
  ROOM_STATE: "room:state",
  PLAYER_MOVE: "player:move",
  GAME_SNAPSHOT: "game:snapshot",
  ACTION_REJECTED: "action:rejected",
} as const;

export const MAP = {
  width: 1200,
  height: 760,
  playerRadius: 18,
  speed: 220,
  obstacles: [
    { x: 470, y: 250, width: 260, height: 180 },
    { x: 120, y: 120, width: 180, height: 70 },
    { x: 900, y: 560, width: 180, height: 70 },
  ],
} as const;

export interface PlayerState {
  id: string;
  name: string;
  x: number;
  y: number;
  color: number;
  isHost: boolean;
}

export interface RoomState {
  code: string;
  players: PlayerState[];
  maxPlayers: number;
}

export interface MoveInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  sequence: number;
}

export interface RoomRequest {
  playerName: string;
}

export interface JoinRoomRequest extends RoomRequest {
  roomCode: string;
}

export type RoomAck =
  | { ok: true; room: RoomState; playerId: string }
  | { ok: false; errorCode: string; message: string };
