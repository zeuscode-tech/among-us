import { useEffect, useRef, useState } from "react";
import { EVENTS, type GameAck, type GameSnapshot, type PrivateState, type RoomMembership, type RoomState } from "@among-us/shared";
import { socket } from "./socket";

export const commands = () => socket.timeout(5000);

export function useGameSession() {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [playerId, setPlayerId] = useState("");
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [privateState, setPrivate] = useState<PrivateState | null>(null);
  const [connected, setConnected] = useState(socket.connected);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const snapshots = useRef<GameSnapshot | null>(null);
  const roomCode = useRef("");
  const inFlight = useRef<symbol | null>(null);

  function clearRoom() {
    roomCode.current = "";
    snapshots.current = null;
    setSnapshot(null);
    setPrivate(null);
    setRoom(null);
    setPlayerId("");
  }

  function enterRoom({ room: joined, playerId: id }: RoomMembership) {
    roomCode.current = joined.code;
    setPlayerId(id);
    setRoom(joined);
  }

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => {
      if (roomCode.current) setError("Связь прервалась. Войдите в комнату снова после подключения.");
      clearRoom();
      inFlight.current = null;
      setBusy(false);
      setConnected(false);
    };
    const onRoom = (state: RoomState) => {
      if (state.code === roomCode.current) setRoom(state);
    };
    const onPrivate = (state: PrivateState) => {
      if (state.code === roomCode.current) setPrivate(state);
    };
    const onSnapshot = (state: GameSnapshot) => {
      if (state.code !== roomCode.current) return;
      snapshots.current = state;
      setSnapshot(state);
    };
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on(EVENTS.ROOM_STATE, onRoom);
    socket.on(EVENTS.PLAYER_PRIVATE_STATE, onPrivate);
    socket.on(EVENTS.GAME_SNAPSHOT, onSnapshot);
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off(EVENTS.ROOM_STATE, onRoom);
      socket.off(EVENTS.PLAYER_PRIVATE_STATE, onPrivate);
      socket.off(EVENTS.GAME_SNAPSHOT, onSnapshot);
    };
  }, []);

  async function run<T>(send: () => Promise<GameAck<T>>, onSuccess?: (data: T) => void): Promise<boolean> {
    if (inFlight.current || !socket.connected) return false;
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

  return { room, playerId, snapshot, snapshots, privateState, connected, error, setError, busy, run, clearRoom, enterRoom };
}
