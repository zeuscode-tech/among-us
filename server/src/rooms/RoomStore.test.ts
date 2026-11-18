import assert from "node:assert/strict";
import test from "node:test";
import {
  GAME_MAPS, MAP, TASKS, TASK_RADIUS, TICK_MS, collides, isInsideStation, movePosition, withinReach,
  type ErrorCode, type GameSnapshot, type MovementDirection, type TaskChallenge, type TaskProof, type Vec,
} from "@among-us/shared";
import { acceptsAnswer, createChallenge } from "./puzzles.js";
import { RoomError, RoomStore, type GameOptions } from "./RoomStore.js";

const STILL = { up: false, down: false, left: false, right: false };
const UP = { ...STILL, up: true };
const DOWN = { ...STILL, down: true };
const LEFT = { ...STILL, left: true };
const RIGHT = { ...STILL, right: true };
const DIRECTIONS = [UP, DOWN, LEFT, RIGHT];

function scenario(options: Partial<GameOptions> = {}) {
  let time = 1000;
  const store = new RoomStore({
    now: () => time, random: () => 0.9999, startingMs: 100, discussionMs: 200,
    votingMs: 300, killCooldownMs: 500, ...options,
  });
  const room = store.create("p1", "Alpha");
  const sequences = new Map<string, number>();
  const state = () => store.stateFor("p1");
  const tick = (ms: number) => { time += ms; store.tick(); };
  const join = (index: number) => store.join(`p${index}`, room.code, `Crew ${index}`);
  const start = (size = 4) => {
    for (let index = 2; index <= size; index += 1) {
      join(index);
      store.ready(`p${index}`, true);
    }
    store.takeUpdates();
    store.start("p1");
    tick(100);
  };
  const snap = (): GameSnapshot => store.liveSnapshots()[0]!;
  const position = (id: string) => snap().players.find((player) => player.id === id)!;
  const move = (id: string, direction: MovementDirection, steps = 1) => {
    for (let i = 0; i < steps; i += 1) {
      const sequence = (sequences.get(id) ?? -1) + 1;
      sequences.set(id, sequence);
      store.move(id, { ...direction, sequence });
      tick(TICK_MS);
    }
    const sequence = sequences.get(id)! + 1;
    sequences.set(id, sequence);
    store.move(id, { ...STILL, sequence });
    tick(TICK_MS);
  };
  const meeting = () => {
    move("p3", LEFT, 2);
    tick(500);
    store.kill("p1", "p2");
    store.report("p3", "p2");
  };
  return { store, room, state, tick, join, start, snap, position, move, meeting };
}

function rejected(code: ErrorCode, action: () => unknown) {
  assert.throws(action, (error) => error instanceof RoomError && error.code === code);
}

function taskProof(challenge: TaskChallenge): TaskProof {
  const { token } = challenge;
  switch (challenge.kind) {
    case "spectrum":
      return { token, answer: challenge.readings.map((_, i) => i).sort((a, b) => Math.abs(challenge.readings[a]! - challenge.reference) - Math.abs(challenge.readings[b]! - challenge.reference)) };
    case "echo":
      return { token, answer: [...challenge.pattern].reverse() };
    case "balance": {
      let remaining = challenge.target;
      const answer = challenge.limits.map((limit) => {
        const value = Math.min(limit, remaining);
        remaining -= value;
        return value;
      });
      return { token, answer };
    }
    case "orbit":
      return { token, answer: challenge.target };
    case "decode":
      return { token, answer: challenge.signal.map((value) => challenge.alphabet[value]!) };
    case "sample":
      return { token, answer: challenge.samples.flatMap((value, i) => value.stable && value.temperature <= challenge.limit ? [i] : []) };
    case "trace": {
      const queue = [[challenge.start]];
      const visited = new Set([challenge.start, ...challenge.blocked]);
      for (const path of queue) {
        const last = path.at(-1)!;
        if (last === challenge.finish) return { token, answer: path };
        for (const next of [last - 1, last + 1, last - challenge.size, last + challenge.size]) {
          if (next < 0 || next >= challenge.size ** 2 || visited.has(next)) continue;
          if (Math.abs(last % challenge.size - next % challenge.size) > 1) continue;
          visited.add(next);
          queue.push([...path, next]);
        }
      }
      return assert.fail("Task has no solution");
    }
  }
}
function route(start: Vec, goal: (point: Vec) => boolean): MovementDirection[] {
  interface Node { point: Vec; parent: Node | null; input: MovementDirection | null }
  const key = ({ x, y }: Vec) => `${Math.round(x * 100)},${Math.round(y * 100)}`;
  const queue: Node[] = [{ point: start, parent: null, input: null }];
  const seen = new Set([key(start)]);
  for (let index = 0; index < queue.length; index += 1) {
    const node = queue[index]!;
    if (goal(node.point)) {
      const path: MovementDirection[] = [];
      for (let next = node; next.input; next = next.parent!) path.push(next.input);
      return path.reverse();
    }
    for (const input of DIRECTIONS) {
      const point = movePosition(node.point, input, TICK_MS / 1000);
      const id = key(point);
      if (seen.has(id)) continue;
      seen.add(id);
      queue.push({ point, parent: node, input });
    }
  }
  assert.fail("No route to task");
}

