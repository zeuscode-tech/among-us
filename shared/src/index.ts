export const EVENTS = {
  ROOM_CREATE: "room:create",
  ROOM_JOIN: "room:join",
  ROOM_STATE: "room:state",
  PLAYER_MOVE: "player:move",
  GAME_SNAPSHOT: "game:snapshot",
  ACTION_REJECTED: "action:rejected",
} as const;

export { STATION_MAP as MAP, collides, isInsideStation, roomAt } from "./map/station.js";
export type { Box, Corridor, Door, Prop, PropKind, Room, RoomId, TaskSpot, TaskSpotKind, Vec } from "./map/station.js";

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
