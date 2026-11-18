import { io, type Socket } from "socket.io-client";
import type { ClientEvents, ServerEvents } from "@among-us/shared";

// Без VITE_SERVER_URL сервер ищется на том же компьютере, с которого открыта игра:
// так к хосту можно подключиться из той же Wi-Fi сети по его IP.
const serverUrl = import.meta.env.VITE_SERVER_URL || `${window.location.protocol}//${window.location.hostname}:3001`;
export const socket: Socket<ServerEvents, ClientEvents> = io(serverUrl, { transports: ["websocket", "polling"] });
