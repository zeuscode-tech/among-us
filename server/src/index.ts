import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { createGameServer } from "./gameServer.js";
import { DEFAULT_GAME_OPTIONS as defaults } from "./rooms/RoomStore.js";

config({ path: fileURLToPath(new URL("../../.env", import.meta.url)), quiet: true });

const port = integerEnv("PORT", 3001, 1, 65535);
const server = createGameServer({
  clientOrigin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
  game: {
    minPlayers: integerEnv("MIN_PLAYERS", defaults.minPlayers, 2, 10),
    discussionMs: integerEnv("DISCUSSION_DURATION_MS", defaults.discussionMs, 100, 600_000),
    votingMs: integerEnv("VOTING_DURATION_MS", defaults.votingMs, 100, 600_000),
    sessionGraceMs: integerEnv("SESSION_GRACE_MS", defaults.sessionGraceMs, 250, 600_000),
    killCooldownMs: integerEnv("KILL_COOLDOWN_MS", defaults.killCooldownMs, 0, 600_000),
  },
});

server.httpServer.listen(port, () => console.info(`Among Us server listening on http://localhost:${port}`));
process.once("SIGINT", () => void server.close());
process.once("SIGTERM", () => void server.close());

function integerEnv(name: string, fallback: number, min: number, max: number): number {
  const value = process.env[name];
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}
