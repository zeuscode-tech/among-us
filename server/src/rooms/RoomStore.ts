import { randomInt, randomUUID } from "node:crypto";
import {
  KILL_RADIUS, MAP, REPORT_RADIUS, TASK_RADIUS, TICK_MS, TASKS, GAME_MAPS, isMapId, movePosition, withinReach,
  type AssignedTask, type BodyState, type ErrorCode, type GamePhase, type GameResult, type GameSnapshot,
  type GameMap, type MeetingState, type MoveInput, type PlayerState, type PrivateState, type Role, type RoomState,
  type TaskChallenge, type TaskProgress, type TaskSpot, type TaskSpotKind, type VoteResult, type WinReason,
} from "@among-us/shared";
import { acceptsAnswer, createChallenge } from "./puzzles.js";

interface Player extends PlayerState {
  slot: number;
  sessionToken: string;
  connectionId: string | null;
  disconnectDeadline: number;
  x: number;
  y: number;
  role: Role | null;
  sequence: number;
  input: MoveInput | null;
  inputAt: number;
  tasks: AssignedTask[];
  challenge: { taskId: string; puzzle: TaskChallenge; startedAt: number } | null;
  killAvailableAt: number | null;
}

interface Room {
  code: string;
  map: GameMap;
  players: Map<string, Player>;
  phase: GamePhase;
  round: number;
  deadline: number;
  simulationAt: number;
  bodies: BodyState[];
  votes: Map<string, string | null>;
  progress: TaskProgress;
  meeting: MeetingState | null;
  voteResult: VoteResult | null;
  result: GameResult | null;
  events: RoomEvents;
}

interface RoomEvents {
  meeting?: MeetingState;
  vote?: VoteResult;
  ended?: GameResult;
  progress?: TaskProgress;
}

export interface RoomUpdate {
  state: RoomState;
  snapshot: GameSnapshot;
  privateStates: Array<[string, PrivateState]>;
  events: RoomEvents;
}

export interface GameOptions {
  minPlayers: number;
  startingMs: number;
  discussionMs: number;
  votingMs: number;
  killCooldownMs: number;
  sessionGraceMs: number;
  now: () => number;
  random: () => number;
}

export const DEFAULT_GAME_OPTIONS: GameOptions = {
  minPlayers: 4,
  startingMs: 3500,
  discussionMs: 45_000,
  votingMs: 30_000,
  killCooldownMs: 20_000,
  sessionGraceMs: 60_000,
  now: Date.now,
  random: () => randomInt(2 ** 32) / 2 ** 32,
};

const COLORS = [0x5eead4, 0xf87171, 0x60a5fa, 0xfbbf24, 0xc084fc, 0xfb7185, 0xa3e635, 0x38bdf8, 0xf97316, 0xe879f9];
const MAX_PLAYERS = MAP.spawnPoints.length;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const INPUT_TIMEOUT_MS = 250;
const INPUT_MIN_INTERVAL_MS = 25;
const TASK_TYPES = Object.keys(TASKS) as TaskSpotKind[];
const TASKS_PER_PLAYER = 3;

export class RoomStore {
  private readonly rooms = new Map<string, Room>();
  private readonly membership = new Map<string, Room>();
  private readonly sessions = new Map<string, string>();
  private readonly changedRooms = new Set<Room>();
  private readonly options: GameOptions;

  constructor(options: Partial<GameOptions> = {}) {
    this.options = { ...DEFAULT_GAME_OPTIONS, ...options };
  }

  create(playerId: string, rawName: unknown): RoomState {
    const name = validateName(rawName);
    this.requireNoRoom(playerId);
    const code = this.createUniqueCode();
    const room: Room = {
      code, map: MAP, players: new Map(), phase: "lobby", round: 0, deadline: 0, simulationAt: 0,
      bodies: [], votes: new Map(), progress: { completed: 0, total: 0 },
      meeting: null, voteResult: null, result: null, events: {},
    };
    this.rooms.set(code, room);
    return this.addPlayer(room, playerId, name);
  }