function approach(game: ReturnType<typeof scenario>, id: string, spotId: string) {
  const spot = MAP.taskSpots.find((entry) => entry.id === spotId)!;
  const inputs = route(game.position(id), (point) => withinReach(point, spot, TASK_RADIUS - 7));
  let start = 0;
  while (start < inputs.length) {
    const direction = inputs[start]!;
    let end = start + 1;
    while (inputs[end] === direction) end += 1;
    game.move(id, direction, end - start);
    start = end;
  }
  assert.ok(withinReach(game.position(id), spot, TASK_RADIUS));
}

test("creates a six-character room and a public host", () => {
  const { room } = scenario();
  assert.match(room.code, /^[A-Z2-9]{6}$/);
  assert.equal(room.phase, "lobby");
  assert.equal(room.minPlayers, 4);
  assert.equal(room.maxPlayers, 10);
  assert.equal(room.players[0]?.name, "Alpha");
  assert.equal(room.players[0]?.isHost, true);
  assert.equal(room.players[0]?.ready, false);
});

test("joins case-insensitively by code, with unique normalized names and valid payloads", () => {
  const { store, room } = scenario();
  const joined = store.join("p2", ` ${room.code.toLowerCase()}`, "  Blue   Two ");
  assert.equal(joined.players[1]?.name, "Blue Two");
  rejected("NAME_TAKEN", () => store.join("p3", room.code, "blue two"));
  rejected("ROOM_NOT_FOUND", () => store.join("p3", "ZZZZZZ", "Red"));
  rejected("INVALID_PAYLOAD", () => store.join("p3", 42, "Red"));
  rejected("INVALID_NAME", () => store.join("p3", room.code, "<red>"));
  rejected("ALREADY_IN_ROOM", () => store.create("p2", "Red"));
});

test("limits rooms to ten and reuses an available color after a player leaves", () => {
  const { join, store, state } = scenario();
  for (let index = 2; index <= 10; index += 1) join(index);
  rejected("ROOM_FULL", () => join(11));
  store.leave("p4");
  join(11);
  assert.equal(new Set(state().players.map(({ color }) => color)).size, 10);
});

test("Ready and phase gates allow only the host to start with enough ready players", () => {
  const { join, state, store, tick } = scenario();
  rejected("INVALID_PLAYER_COUNT", () => store.start("p1"));
  rejected("INVALID_PAYLOAD", () => store.ready("p1", "yes"));
  for (let index = 2; index <= 4; index += 1) join(index);
  rejected("NOT_HOST", () => store.start("p2"));
  rejected("PLAYERS_NOT_READY", () => store.start("p1"));
  for (let index = 2; index <= 4; index += 1) store.ready(`p${index}`, true);
  assert.equal(state().players.filter(({ ready }) => ready).length, 3);
  store.start("p1");
  assert.equal(state().phase, "starting");
  rejected("MATCH_ALREADY_STARTED", () => join(5));
  rejected("WRONG_PHASE", () => store.start("p1"));
  rejected("WRONG_PHASE", () => store.move("p1", { ...RIGHT, sequence: 0 }));
  tick(100);
  assert.equal(state().phase, "playing");
});

