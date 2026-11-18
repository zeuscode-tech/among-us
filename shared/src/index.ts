import type { MapId } from "./map/maps.js";
import type { TaskChallenge, TaskProof } from "./tasks.js";

export { STATION_MAP as MAP, collides, isInsideStation, roomAt, WALL } from "./map/station.js";
export type { Box, Corridor, Door, Prop, PropKind, Room, RoomId, TaskSpot, Vec } from "./map/station.js";
export { GAME_MAPS, MAP_INFO, isMapId } from "./map/maps.js";
export type { GameMap, MapId } from "./map/maps.js";
export { TASKS } from "./tasks.js";
export type { Puzzle, TaskChallenge, TaskProof, TaskSpotKind } from "./tasks.js";
export { movePosition, withinReach } from "./movement.js";

export const EVENTS = {
  ROOM_RESUME: "room:resume",
  ROOM_MAP: "room:map",
  ROOM_CREATE: "room:create",
  ROOM_JOIN: "room:join",
  ROOM_LEAVE: "room:leave",
  ROOM_STATE: "room:state",
  PLAYER_READY: "player:ready",
  PLAYER_MOVE: "player:move",
  PLAYER_PRIVATE_STATE: "player:private-state",
  PLAYER_KILL: "player:kill",
  GAME_START: "game:start",
  GAME_SNAPSHOT: "game:snapshot",
  GAME_ENDED: "game:ended",
  GAME_RETURN: "game:return",
  TASK_INTERACT: "task:interact",
  TASK_COMPLETE: "task:complete",
  TASK_PROGRESS: "task:progress",
  BODY_REPORT: "body:report",
  MEETING_STARTED: "meeting:started",
  VOTE_CAST: "vote:cast",
  VOTE_RESULT: "vote:result",
} as const;

export const TICK_MS = 50;
export const INPUT_INTERVAL_MS = 50;
export const TASK_RADIUS = 65;
export const KILL_RADIUS = 92;
export const REPORT_RADIUS = 120;

export type GamePhase = "lobby" | "starting" | "playing" | "meeting" | "voting" | "ended";
export type Role = "crew" | "impostor";
export type WinReason = "tasks" | "impostors_eliminated" | "parity";

export interface PlayerState {
  id: string;
  name: string;
  color: number;
  isHost: boolean;
  ready: boolean;
  connected: boolean;
  alive: boolean;
}

export interface PositionedPlayer extends PlayerState {
  x: number;
  y: number;
  sequence: number;
}

export interface TaskProgress {
  completed: number;
  total: number;
}

export interface MeetingState {
  reporter: PlayerState;
  deadline: number;
}

export interface VoteResult {
  ejected: PlayerState | null;
  outcome: "ejected" | "skip" | "tie" | "no_votes";
  skip: number;
  tally: Record<string, number>;
}

export interface GameResult {
  winner: Role;
  reason: WinReason;
  players: Array<PlayerState & { role: Role }>;
}

export interface RoomState {
  code: string;
  mapId: MapId;
  players: PlayerState[];
  minPlayers: number;
  maxPlayers: number;
  phase: GamePhase;
  round: number;
  serverTime: number;
  meeting: MeetingState | null;
  progress: TaskProgress;
  voteResult: VoteResult | null;
  result: GameResult | null;
}

export interface BodyState {
  id: string;
  color: number;
  x: number;
  y: number;
}

export interface GameSnapshot {
  code: string;
  mapId: MapId;
  round: number;
  phase: GamePhase;
  serverTime: number;
  players: PositionedPlayer[];
  bodies: BodyState[];
}

export interface AssignedTask {
  id: string;
  spotId: string;
  completed: boolean;
}

export interface PrivateState {
  code: string;
  round: number;
  role: Role | null;
  tasks: AssignedTask[];
  killAvailableAt: number | null;
  hasVoted: boolean;
}

export type MovementDirection = Record<"up" | "down" | "left" | "right", boolean>;
export interface MoveInput extends MovementDirection {
  sequence: number;
}

export interface RoomRequest { playerName: string }
export interface JoinRoomRequest extends RoomRequest { roomCode: string }
export interface RoomMembership { room: RoomState; playerId: string; sessionToken: string }
export interface ResumedMembership extends RoomMembership { snapshot: GameSnapshot; privateState: PrivateState }

export type ErrorCode =
  | "INVALID_PAYLOAD" | "INVALID_NAME" | "ROOM_NOT_FOUND" | "ROOM_FULL" | "NAME_TAKEN"
  | "MATCH_ALREADY_STARTED" | "NOT_HOST" | "INVALID_PLAYER_COUNT" | "PLAYERS_NOT_READY"
  | "WRONG_PHASE" | "PLAYER_DEAD" | "NOT_IMPOSTOR" | "INVALID_TARGET" | "TOO_FAR"
  | "COOLDOWN" | "INVALID_TASK" | "ALREADY_VOTED" | "RATE_LIMIT" | "INTERNAL_ERROR"
  | "ALREADY_IN_ROOM" | "SESSION_EXPIRED";

export type GameAck<T> =
  | { ok: true; data: T }
  | { ok: false; errorCode: ErrorCode; message: string };

export type Acknowledge<T = null> = (ack: GameAck<T>) => void;

export interface ClientEvents {
  [EVENTS.ROOM_RESUME]: (request: { sessionToken: string }, ack: Acknowledge<ResumedMembership>) => void;
  [EVENTS.ROOM_MAP]: (request: { mapId: MapId }, ack: Acknowledge) => void;
  [EVENTS.ROOM_CREATE]: (request: RoomRequest, ack: Acknowledge<RoomMembership>) => void;
  [EVENTS.ROOM_JOIN]: (request: JoinRoomRequest, ack: Acknowledge<RoomMembership>) => void;
  [EVENTS.ROOM_LEAVE]: (ack: Acknowledge) => void;
  [EVENTS.PLAYER_READY]: (request: { ready: boolean }, ack: Acknowledge) => void;
  [EVENTS.PLAYER_MOVE]: (input: MoveInput, ack?: Acknowledge) => void;
  [EVENTS.GAME_START]: (ack: Acknowledge) => void;
  [EVENTS.GAME_RETURN]: (ack: Acknowledge) => void;
  [EVENTS.TASK_INTERACT]: (request: { taskId: string }, ack: Acknowledge<TaskChallenge>) => void;
  [EVENTS.TASK_COMPLETE]: (request: { taskId: string; proof: TaskProof }, ack: Acknowledge) => void;
  [EVENTS.PLAYER_KILL]: (request: { targetId: string }, ack: Acknowledge) => void;
  [EVENTS.BODY_REPORT]: (request: { bodyId: string }, ack: Acknowledge) => void;
  [EVENTS.VOTE_CAST]: (request: { targetId: string | null }, ack: Acknowledge) => void;
}

export interface ServerEvents {
  [EVENTS.ROOM_STATE]: (state: RoomState) => void;
  [EVENTS.GAME_SNAPSHOT]: (snapshot: GameSnapshot) => void;
  [EVENTS.PLAYER_PRIVATE_STATE]: (state: PrivateState) => void;
  [EVENTS.TASK_PROGRESS]: (progress: TaskProgress) => void;
  [EVENTS.MEETING_STARTED]: (meeting: MeetingState) => void;
  [EVENTS.VOTE_RESULT]: (result: VoteResult) => void;
  [EVENTS.GAME_ENDED]: (result: GameResult) => void;
}
