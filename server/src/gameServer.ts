import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { EVENTS, TICK_MS, type Acknowledge, type ClientEvents, type ServerEvents } from "@among-us/shared";
import { RoomError, RoomStore, invalidPayload, type GameOptions } from "./rooms/RoomStore.js";

interface ServerOptions {
  clientOrigin?: string;
  game?: Partial<GameOptions>;
}

const channel = (code: string) => `room:${code}`;

export function createGameServer(options: ServerOptions = {}) {
  const clientOrigin = options.clientOrigin ?? "http://localhost:5173";
  const app = express();
  app.use(cors({ origin: clientOrigin }));
  app.get("/health", (_request, response) => response.json({ status: "ok", service: "among-us-server" }));

  const httpServer = createServer(app);
  const io = new Server<ClientEvents, ServerEvents>(httpServer, { cors: { origin: clientOrigin } });
  const rooms = new RoomStore(options.game);

  function publish(): Set<string> {
    const updates = rooms.takeUpdates();
    for (const { state, snapshot, privateStates, events } of updates) {
      const audience = io.to(channel(state.code));
      audience.emit(EVENTS.ROOM_STATE, state);
      for (const [id, payload] of privateStates) io.to(id).emit(EVENTS.PLAYER_PRIVATE_STATE, payload);
      audience.emit(EVENTS.GAME_SNAPSHOT, snapshot);
      if (events.progress) audience.emit(EVENTS.TASK_PROGRESS, events.progress);
      if (events.meeting) audience.emit(EVENTS.MEETING_STARTED, events.meeting);
      if (events.vote) audience.emit(EVENTS.VOTE_RESULT, events.vote);
      if (events.ended) audience.emit(EVENTS.GAME_ENDED, events.ended);
    }
    return new Set(updates.map(({ state }) => state.code));
  }

  const timer = setInterval(() => {
    rooms.tick();
    const published = publish();
    for (const snapshot of rooms.liveSnapshots()) {
      if (!published.has(snapshot.code)) io.to(channel(snapshot.code)).volatile.emit(EVENTS.GAME_SNAPSHOT, snapshot);
    }
  }, TICK_MS);
  timer.unref();

  io.on("connection", (socket) => {
    let id = socket.id;
    const leave = () => {
      const code = rooms.ownsConnection(id, socket.id) && rooms.roomCodeFor(id);
      if (code) void socket.leave(channel(code));
      if (rooms.ownsConnection(id, socket.id)) rooms.leave(id);
      id = socket.id;
      return null;
    };
    const memberOnly = () => {
      if (!rooms.ownsConnection(id, socket.id)) throw new RoomError("ROOM_NOT_FOUND", "Войдите в комнату");
    };
    const command = <T>(ack: Acknowledge<T> | undefined, action: () => T) => {
      respond(ack, action);
      publish();
    };
    socket.on(EVENTS.ROOM_CREATE, (request, ack) => command(ack, () => {
      const room = rooms.create(id, request?.playerName);
      void socket.join(channel(room.code));
      return { room, playerId: id, sessionToken: rooms.tokenFor(id) };
    }));
    socket.on(EVENTS.ROOM_JOIN, (request, ack) => command(ack, () => {
      const room = rooms.join(id, request?.roomCode, request?.playerName);
      void socket.join(channel(room.code));
      return { room, playerId: id, sessionToken: rooms.tokenFor(id) };
    }));
    socket.on(EVENTS.ROOM_RESUME, (request, ack) => command(ack, () => {
      if (rooms.ownsConnection(id, socket.id) && request?.sessionToken !== rooms.tokenFor(id)) {
        throw new RoomError("ALREADY_IN_ROOM", "Вы уже в комнате");
      }
      const { previous, ...membership } = rooms.resume(request?.sessionToken, socket.id);
      id = membership.playerId;
      void socket.join(channel(membership.room.code));
      if (previous && previous !== socket.id) io.sockets.sockets.get(previous)?.disconnect(true);
      return membership;
    }));
    socket.on(EVENTS.ROOM_MAP, (request, ack) => command(ack, () => {
      memberOnly();
      rooms.selectMap(id, request?.mapId);
      return null;
    }));
    socket.on(EVENTS.ROOM_LEAVE, (ack) => command(ack, leave));
    socket.on(EVENTS.PLAYER_READY, (request, ack) => command(ack, () => {
      memberOnly();
      rooms.ready(id, request?.ready);
      return null;
    }));
    socket.on(EVENTS.GAME_START, (ack) => command(ack, () => {
      memberOnly();
      rooms.start(id);
      return null;
    }));
    socket.on(EVENTS.GAME_RETURN, (ack) => command(ack, () => {
      memberOnly();
      rooms.returnToLobby(id);
      return null;
    }));
    socket.on(EVENTS.PLAYER_MOVE, (input, ack) => respond(ack, () => {
      memberOnly();
      rooms.move(id, input);
      return null;
    }));
    socket.on(EVENTS.TASK_INTERACT, (request, ack) => respond(ack, () => {
      memberOnly();
      return rooms.interact(id, request?.taskId);
    }));
    socket.on(EVENTS.TASK_COMPLETE, (request, ack) => command(ack, () => {
      memberOnly();
      rooms.complete(id, request?.taskId, request?.proof);
      return null;
    }));
    socket.on(EVENTS.PLAYER_KILL, (request, ack) => command(ack, () => {
      memberOnly();
      rooms.kill(id, request?.targetId);
      return null;
    }));
    socket.on(EVENTS.BODY_REPORT, (request, ack) => command(ack, () => {
      memberOnly();
      rooms.report(id, request?.bodyId);
      return null;
    }));
    socket.on(EVENTS.VOTE_CAST, (request, ack) => command(ack, () => {
      if (!request || !("targetId" in Object(request))) invalidPayload();
      memberOnly();
      rooms.vote(id, request.targetId);
      socket.emit(EVENTS.PLAYER_PRIVATE_STATE, rooms.privateStateFor(id));
      return null;
    }));
    socket.on("disconnect", () => {
      rooms.disconnect(id, socket.id);
      publish();
    });
  });

  return {
    httpServer,
    async close() {
      clearInterval(timer);
      await io.close();
    },
  };
}

function respond<T>(ack: Acknowledge<T> | undefined, action: () => T): void {
  const send = typeof ack === "function" ? ack : undefined;
  try {
    const data = action();
    send?.({ ok: true, data });
  } catch (error) {
    if (error instanceof RoomError) {
      send?.({ ok: false, errorCode: error.code, message: error.message });
      return;
    }
    console.error(error);
    send?.({ ok: false, errorCode: "INTERNAL_ERROR", message: "Внутренняя ошибка сервера" });
  }
}
