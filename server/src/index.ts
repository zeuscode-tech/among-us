import "dotenv/config";
import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { EVENTS, type JoinRoomRequest, type MoveInput, type RoomAck, type RoomRequest } from "@among-us/shared";
import { RoomError, RoomStore } from "./rooms/RoomStore.js";

const port = Number(process.env.PORT ?? 3001);
const clientOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
const app = express();
app.use(cors({ origin: clientOrigin }));
app.use(express.json());
app.get("/health", (_request, response) => response.json({ status: "ok", service: "among-us-server" }));

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: clientOrigin, methods: ["GET", "POST"] } });
const rooms = new RoomStore();

io.on("connection", (socket) => {
  console.info(`[socket] connected ${socket.id}`);

  socket.on(EVENTS.ROOM_CREATE, (payload: RoomRequest, acknowledge: (result: RoomAck) => void) => {
    runRoomAction(acknowledge, () => {
      const room = rooms.create(socket.id, payload?.playerName ?? "");
      socket.join(room.code);
      io.to(room.code).emit(EVENTS.ROOM_STATE, room);
      return room;
    }, socket.id);
  });

  socket.on(EVENTS.ROOM_JOIN, (payload: JoinRoomRequest, acknowledge: (result: RoomAck) => void) => {
    runRoomAction(acknowledge, () => {
      const room = rooms.join(socket.id, payload?.roomCode ?? "", payload?.playerName ?? "");
      socket.join(room.code);
      io.to(room.code).emit(EVENTS.ROOM_STATE, room);
      io.to(room.code).emit(EVENTS.GAME_SNAPSHOT, room);
      return room;
    }, socket.id);
  });

  socket.on(EVENTS.PLAYER_MOVE, (payload: MoveInput) => {
    const room = rooms.move(socket.id, payload);
    if (room) io.to(room.code).emit(EVENTS.GAME_SNAPSHOT, room);
  });

  socket.on("disconnect", () => {
    const code = rooms.roomCodeFor(socket.id);
    const room = rooms.leave(socket.id);
    if (code && room) {
      io.to(code).emit(EVENTS.ROOM_STATE, room);
      io.to(code).emit(EVENTS.GAME_SNAPSHOT, room);
    }
    console.info(`[socket] disconnected ${socket.id}`);
  });
});

httpServer.listen(port, () => console.info(`Among Us server listening on http://localhost:${port}`));

function runRoomAction(
  acknowledge: (result: RoomAck) => void,
  action: () => ReturnType<RoomStore["create"]>,
  playerId: string,
): void {
  try {
    acknowledge({ ok: true, room: action(), playerId });
  } catch (error) {
    if (error instanceof RoomError) {
      acknowledge({ ok: false, errorCode: error.code, message: error.message });
      return;
    }
    console.error(error);
    acknowledge({ ok: false, errorCode: "INTERNAL_ERROR", message: "Внутренняя ошибка сервера" });
  }
}