  join(playerId: string, rawCode: unknown, rawName: unknown): RoomState {
    if (typeof rawCode !== "string") invalidPayload();
    const name = validateName(rawName);
    this.requireNoRoom(playerId);
    const room = this.rooms.get(rawCode.trim().toUpperCase());
    if (!room) throw new RoomError("ROOM_NOT_FOUND", "Комната не найдена");
    if (room.phase !== "lobby") throw new RoomError("MATCH_ALREADY_STARTED", "Матч уже начался");
    if (room.players.size >= MAX_PLAYERS) throw new RoomError("ROOM_FULL", "В комнате уже 10 игроков");
    if ([...room.players.values()].some((player) => player.name.toLowerCase() === name.toLowerCase())) {
      throw new RoomError("NAME_TAKEN", "Это имя уже занято в комнате");
    }
    return this.addPlayer(room, playerId, name);
  }

  roomCodeFor(playerId: string): string | undefined {
    return this.membership.get(playerId)?.code;
  }

  tokenFor(playerId: string): string {
    return this.member(playerId)[1].sessionToken;
  }

  ownsConnection(playerId: string, connectionId: string): boolean {
    return this.membership.get(playerId)?.players.get(playerId)?.connectionId === connectionId;
  }

  resume(token: unknown, connectionId: string) {
    if (typeof token !== "string" || token.length !== 36) invalidPayload();
    const id = this.sessions.get(token);
    const room = id ? this.membership.get(id) : undefined;
    const player = id ? room?.players.get(id) : undefined;
    const now = this.options.now();
    if (!room || !player || (player.disconnectDeadline && now >= player.disconnectDeadline)) {
      throw new RoomError("SESSION_EXPIRED", "Сессия истекла. Войдите в комнату снова.");
    }
    const previous = player.connectionId;
    player.connectionId = connectionId;
    player.connected = true;
    player.disconnectDeadline = 0;
    player.input = null;
    this.changedRooms.add(room);
    return {
      playerId: player.id, sessionToken: player.sessionToken, room: this.publicRoom(room, now), previous,
      snapshot: snapshot(room, now), privateState: privatePlayer(room, player),
    };
  }

  disconnect(playerId: string, connectionId: string): void {
    if (!this.ownsConnection(playerId, connectionId)) return;
    const [room, player] = this.member(playerId);
    player.connectionId = null;
    player.connected = false;
    player.disconnectDeadline = this.options.now() + this.options.sessionGraceMs;
    player.input = null;
    this.changedRooms.add(room);
  }

  selectMap(playerId: string, mapId: unknown): void {
    if (!isMapId(mapId)) invalidPayload();
    const [room, player] = this.member(playerId);
    requirePhase(room, "lobby");
    if (!player.isHost) throw new RoomError("NOT_HOST", "Карту выбирает хост");
    if (room.map.id === mapId) return;
    room.map = GAME_MAPS[mapId];
    for (const participant of room.players.values()) {
      Object.assign(participant, room.map.spawnPoints[participant.slot], { ready: false, input: null });
    }
    this.changedRooms.add(room);
  }

  leave(playerId: string): void {
    const room = this.membership.get(playerId);
    if (!room) return;
    const player = room.players.get(playerId)!;
    this.membership.delete(playerId);
    this.sessions.delete(player.sessionToken);
    room.players.delete(playerId);
    if (!room.players.size) {
      this.rooms.delete(room.code);
      this.changedRooms.delete(room);
      return;
    }
    if (player.isHost) room.players.values().next().value!.isHost = true;
    if (room.phase !== "lobby" && room.phase !== "ended") {
      room.votes.delete(playerId);
      this.transferTasks(room, player);
      this.checkWinner(room);
      if (room.phase === "voting" && this.allLivingVoted(room)) this.finishVoting(room, this.options.now());
    }
    this.changedRooms.add(room);
  }

  ready(playerId: string, ready: unknown): void {
    if (typeof ready !== "boolean") invalidPayload();
    const [room, player] = this.member(playerId);
    requirePhase(room, "lobby");
    player.ready = ready;
    this.changedRooms.add(room);
  }

