import { io, type Socket } from "socket.io-client";
import type { ClientEvents, ServerEvents } from "@among-us/shared";

const serverUrl = import.meta.env.VITE_SERVER_URL ?? "http://localhost:3001";
export const socket: Socket<ServerEvents, ClientEvents> = io(serverUrl, { transports: ["websocket", "polling"] });
