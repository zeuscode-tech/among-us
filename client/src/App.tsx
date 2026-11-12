import { useEffect, useState, type FormEvent } from "react";
import { EVENTS, type RoomAck, type RoomState } from "@among-us/shared";
import { GameCanvas } from "./game/GameCanvas";
import { socket } from "./network/socket";

export function App() {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [room, setRoom] = useState<RoomState | null>(null);
  const [playerId, setPlayerId] = useState("");
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onRoom = (nextRoom: RoomState) => setRoom(nextRoom);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on(EVENTS.ROOM_STATE, onRoom);
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off(EVENTS.ROOM_STATE, onRoom);
    };
  }, []);

  const handleAck = (result: RoomAck) => {
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setError("");
    setPlayerId(result.playerId);
    setRoom(result.room);
  };

  const createRoom = (event: FormEvent) => {
    event.preventDefault();
    socket.emit(EVENTS.ROOM_CREATE, { playerName: name }, handleAck);
  };

  const joinRoom = (event: FormEvent) => {
    event.preventDefault();
    socket.emit(EVENTS.ROOM_JOIN, { playerName: name, roomCode: code }, handleAck);
  };

  if (room && playerId) {
    return (
      <main className="game-layout">
        <aside className="room-panel">
          <div className="eyebrow">SPRINT 1 · ONLINE</div>
          <h1>Комната <span>{room.code}</span></h1>
          <p className="copy-hint">Передайте код второму игроку и откройте сайт в другой вкладке.</p>
          <div className={`status ${connected ? "online" : "offline"}`}>{connected ? "Сервер подключён" : "Нет связи с сервером"}</div>
          <h2>Игроки {room.players.length}/{room.maxPlayers}</h2>
          <ul className="players">
            {room.players.map((player) => (
              <li key={player.id}>
                <i style={{ backgroundColor: `#${player.color.toString(16).padStart(6, "0")}` }} />
                {player.name}{player.id === playerId ? " (вы)" : ""}{player.isHost ? " ★" : ""}
              </li>
            ))}
          </ul>
          <p className="controls">Управление: <strong>WASD</strong> или стрелки</p>
        </aside>
        <section className="game-stage">
          <GameCanvas socket={socket} playerId={playerId} initialRoom={room} onRoomUpdate={setRoom} />
        </section>
      </main>
    );
  }

  return (
    <main className="landing">
      <section className="hero">
        <div className="eyebrow">СТУДЕНЧЕСКИЙ MULTIPLAYER ПРОЕКТ</div>
        <h1>Space <span>Betrayal</span></h1>
        <p>Первый вертикальный срез: создайте комнату, подключите второго игрока и исследуйте общую карту.</p>
      </section>
      <section className="lobby-card">
        <div className={`status ${connected ? "online" : "offline"}`}>{connected ? "Сервер подключён" : "Подключение…"}</div>
        <label>
          Имя игрока
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Например, Red" maxLength={20} autoFocus />
        </label>
        <form onSubmit={createRoom}>
          <button className="primary" disabled={!connected}>Создать комнату</button>
        </form>
        <div className="divider"><span>или</span></div>
        <form className="join-form" onSubmit={joinRoom}>
          <label>
            Код комнаты
            <input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="ABC123" maxLength={6} />
          </label>
          <button disabled={!connected}>Войти</button>
        </form>
        {error && <p className="error" role="alert">{error}</p>}
      </section>
    </main>
  );
}