test("assigns one or two impostors and keeps roles, tasks, and cooldown out of public data", () => {
  for (const size of [4, 7, 10]) {
    const { start, store } = scenario();
    start(size);
    const [update] = store.takeUpdates();
    assert.ok(update);
    assert.equal(update.privateStates.length, size);
    assert.equal(update.privateStates.filter(([, { role }]) => role === "impostor").length, size >= 7 ? 2 : 1);
    for (const [, own] of update.privateStates) assert.equal(own.tasks.length, own.role === "crew" ? 3 : 0);
    for (const payload of [update.state, update.snapshot]) {
      assert.ok(!/"(?:role|tasks|killAvailableAt|hasVoted|votes|sessionToken)"\s*:/.test(JSON.stringify(payload)));
    }
  }
});

test("validates directions, caps movement speed, and rejects stale and too-frequent sequence updates", () => {
  const { start, store, position, tick } = scenario();
  start();
  const initial = position("p1");
  rejected("INVALID_PAYLOAD", () => store.move("p1", { ...RIGHT, sequence: -1 }));
  rejected("INVALID_PAYLOAD", () => store.move("p1", { ...RIGHT, right: "yes", sequence: 0 }));
  store.move("p1", { ...RIGHT, up: true, sequence: 10, x: 2400 });
  rejected("RATE_LIMIT", () => store.move("p1", { ...RIGHT, sequence: 11 }));
  tick(TICK_MS);
  rejected("RATE_LIMIT", () => store.move("p1", { ...RIGHT, sequence: 10 }));
  const moved = position("p1");
  assert.ok(moved.x > initial.x && moved.y < initial.y);
  assert.ok(Math.abs(Math.hypot(moved.x - initial.x, moved.y - initial.y) - MAP.speed * TICK_MS / 1000) < 0.001);
  assert.equal(moved.sequence, 10);
  tick(500);
  const expired = position("p1");
  tick(500);
  assert.deepEqual(position("p1"), expired);
});

test("server stops at station walls and furniture while allowing corridors", () => {
  const game = scenario();
  game.start();
  game.move("p1", UP, 50);
  let position = game.position("p1");
  assert.ok(position.y > 256 && position.y < 290, "north table blocks travel");
  game.move("p2", UP, 100);
  position = game.position("p2");
  assert.ok(position.y >= 140 + 24 + MAP.playerRadius);
  assert.ok(position.y < 195, "north wall blocks travel");
  assert.ok(isInsideStation(position) && !collides(position.x, position.y));

  game.move("p3", DOWN, 50);
  assert.ok(game.position("p3").y > 800, "central corridor leads to storage");
});

test("checks assignment, distance, challenge, proof, and duplicate task completion", () => {
  const game = scenario();
  game.start();
  const { store, state } = game;
  const task = store.privateStateFor("p2").tasks.at(0)!;
  rejected("INVALID_TASK", () => store.interact("p1", task.id));
  rejected("TOO_FAR", () => store.interact("p2", task.id));
  approach(game, "p2", task.spotId);
  rejected("INVALID_TASK", () => store.complete("p2", task.id, {}));
  const challenge = store.interact("p2", task.id);
  rejected("INVALID_TASK", () => store.complete("p2", task.id, { token: challenge.token, answer: [-1] }));
  store.complete("p2", task.id, taskProof(challenge));
  assert.deepEqual(state().progress, { completed: 1, total: 9 });
  assert.deepEqual(store.takeUpdates().at(-1)?.events.progress, { completed: 1, total: 9 });
  rejected("INVALID_TASK", () => store.complete("p2", task.id, taskProof(challenge)));
});