  start(playerId: string): void {
    const [room, host] = this.member(playerId);
    requirePhase(room, "lobby");
    if (!host.isHost) throw new RoomError("NOT_HOST", "Матч может начать только хост");
    if (room.players.size < this.options.minPlayers) {
      throw new RoomError("INVALID_PLAYER_COUNT", `Нужно минимум ${this.options.minPlayers} игрока`);
    }
    const players = [...room.players.values()];
    if (players.some((player) => !player.connected || (!player.isHost && !player.ready))) {
      throw new RoomError("PLAYERS_NOT_READY", "Дождитесь подключения и готовности всех остальных игроков");
    }

    const now = this.options.now();
    const ordered = this.shuffle(players);
    const impostorCount = ordered.length >= 7 ? 2 : 1;
    const kinds = this.shuffle(TASK_TYPES);
    room.round += 1;
    room.phase = "starting";
    room.deadline = now + this.options.startingMs;
    room.progress = { completed: 0, total: (ordered.length - impostorCount) * TASKS_PER_PLAYER };
    for (const [index, player] of ordered.entries()) {
      Object.assign(player, room.map.spawnPoints[player.slot], { input: null });
      player.role = index < impostorCount ? "impostor" : "crew";
      player.killAvailableAt = player.role === "impostor" ? room.deadline + this.options.killCooldownMs : null;
      if (player.role === "crew") {
        player.tasks = Array.from({ length: TASKS_PER_PLAYER }, (_, task) => {
          const kind = kinds[((index - impostorCount) * TASKS_PER_PLAYER + task) % kinds.length];
          const spot = this.pick(room.map.taskSpots.filter((candidate) => candidate.kind === kind));
          return { id: `${player.slot}:${task}`, spotId: spot.id, completed: false };
        });
      }
    }
    this.changedRooms.add(room);
  }

  returnToLobby(playerId: string): void {
    const [room] = this.member(playerId);
    if (room.phase === "lobby") return;
    requirePhase(room, "ended");
    room.phase = "lobby";
    room.deadline = 0;
    room.simulationAt = 0;
    room.bodies = [];
    room.votes.clear();
    room.progress = { completed: 0, total: 0 };
    room.meeting = null;
    room.voteResult = null;
    room.result = null;
    for (const player of room.players.values()) {
      Object.assign(player, room.map.spawnPoints[player.slot], {
        alive: true, ready: false, role: null, tasks: [], challenge: null,
        killAvailableAt: null, sequence: -1, input: null, inputAt: -Infinity,
      });
    }
    this.changedRooms.add(room);
  }

  move(playerId: string, input: unknown): void {
    if (!isMoveInput(input)) invalidPayload();
    const [room, player] = this.member(playerId);
    if (room.phase !== "lobby") requirePhase(room, "playing");
    requireAlive(player);
    const now = this.options.now();
    if (input.sequence <= player.sequence || now - player.inputAt < INPUT_MIN_INTERVAL_MS) {
      throw new RoomError("RATE_LIMIT", "Движение обновляется слишком часто");
    }
    player.input = input;
    player.inputAt = now;
    player.sequence = input.sequence;
  }

  interact(playerId: string, taskId: unknown): TaskChallenge {
    const [player, task, spot] = this.checkTask(playerId, taskId);
    const puzzle = createChallenge(spot.kind, this.options.random);
    player.input = null;
    player.challenge = { taskId: task.id, puzzle, startedAt: this.options.now() };
    return puzzle;
  }

  complete(playerId: string, taskId: unknown, proof: unknown): void {
    const [player, task] = this.checkTask(playerId, taskId);
    const challenge = player.challenge;
    if (!challenge || challenge.taskId !== task.id || !acceptsAnswer(challenge.puzzle, proof, this.options.now() - challenge.startedAt)) {
      throw new RoomError("INVALID_TASK", "Начните задание и завершите его по правилам");
    }

    const [room] = this.member(playerId);
    player.challenge = null;
    task.completed = true;
    room.progress.completed += 1;
    room.events.progress = { ...room.progress };
    this.checkWinner(room);
    this.changedRooms.add(room);
  }

  kill(playerId: string, targetId: unknown): void {
    if (typeof targetId !== "string") invalidPayload();
    const [room, player] = this.member(playerId);
    requirePhase(room, "playing");
    requireAlive(player);
    if (player.role !== "impostor") throw new RoomError("NOT_IMPOSTOR", "Убивать может только предатель");
    const now = this.options.now();
    if (player.killAvailableAt !== null && now < player.killAvailableAt) {
      throw new RoomError("COOLDOWN", "Убийство ещё перезаряжается");
    }
    const target = room.players.get(targetId);
    if (!target?.alive || target.role !== "crew") throw new RoomError("INVALID_TARGET", "Эту цель нельзя атаковать");
    if (!withinReach(player, target, KILL_RADIUS, room.map)) throw new RoomError("TOO_FAR", "Подойдите ближе к цели");

    this.eliminate(room, target);
    room.bodies.push({ id: target.id, color: target.color, x: target.x, y: target.y });
    player.killAvailableAt = now + this.options.killCooldownMs;
    this.checkWinner(room);
    this.changedRooms.add(room);
  }

