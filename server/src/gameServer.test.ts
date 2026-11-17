import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { io, type Socket } from "socket.io-client";
import {
  EVENTS, type ClientEvents, type GameAck, type GameSnapshot, type PrivateState, type RoomMembership, type ServerEvents,
} from "@among-us/shared";
import { createGameServer } from "./gameServer.js";

type Client = Socket<ServerEvents, ClientEvents>;

test("Socket.IO smoke: create, join, ready, start, private roles, snapshots, movement, disconnect", { timeout: 10_000 }, async (t) => {
  const { httpServer, close } = createGameServer({ game: { startingMs: 150, random: () => 0.9999 } });
  const clients: Client[] = [];
  t.after(async () => {
    for (const client of clients) client.disconnect();
    await close();
  });

  httpServer.listen(0, "127.0.0.1");
  await once(httpServer, "listening");
  const address = httpServer.address();
  assert.ok(address && typeof address === "object");
  const url = `http://127.0.0.1:${address.port}`;
  assert.equal((await fetch(`${url}/health`)).status, 200);

  for (let index = 0; index < 4; index += 1) {
    clients.push(io(url, { autoConnect: false, forceNew: true, transports: index === 3 ? ["polling"] : ["websocket"] }));
  }
  await Promise.all(clients.map((client) => {
    const connected = new Promise<void>((resolve) => client.once("connect", resolve));
    client.connect();
    return connected;
  }));

  const host = clients[0]!;
  const membership: GameAck<RoomMembership> = await host.timeout(1500).emitWithAck(EVENTS.ROOM_CREATE, { playerName: "Host" });
  assert.ok(membership.ok);
  const code = membership.data.room.code;

  for (const [index, client] of clients.slice(1).entries()) {
    const joined = await client.timeout(1500).emitWithAck(EVENTS.ROOM_JOIN, { playerName: `Crew ${index}`, roomCode: code });
    assert.ok(joined.ok);
    assert.deepEqual(await client.timeout(1500).emitWithAck(EVENTS.PLAYER_READY, { ready: true }), { ok: true, data: null });
  }

  const roles = clients.map((client) => waitFor<PrivateState>((listener) => {
    client.on(EVENTS.PLAYER_PRIVATE_STATE, listener);
    return () => client.off(EVENTS.PLAYER_PRIVATE_STATE, listener);
  }, (state) => !!state.role));
  const playing = waitFor<GameSnapshot>((listener) => {
    host.on(EVENTS.GAME_SNAPSHOT, listener);
    return () => host.off(EVENTS.GAME_SNAPSHOT, listener);
  }, (snapshot) => snapshot.phase === "playing");
  assert.deepEqual(await host.timeout(1500).emitWithAck(EVENTS.GAME_START), { ok: true, data: null });
  const privateStates = await Promise.all(roles);
  assert.deepEqual(privateStates.map(({ role }) => role), ["impostor", "crew", "crew", "crew"]);
  assert.deepEqual(privateStates.map(({ tasks }) => tasks.length), [0, 2, 2, 2]);

  const initial = await playing;
  assert.equal(initial.players.length, 4);
  assert.equal(typeof initial.serverTime, "number");
  assert.ok(initial.players.every((player) => !("role" in player)));
  const mover = clients[1]!;
  const initialX = initial.players.find(({ id }) => id === mover.id)!.x;
  const moved = waitFor<GameSnapshot>((listener) => {
    host.on(EVENTS.GAME_SNAPSHOT, listener);
    return () => host.off(EVENTS.GAME_SNAPSHOT, listener);
  }, (snapshot) => snapshot.players.some(({ id, x }) => id === mover.id && x > initialX));
  assert.deepEqual(await mover.timeout(1500).emitWithAck(EVENTS.PLAYER_MOVE, {
    up: false, down: false, left: false, right: true, sequence: 0,
  }), { ok: true, data: null });
  assert.equal((await moved).players.find(({ id }) => id === mover.id)?.sequence, 0);

  const departed = waitFor<GameSnapshot>((listener) => {
    host.on(EVENTS.GAME_SNAPSHOT, listener);
    return () => host.off(EVENTS.GAME_SNAPSHOT, listener);
  }, (snapshot) => snapshot.players.length === 3);
  mover.disconnect();
  assert.equal((await departed).players.length, 3);
});

function waitFor<T>(subscribe: (listener: (value: T) => void) => () => void, predicate: (value: T) => boolean): Promise<T> {
  return new Promise((resolve, reject) => {
    const unsubscribe = subscribe((value) => {
      if (!predicate(value)) return;
      clearTimeout(timer);
      unsubscribe();
      resolve(value);
    });
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error("Socket.IO event timed out"));
    }, 4000);
  });
}