test("all seven custom puzzles are solvable, rejects invalid proofs and requires its own token", () => {
  for (let seed = 0; seed < 20; seed += 1) {
    let state = seed;
    const random = () => ((state = (Math.imul(1664525, state) + 1013904223) >>> 0) / 2 ** 32);
    for (const kind of Object.keys(TASKS) as Array<keyof typeof TASKS>) {
      const puzzle = createChallenge(kind, random);
      const proof = taskProof(puzzle);
      assert.equal(acceptsAnswer(puzzle, proof, 5000), true, kind);
      assert.equal(acceptsAnswer(puzzle, { ...proof, token: "other" }, 5000), false, kind);
      assert.equal(acceptsAnswer(puzzle, { ...proof, answer: [-1] }, 5000), false, kind);
      if (puzzle.kind === "echo") assert.equal(acceptsAnswer(puzzle, proof, puzzle.showMs - 1), false);
    }
  }
});

test("the lobby shares walking and ready status, and only the host can switch maps", () => {
  const game = scenario();
  const { store, join, state } = game;
  join(2);
  store.ready("p2", true);
  const start = game.position("p2");
  game.move("p2", RIGHT, 4);
  assert.ok(game.position("p2").x > start.x);
  assert.equal(state().players[1]?.ready, true);
  rejected("NOT_HOST", () => store.selectMap("p2", "abyss"));
  store.selectMap("p1", "abyss");
  assert.equal(state().mapId, "abyss");
  assert.equal(state().players[1]?.ready, false);
  assert.equal(game.position("p2").x, GAME_MAPS.abyss.spawnPoints[1]?.x);
  join(3);
  game.move("p3", DOWN, 75);
  assert.ok(game.position("p3").y > 1100, "the selected map's central corridor reaches the archive");
  assert.ok(isInsideStation(game.position("p3"), GAME_MAPS.abyss));
});

test("session survives disconnection, blocks start while a guest is offline and expires safely", () => {
  const game = scenario({ minPlayers: 2, sessionGraceMs: 1000 });
  const { store, join, state, tick } = game;
  join(2);
  store.ready("p2", true);
  game.move("p2", RIGHT, 3);
  const position = game.position("p2");
  const token = store.tokenFor("p2");
  store.disconnect("p2", "p2");
  assert.equal(state().players[1]?.connected, false);
  rejected("PLAYERS_NOT_READY", () => store.start("p1"));
  const restored = store.resume(token, "next-socket");
  assert.equal(restored.playerId, "p2");
  assert.equal(restored.snapshot.players[1]?.x, position.x);
  assert.equal(restored.room.players[1]?.ready, true);
  assert.equal(store.ownsConnection("p2", "next-socket"), true);
  store.disconnect("p2", "p2");
  assert.equal(state().players[1]?.connected, true);
  store.disconnect("p2", "next-socket");
  tick(1000);
  rejected("SESSION_EXPIRED", () => store.resume(token, "too-late"));
  assert.equal(state().players.length, 1);
});
test("crew wins after every required task is finished", () => {
  const game = scenario();
  game.start();
  const completedKinds = new Set<string>();
  for (const id of ["p2", "p3", "p4"]) {
    for (const task of game.store.privateStateFor(id).tasks) {
      approach(game, id, task.spotId);
      const challenge = game.store.interact(id, task.id);
      completedKinds.add(challenge.kind);
      if (challenge.kind === "echo") game.tick(challenge.showMs);
      game.store.complete(id, task.id, taskProof(challenge));
    }
  }
  assert.equal(completedKinds.size, 7);
  assert.deepEqual(game.state().progress, { completed: 9, total: 9 });
  assert.equal(game.state().result?.winner, "crew");
  assert.equal(game.state().result?.reason, "tasks");
});