  report(playerId: string, bodyId: unknown): void {
    if (typeof bodyId !== "string") invalidPayload();
    const [room, player] = this.member(playerId);
    requirePhase(room, "playing");
    requireAlive(player);
    const body = room.bodies.find((candidate) => candidate.id === bodyId);
    if (!body) throw new RoomError("INVALID_TARGET", "Тело не найдено");
    if (!withinReach(player, body, REPORT_RADIUS, room.map)) throw new RoomError("TOO_FAR", "Подойдите ближе к телу");

    for (const participant of room.players.values()) {
      participant.input = null;
      participant.challenge = null;
    }
    room.phase = "meeting";
    room.deadline = this.options.now() + this.options.discussionMs;
    room.meeting = { reporter: publicPlayer(player), deadline: room.deadline };
    room.voteResult = null;
    room.votes.clear();
    room.events.meeting = room.meeting;
    this.changedRooms.add(room);
  }

  vote(playerId: string, targetId: unknown): void {
    if (targetId !== null && typeof targetId !== "string") invalidPayload();
    const [room, player] = this.member(playerId);
    requirePhase(room, "voting");
    requireAlive(player);

    const now = this.options.now();
    if (now >= room.deadline) {
      this.finishVoting(room, now);
      throw new RoomError("WRONG_PHASE", "Время голосования истекло");
    }
    if (room.votes.has(player.id)) throw new RoomError("ALREADY_VOTED", "Ваш голос уже принят");
    if (targetId !== null && !room.players.get(targetId)?.alive) {
      throw new RoomError("INVALID_TARGET", "Голосовать можно только за живого игрока");
    }
    room.votes.set(player.id, targetId);
    if (this.allLivingVoted(room)) this.finishVoting(room, now);
    // Until the ballot closes, only this socket receives a private hasVoted update.
  }

  tick(now = this.options.now()): void {
    for (const room of this.rooms.values()) {
      for (const player of room.players.values()) {
        if (player.disconnectDeadline && now >= player.disconnectDeadline) this.leave(player.id);
      }
      if (!room.players.size) continue;
      if (room.phase === "playing" || room.phase === "lobby") {
        this.simulate(room, now);
        continue;
      }
      if (now < room.deadline) continue;
      if (room.phase === "starting") {
        this.resumePlaying(room, now);
      } else if (room.phase === "meeting") {
        room.phase = "voting";
        room.deadline = now + this.options.votingMs;
        room.meeting = { reporter: room.meeting!.reporter, deadline: room.deadline };
        this.changedRooms.add(room);
      } else if (room.phase === "voting") {
        this.finishVoting(room, now);
      }
    }
  }

  stateFor(playerId: string): RoomState {
    return this.publicRoom(this.member(playerId)[0], this.options.now());
  }

  privateStateFor(playerId: string): PrivateState {
    const [room, player] = this.member(playerId);
    return privatePlayer(room, player);
  }

  takeUpdates(now = this.options.now()): RoomUpdate[] {
    const updates = [...this.changedRooms].map((room) => {
      const events = room.events;
      room.events = {};
      return {
        state: this.publicRoom(room, now),
        snapshot: snapshot(room, now),
        privateStates: [...room.players.values()].flatMap((player): Array<[string, PrivateState]> => player.connectionId ? [[player.connectionId, privatePlayer(room, player)]] : []),
        events,
      };
    });
    this.changedRooms.clear();
    return updates;
  }

  liveSnapshots(now = this.options.now()): GameSnapshot[] {
    return [...this.rooms.values()].filter((room) => room.phase === "playing" || room.phase === "lobby").map((room) => snapshot(room, now));
  }

  private simulate(room: Room, now: number): void {
    const since = Math.max(room.simulationAt, now - TICK_MS);
    room.simulationAt = now;
    for (const player of room.players.values()) {
      if (!player.alive || !player.input) continue;
      const until = Math.min(now, player.inputAt + INPUT_TIMEOUT_MS);
      const to = movePosition(player, player.input, (until - since) / 1000, room.map);
      player.x = to.x;
      player.y = to.y;
      const task = player.tasks.find((entry) => entry.id === player.challenge?.taskId);
      const spot = task && room.map.taskSpots.find((entry) => entry.id === task.spotId);
      if (spot && !withinReach(player, spot, TASK_RADIUS, room.map)) player.challenge = null;
    }
  }

