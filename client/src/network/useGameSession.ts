import { useEffect, useEffectEvent, useRef, useState } from "react";
import { EVENTS, type GameAck, type GameSnapshot, type PrivateState, type ResumedMembership, type RoomMembership, type RoomState } from "@among-us/shared";
import { socket } from "./socket";

export const commands = () => socket.timeout(5000);
const SESSION_KEY = "space-betrayal.session";

function readSession() {
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch { return null; }
}

function saveSession(token: string | null) {
  try {
    if (token) sessionStorage.setItem(SESSION_KEY, token);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch { /* The current connection remains usable when storage is disabled. */ }
}

export function useGameSession() {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [playerId, setPlayerId] = useState("");
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [privateState, setPrivate] = useState<PrivateState | null>(null);
  const [connected, setConnected] = useState(socket.connected);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(() => !!readSession());
  const snapshots = useRef<GameSnapshot | null>(null);
  const roomCode = useRef("");
  const inFlight = useRef<symbol | null>(null);
  const resumeInFlight = useRef<string | null>(null);
  const lastServerTime = useRef(0);

  function resetRoom() {
    roomCode.current = "";
    snapshots.current = null;
    lastServerTime.current = 0;
    setSnapshot(null);
    setPrivate(null);
    setRoom(null);
    setPlayerId("");
  }

  function clearRoom() {
    saveSession(null);
    resetRoom();
  }

  function enterRoom({ room: joined, playerId: id, sessionToken }: RoomMembership) {
    saveSession(sessionToken);
    roomCode.current = joined.code;
    lastServerTime.current = joined.serverTime;
    setPlayerId(id);
    setRoom(joined);
  }

  function receiveSnapshot(state: GameSnapshot) {
    if (state.code !== roomCode.current || (snapshots.current && state.serverTime < snapshots.current.serverTime)) return;
    snapshots.current = state;
    setSnapshot(state);
  }

  async function restoreSession() {
    const token = readSession();
    const connection = socket.id;
    if (!token || !socket.connected || !connection || roomCode.current || resumeInFlight.current === connection) {
      if (!token) setRestoring(false);
      return;
    }
    resumeInFlight.current = connection;
    setRestoring(true);
    setError("");
    try {
      const ack: GameAck<ResumedMembership> = await commands().emitWithAck(EVENTS.ROOM_RESUME, { sessionToken: token });
      if (!socket.connected || socket.id !== connection) return;
      if (ack.ok) {
        enterRoom(ack.data);
        receiveSnapshot(ack.data.snapshot);
        setPrivate(ack.data.privateState);
      } else {
        saveSession(null);
        setError(ack.message);
      }
    } catch {
      if (socket.id === connection) setError("Сервер не ответил при восстановлении сессии. Повторите попытку.");
    } finally {
      if (resumeInFlight.current === connection) {
        resumeInFlight.current = null;
        setRestoring(false);
      }
    }
  }

  const restoreOnConnect = useEffectEvent(() => void restoreSession());

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      restoreOnConnect();
    };
    const onDisconnect = (reason: string) => {
      if (reason === "io server disconnect") {
        saveSession(null);
        setError("Эта сессия открыта в другой вкладке.");
      }
      resetRoom();
      inFlight.current = null;
      resumeInFlight.current = null;
      setRestoring(!!readSession());
      setBusy(false);
      setConnected(false);
    };
    const onRoom = (state: RoomState) => {
      if (state.code !== roomCode.current || state.serverTime < lastServerTime.current) return;
      lastServerTime.current = state.serverTime;
      setRoom(state);
    };
    const onPrivate = (state: PrivateState) => {
      if (state.code === roomCode.current) setPrivate(state);
    };
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on(EVENTS.ROOM_STATE, onRoom);
    socket.on(EVENTS.PLAYER_PRIVATE_STATE, onPrivate);
    socket.on(EVENTS.GAME_SNAPSHOT, receiveSnapshot);
    if (socket.connected) onConnect();
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off(EVENTS.ROOM_STATE, onRoom);
      socket.off(EVENTS.PLAYER_PRIVATE_STATE, onPrivate);
      socket.off(EVENTS.GAME_SNAPSHOT, receiveSnapshot);
    };
  }, []);

  async function run<T>(send: () => Promise<GameAck<T>>, onSuccess?: (data: T) => void): Promise<boolean> {
    if (inFlight.current || !socket.connected || restoring) return false;
    setError("");
    setBusy(true);
    const id = Symbol();
    inFlight.current = id;
    try {
      const ack = await send();
      if (inFlight.current !== id) return false;
      if (!ack.ok) {
        setError(ack.message);
        return false;
      }
      onSuccess?.(ack.data);
      return true;
    } catch {
      if (inFlight.current === id) setError("Сервер не ответил. Попробуйте ещё раз.");
      return false;
    } finally {
      if (inFlight.current === id) {
        inFlight.current = null;
        setBusy(false);
      }
    }
  }

  return { room, playerId, snapshot, snapshots, privateState, connected, error, setError, busy,
    restoring, savedSession: !!readSession(), restoreSession, run, clearRoom, enterRoom };
}