test("kill checks role, distance, target and cooldown, creates a body and transfers unfinished tasks", () => {
  const game = scenario();
  game.start();
  const { store, state, snap, tick } = game;
  rejected("NOT_IMPOSTOR", () => store.kill("p2", "p1"));
  rejected("COOLDOWN", () => store.kill("p1", "p2"));
  tick(500);
  rejected("TOO_FAR", () => store.kill("p1", "p4"));
  rejected("INVALID_TARGET", () => store.kill("p1", "p1"));
  assert.equal(snap().bodies.length, 0);
  store.kill("p1", "p2");
  assert.equal(state().players[1]?.alive, false);
  assert.equal(snap().bodies[0]?.id, "p2");
  assert.equal(snap().bodies[0]?.color, state().players[1]?.color);
  assert.equal(store.privateStateFor("p2").tasks.length, 0);
  assert.equal(store.privateStateFor("p3").tasks.length, 5);
  assert.equal(store.privateStateFor("p4").tasks.length, 4);
  assert.equal(state().progress.total, 9);
  rejected("PLAYER_DEAD", () => store.move("p2", { ...RIGHT, sequence: 0 }));
  rejected("COOLDOWN", () => store.kill("p1", "p3"));
});

test("report checks proximity and life, freezes movement, and blocks repeated reports", () => {
  const game = scenario();
  game.start();
  const { store, state, tick } = game;
  tick(500);
  store.kill("p1", "p2");
  rejected("PLAYER_DEAD", () => store.report("p2", "p2"));
  rejected("TOO_FAR", () => store.report("p4", "p2"));
  rejected("INVALID_TARGET", () => store.report("p1", "missing"));
  store.report("p1", "p2");
  assert.equal(state().phase, "meeting");
  assert.equal(state().meeting?.reporter.id, "p1");
  assert.equal(store.takeUpdates().at(-1)?.events.meeting?.reporter.id, "p1");
  rejected("WRONG_PHASE", () => store.report("p1", "p2"));
  rejected("WRONG_PHASE", () => store.move("p1", { ...RIGHT, sequence: 0 }));
  rejected("WRONG_PHASE", () => store.vote("p1", null));
  tick(200);
  assert.equal(state().phase, "voting");
});

test("voting forbids dead and duplicate votes and ejects the impostor after all living vote", () => {
  const { start, meeting, store, state, tick } = scenario();
  start();
  meeting();
  tick(200);
  rejected("PLAYER_DEAD", () => store.vote("p2", "p1"));
  rejected("INVALID_TARGET", () => store.vote("p3", "p2"));
  store.takeUpdates();
  store.vote("p3", "p1");
  assert.equal(state().voteResult, null);
  assert.equal(store.privateStateFor("p3").hasVoted, true);
  assert.equal(store.privateStateFor("p4").hasVoted, false);
  assert.deepEqual(store.takeUpdates(), []);
  rejected("ALREADY_VOTED", () => store.vote("p3", null));
  store.vote("p1", "p4");
  assert.equal(state().phase, "voting");
  store.vote("p4", "p1");
  assert.equal(state().voteResult?.ejected?.id, "p1");
  assert.equal(state().result?.winner, "crew");
  assert.equal(state().result?.reason, "impostors_eliminated");
});

test("Skip wins by plurality, clears bodies, and respawns players", () => {
  const { start, meeting, store, state, snap, tick } = scenario();
  start();
  meeting();
  tick(200);
  store.vote("p1", null);
  store.vote("p3", "p1");
  store.vote("p4", null);
  assert.equal(state().phase, "playing");
  assert.equal(state().voteResult?.outcome, "skip");
  assert.equal(state().voteResult?.skip, 2);
  assert.equal(snap().bodies.length, 0);
  assert.equal(snap().players.find(({ id }) => id === "p3")?.x, MAP.spawnPoints[2]?.x);
});

test("a voting deadline locks votes and resolves ties or an empty ballot", () => {
  for (const castVotes of [false, true]) {
    const { start, meeting, store, state, tick } = scenario();
    start();
    meeting();
    tick(200);
    if (castVotes) {
      store.vote("p1", null);
      store.vote("p3", "p1");
    }
    tick(300);
    assert.equal(state().phase, "playing");
    assert.equal(state().voteResult?.outcome, castVotes ? "tie" : "no_votes");
    rejected("WRONG_PHASE", () => store.vote("p4", "p1"));
  }
});