  private checkTask(playerId: string, taskId: unknown): [Player, AssignedTask, TaskSpot] {
    if (typeof taskId !== "string") invalidPayload();
    const [room, player] = this.member(playerId);
    requirePhase(room, "playing");
    requireAlive(player);
    const task = player.tasks.find((entry) => entry.id === taskId && !entry.completed);
    if (!task) throw new RoomError("INVALID_TASK", "Задание не назначено или уже завершено");
    const spot = room.map.taskSpots.find((entry) => entry.id === task.spotId)!;
    if (!withinReach(player, spot, TASK_RADIUS, room.map)) throw new RoomError("TOO_FAR", "Подойдите ближе к панели задания");
    return [player, task, spot];
  }

  private eliminate(room: Room, player: Player): void {
    player.alive = false;
    player.input = null;
    player.challenge = null;
    this.transferTasks(room, player);
  }

  private transferTasks(room: Room, player: Player): void {
    const livingCrew = [...room.players.values()].filter((candidate) => candidate.alive && candidate.role === "crew");
    for (const task of player.tasks.filter((entry) => !entry.completed)) {
      const recipient = livingCrew.reduce<Player | undefined>((least, crew) => {
        const pending = (entry: Player) => entry.tasks.filter((t) => !t.completed).length;
        return !least || pending(crew) < pending(least) ? crew : least;
      }, undefined);
      recipient?.tasks.push(task);
    }
    player.tasks = player.tasks.filter((task) => task.completed);
  }

  private allLivingVoted(room: Room): boolean {
    return [...room.players.values()].every((player) => !player.alive || room.votes.has(player.id));
  }

  private finishVoting(room: Room, now: number): void {
    const counts = new Map<string | null, number>();
    for (const target of room.votes.values()) {
      if (target !== null && !room.players.get(target)?.alive) continue;
      counts.set(target, (counts.get(target) ?? 0) + 1);
    }
    const high = Math.max(0, ...counts.values());
    const leaders = [...counts.keys()].filter((id) => counts.get(id) === high);
    const first = leaders[0];
    const ejected = leaders.length === 1 && typeof first === "string" ? room.players.get(first)! : null;
    if (ejected) this.eliminate(room, ejected);
    room.voteResult = {
      ejected: ejected ? publicPlayer(ejected) : null,
      outcome: ejected ? "ejected" : !leaders.length ? "no_votes" : leaders.length > 1 ? "tie" : "skip",
      skip: counts.get(null) ?? 0,
      tally: Object.fromEntries([...counts].filter(([id]) => id !== null)),
    };
    room.events.vote = room.voteResult;
    room.bodies = [];
    room.meeting = null;
    room.votes.clear();
    if (!this.checkWinner(room)) {
      for (const player of room.players.values()) Object.assign(player, room.map.spawnPoints[player.slot]);
      this.resumePlaying(room, now);
    }
    this.changedRooms.add(room);
  }

  private checkWinner(room: Room): boolean {
    const living = [...room.players.values()].filter((player) => player.alive);
    const impostors = living.filter((player) => player.role === "impostor").length;
    if (impostors === 0) return this.end(room, "crew", "impostors_eliminated");
    if (room.progress.completed >= room.progress.total) return this.end(room, "crew", "tasks");
    if (impostors >= living.length - impostors) return this.end(room, "impostor", "parity");
    return false;
  }

  private end(room: Room, winner: Role, reason: WinReason): true {
    room.phase = "ended";
    room.deadline = 0;
    room.meeting = null;
    room.votes.clear();
    room.result = {
      winner, reason,
      players: [...room.players.values()].map((player) => ({ ...publicPlayer(player), role: player.role! })),
    };
    room.events.ended = room.result;
    this.changedRooms.add(room);
    return true;
  }

  private resumePlaying(room: Room, now: number): void {
    room.phase = "playing";
    room.deadline = 0;
    room.simulationAt = now;
    this.changedRooms.add(room);
  }

