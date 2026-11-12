import assert from "node:assert/strict";
import test from "node:test";
import { RoomError, RoomStore } from "./RoomStore.js";

test("creates a room and adds a host", () => {
  const store = new RoomStore(() => 0);
  const room = store.create("socket-1", "Captain");
  assert.equal(room.code, "AAAAAA");
  assert.equal(room.players[0]?.isHost, true);
  assert.equal(room.players[0]?.name, "Captain");
});

test("joins a room and rejects a duplicate name", () => {
  const store = new RoomStore(() => 0);
  const room = store.create("socket-1", "Captain");
  assert.equal(store.join("socket-2", room.code, "Engineer").players.length, 2);
  assert.throws(() => store.join("socket-3", room.code, "engineer"), (error) => error instanceof RoomError && error.code === "NAME_TAKEN");
});

test("server caps movement and transfers host on disconnect", () => {
  const store = new RoomStore(() => 0);
  const room = store.create("socket-1", "Captain");
  const startX = store.join("socket-2", room.code, "Engineer").players.find((player) => player.id === "socket-2")?.x ?? 0;
  const moved = store.move("socket-2", { up: false, down: false, left: false, right: true, sequence: 1 }, 1000);
  assert.ok((moved?.players.find((player) => player.id === "socket-2")?.x ?? 0) > startX);
  const afterLeave = store.leave("socket-1");
  assert.equal(afterLeave?.players[0]?.isHost, true);
});