test("impostors win at parity and the final result reveals all roles", () => {
  const { start, state, store, tick, move } = scenario();
  start();
  move("p3", LEFT, 6);
  tick(500);
  store.kill("p1", "p2");
  tick(500);
  store.kill("p1", "p3");
  assert.equal(state().phase, "ended");
  assert.equal(state().result?.winner, "impostor");
  assert.equal(state().result?.reason, "parity");
  assert.deepEqual(state().result?.players.map(({ role }) => role), ["impostor", "crew", "crew", "crew"]);
  rejected("WRONG_PHASE", () => store.move("p1", { ...RIGHT, sequence: 0 }));
});

test("a departing host is replaced and empty rooms are removed", () => {
  const { join, store, room } = scenario();
  join(2);
  store.leave("p1");
  assert.equal(store.stateFor("p2").players[0]?.isHost, true);
  store.leave("p2");
  rejected("ROOM_NOT_FOUND", () => store.join("p3", room.code, "New player"));
});

test("disconnect during a match can cause victory or resolve the vote with the remaining players", () => {
  const first = scenario();
  first.start();
  first.store.leave("p1");
  assert.equal(first.store.stateFor("p2").result?.winner, "crew");
  assert.equal(first.store.stateFor("p2").players[0]?.isHost, true);

  const { start, store, state, tick, meeting } = scenario();
  start(5);
  meeting();
  tick(200);
  store.vote("p1", null);
  store.vote("p3", null);
  store.vote("p4", null);
  store.leave("p5");
  assert.equal(state().phase, "playing");
  assert.equal(state().voteResult?.outcome, "skip");
});

test("returning to the lobby clears match state and permits another round in the same room", () => {
  const { start, meeting, store, state, tick, snap } = scenario();
  start();
  meeting();
  tick(200);
  store.vote("p1", "p3");
  store.vote("p3", "p1");
  store.vote("p4", "p1");
  assert.equal(state().phase, "ended");
  store.returnToLobby("p3");
  store.returnToLobby("p1");
  const reset = state();
  assert.equal(reset.phase, "lobby");
  assert.deepEqual(reset.progress, { completed: 0, total: 0 });
  assert.equal(reset.voteResult, null);
  assert.equal(reset.result, null);
  assert.equal(reset.meeting, null);
  assert.ok(reset.players.every(({ ready, alive }) => !ready && alive));
  assert.deepEqual(store.privateStateFor("p1"), {
    code: reset.code, round: 1, role: null, tasks: [], killAvailableAt: null, hasVoted: false,
  });
  for (const id of ["p2", "p3", "p4"]) store.ready(id, true);
  store.start("p1");
  tick(100);
  assert.equal(state().round, 2);
  assert.equal(snap().bodies.length, 0);
  assert.ok(snap().players.every(({ sequence }) => sequence === -1));
});

test("session resumes during voting with the same ballot, role and life state", () => {
  const game = scenario();
  game.start();
  game.meeting();
  game.tick(200);
  game.store.vote("p3", "p1");
  const token = game.store.tokenFor("p3");
  game.store.disconnect("p3", "p3");
  const resumed = game.store.resume(token, "replacement-socket");
  assert.equal(resumed.room.phase, "voting");
  assert.equal(resumed.privateState.role, "crew");
  assert.equal(resumed.privateState.hasVoted, true);
  assert.equal(resumed.snapshot.players.find((player) => player.id === "p3")?.alive, true);
  rejected("ALREADY_VOTED", () => game.store.vote("p3", null));

  const victimToken = game.store.tokenFor("p2");
  game.store.disconnect("p2", "p2");
  const victim = game.store.resume(victimToken, "victim-socket");
  assert.equal(victim.snapshot.players.find((player) => player.id === "p2")?.alive, false);
  rejected("PLAYER_DEAD", () => game.store.vote("p2", "p1"));
  game.store.vote("p1", null);
  game.store.vote("p4", "p1");
  assert.equal(game.state().result?.winner, "crew");
});