  private addPlayer(room: Room, id: string, name: string): RoomState {
    const slotsTaken = new Set([...room.players.values()].map((player) => player.slot));
    const slot = room.map.spawnPoints.findIndex((_, index) => !slotsTaken.has(index));
    const position = room.map.spawnPoints[slot]!;
    room.players.set(id, {
      id, name, slot, color: COLORS[slot]!, isHost: room.players.size === 0, ...position, ready: false,
      connected: true, connectionId: id, sessionToken: randomUUID(), disconnectDeadline: 0,
      alive: true, role: null, sequence: -1, input: null, inputAt: -Infinity,
      tasks: [], challenge: null, killAvailableAt: null,
    });
    this.membership.set(id, room);
    this.sessions.set(room.players.get(id)!.sessionToken, id);
    this.changedRooms.add(room);
    return this.publicRoom(room, this.options.now());
  }

  private member(id: string): [Room, Player] {
    const room = this.membership.get(id);
    if (!room) throw new RoomError("ROOM_NOT_FOUND", "Войдите в комнату");
    return [room, room.players.get(id)!];
  }

  private requireNoRoom(playerId: string): void {
    if (this.membership.has(playerId)) throw new RoomError("ALREADY_IN_ROOM", "Сначала выйдите из текущей комнаты");
  }

  private createUniqueCode(): string {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const code = Array.from({ length: 6 }, () => this.pick(CODE_ALPHABET)).join("");
      if (!this.rooms.has(code)) return code;
    }
    throw new RoomError("INTERNAL_ERROR", "Не удалось создать код комнаты");
  }

  private publicRoom(room: Room, serverTime: number): RoomState {
    return {
      code: room.code, mapId: room.map.id, players: [...room.players.values()].map(publicPlayer), minPlayers: this.options.minPlayers,
      maxPlayers: MAX_PLAYERS, phase: room.phase, round: room.round, serverTime, meeting: room.meeting,
      progress: { ...room.progress }, voteResult: room.voteResult, result: room.result,
    };
  }

  private pick<T>(items: ArrayLike<T>): T {
    return items[Math.floor(this.options.random() * items.length)]!;
  }

  private shuffle<T>(items: readonly T[]): T[] {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.options.random() * (i + 1));
      [result[i], result[j]] = [result[j]!, result[i]!];
    }
    return result;
  }
}

function publicPlayer({ id, name, color, isHost, ready, alive, connected }: Player): PlayerState {
  return { id, name, color, isHost, ready, alive, connected };
}

function privatePlayer(room: Room, player: Player): PrivateState {
  return {
    code: room.code, round: room.round, role: player.role,
    tasks: player.tasks.map((task) => ({ ...task })), killAvailableAt: player.killAvailableAt,
    hasVoted: room.votes.has(player.id),
  };
}

function snapshot(room: Room, serverTime: number): GameSnapshot {
  return {
    code: room.code, mapId: room.map.id, round: room.round, phase: room.phase, serverTime,
    players: [...room.players.values()].map((player) => ({
      ...publicPlayer(player), x: player.x, y: player.y, sequence: player.sequence,
    })),
    bodies: room.bodies.map((body) => ({ ...body })),
  };
}

export class RoomError extends Error {
  constructor(public readonly code: ErrorCode, message: string) {
    super(message);
  }
}

export function invalidPayload(): never {
  throw new RoomError("INVALID_PAYLOAD", "Некорректные данные команды");
}

function requirePhase(room: Room, phase: GamePhase): void {
  if (room.phase !== phase) throw new RoomError("WRONG_PHASE", "Действие недоступно на этой фазе матча");
}

function requireAlive(player: Player): void {
  if (!player.alive) throw new RoomError("PLAYER_DEAD", "Действие доступно только живому игроку");
}

function validateName(rawName: unknown): string {
  if (typeof rawName !== "string") invalidPayload();
  const name = rawName.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 20) {
    throw new RoomError("INVALID_NAME", "Имя должно содержать от 2 до 20 символов");
  }
  if (!/^[\p{L}\p{N}_ -]+$/u.test(name)) {
    throw new RoomError("INVALID_NAME", "В имени разрешены буквы, цифры, пробел, _ и -");
  }
  return name.normalize("NFC");
}

function isMoveInput(value: unknown): value is MoveInput {
  if (!value || typeof value !== "object") return false;
  const input = value as Partial<MoveInput>;
  return [input.up, input.down, input.left, input.right].every((flag) => typeof flag === "boolean")
    && typeof input.sequence === "number" && Number.isSafeInteger(input.sequence) && input.sequence >= 0;
}
