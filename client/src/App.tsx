import { useEffect, useEffectEvent, useState, type FormEvent } from "react";
import {
  EVENTS, KILL_RADIUS, MAP, REPORT_RADIUS, TASK_RADIUS, withinReach,
  type GameResult, type PlayerState, type Role, type TaskChallenge, type TaskProof, type VoteResult,
} from "@among-us/shared";
import { GameCanvas } from "./game/GameCanvas";
import { TaskPanel } from "./game/TaskPanel";
import { commands, useGameSession } from "./network/useGameSession";

type Session = ReturnType<typeof useGameSession>;
type InRoom = Session & { room: NonNullable<Session["room"]> };

const ROLE_NAMES: Record<Role, string> = { crew: "Экипаж", impostor: "Предатель" };
const WIN_REASONS: Record<GameResult["reason"], string> = {
  tasks: "Экипаж выполнил все задания.",
  impostors_eliminated: "В игре не осталось живых предателей.",
  parity: "Живых предателей стало не меньше, чем членов экипажа.",
};

export function App() {
  const game = useGameSession();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  if (game.room && game.playerId) {
    const session = { ...game, room: game.room };
    if (game.room.phase === "lobby") return <Lobby session={session} />;
    if (game.room.phase === "ended" && game.room.result) return <Result session={session} result={game.room.result} />;
    return <Match key={game.room.round} session={session} />;
  }

  function createRoom(event: FormEvent) {
    event.preventDefault();
    void game.run(() => commands().emitWithAck(EVENTS.ROOM_CREATE, { playerName: name }), game.enterRoom);
  }

  function joinRoom(event: FormEvent) {
    event.preventDefault();
    void game.run(() => commands().emitWithAck(EVENTS.ROOM_JOIN, { playerName: name, roomCode: code }), game.enterRoom);
  }

  return (
    <main className="landing">
      <section className="hero">
        <h1>Space <span>Betrayal</span></h1>
        <p>Соберите экипаж на орбитальной станции. Выполняйте задания, сообщайте о телах и голосуйте, чтобы найти предателя.</p>
      </section>
      <section className="lobby-card">
        <Connection online={game.connected} />
        <label>
          Имя игрока
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Например, Red" maxLength={20} autoFocus />
        </label>
        <form onSubmit={createRoom}>
          <button className="primary" disabled={!game.connected || game.busy}>Создать комнату</button>
        </form>
        <div className="divider"><span>или</span></div>
        <form className="join-form" onSubmit={joinRoom}>
          <label>
            Код комнаты
            <input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="ABC123" maxLength={6} />
          </label>
          <button disabled={!game.connected || game.busy}>Войти</button>
        </form>
        <ErrorText text={game.error} />
      </section>
    </main>
  );
}

function Lobby({ session }: { session: InRoom }) {
  const { room, playerId, run, busy, setError } = session;
  const [copied, setCopied] = useState(false);
  const me = room.players.find((player) => player.id === playerId);
  const enough = room.players.length >= room.minPlayers;
  const everyoneReady = room.players.every((player) => player.isHost || player.ready);
  async function copyCode() {
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
    } catch {
      setError("Скопируйте код комнаты вручную.");
    }
  }
  return (
    <main className="centered">
      <section className="lobby-card wide">
        <Connection online={session.connected} />
        <h1>Лобби</h1>
        <div className="room-code">
          <strong>{room.code}</strong>
          <button className="quiet" onClick={() => void copyCode()}>{copied ? "Код скопирован" : "Копировать код"}</button>
        </div>
        <p>Откройте игру в других вкладках или передайте код друзьям.</p>
        <h2>Игроки {room.players.length}/{room.maxPlayers}</h2>
        <ul className="players">
          {room.players.map((player) => (
            <li key={player.id}>
              <PlayerName player={player} me={playerId} />
              <span className={player.ready ? "ready" : "muted"}>{player.ready ? "Готов" : "Ожидает"}</span>
            </li>
          ))}
        </ul>
        <div className="actions">
          <button disabled={busy} aria-pressed={me?.ready ?? false}
            onClick={() => void run(() => commands().emitWithAck(EVENTS.PLAYER_READY, { ready: !me?.ready }))}>
            {me?.ready ? "Отменить готовность" : "Ready"}
          </button>
          {me?.isHost && <button className="primary" disabled={busy || !enough || !everyoneReady}
            onClick={() => void run(() => commands().emitWithAck(EVENTS.GAME_START))}>Start</button>}
          <LeaveButton session={session} />
        </div>
        <p className="muted">{!enough ? `Для старта нужно минимум ${room.minPlayers} игрока.`
          : !everyoneReady ? "Ожидаем готовности остальных игроков." : "Хост может начать матч."}</p>
        <ErrorText text={session.error} />
      </section>
    </main>
  );
}

function Match({ session }: { session: InRoom }) {
  const { room, snapshots, snapshot, playerId, privateState, busy, run } = session;
  const [task, setTask] = useState<{ id: string; challenge: TaskChallenge } | null>(null);
  const [killTarget, setKillTarget] = useState("");
  const privateRound = privateState?.round === room.round ? privateState : null;
  const role = privateRound?.role;
  const me = room.players.find((player) => player.id === playerId);
  const position = snapshot?.players.find((player) => player.id === playerId);
  const playing = room.phase === "playing" && !!me?.alive;
  const tasks = privateRound?.tasks ?? [];
  const pendingSpots = tasks.filter((entry) => !entry.completed).map((entry) => entry.spotId);
  const nearbyTask = position && tasks.find((entry) => {
    const spot = MAP.taskSpots.find(({ id }) => entry.spotId === id);
    return !entry.completed && spot && withinReach(position, spot, TASK_RADIUS);
  });
  const arrivedAt = useServerClock(room.serverTime);
  const canKill = role === "impostor" && playing;
  const cooldown = Math.max(0, Math.ceil(((privateRound?.killAvailableAt ?? 0) - arrivedAt) / 1000));
  const targets = canKill && position ? (snapshot?.players ?? []).filter((player) =>
    player.id !== playerId && player.alive && withinReach(position, player, KILL_RADIUS)) : [];
  const target = targets.find((candidate) => candidate.id === killTarget) ?? targets[0];
  const body = playing && position && snapshot?.bodies.find((candidate) => withinReach(position, candidate, REPORT_RADIUS));
  const inMeeting = room.phase === "meeting" || room.phase === "voting";

  useEffect(() => { setTask(null); }, [room.phase, me?.alive]);

  const useTask = () => {
    if (!playing || !nearbyTask || task) return;
    void run<TaskChallenge>(() => commands().emitWithAck(EVENTS.TASK_INTERACT, { taskId: nearbyTask.id }),
      (challenge) => setTask({ id: nearbyTask.id, challenge }));
  };
  const handleKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.repeat) return;
    if (event.code === "KeyE") useTask();
    if (event.key === "Escape" && task) setTask(null);
  });
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => handleKey(event);
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, []);

  const solve = (proof: TaskProof) => task
    ? run(() => commands().emitWithAck(EVENTS.TASK_COMPLETE, { taskId: task.id, proof }), () => setTask(null))
    : Promise.resolve(false);

  return (
    <main className="game-layout">
      <aside className="room-panel">
        <Connection online={session.connected} />
        <h1>Комната <span>{room.code}</span></h1>
        {role && <p className={role === "impostor" ? "hostile" : "ready"}>Ваша роль · {ROLE_NAMES[role]}</p>}
        {!me?.alive && <p className="muted">Вы наблюдаете за матчем.</p>}
        <h2>Задания экипажа {room.progress.completed}/{room.progress.total}</h2>
        <progress aria-label="Прогресс экипажа" value={room.progress.completed} max={room.progress.total || 1} />
        {role === "crew" && <>
          <h2>Ваши задания</h2>
          <ul className="tasks">
            {tasks.map((entry) => {
              const spot = MAP.taskSpots.find(({ id }) => entry.spotId === id)!;
              const roomName = MAP.rooms.find(({ id }) => spot.roomId === id)!.label.toLowerCase();
              return <li key={entry.id} className={entry.completed ? "ready" : ""}>
                <span aria-hidden="true">{entry.completed ? "✓" : "○"}</span> {spot.kind === "wires" ? "Проводка" : "Заправка"} · {roomName}
              </li>;
            })}
          </ul>
        </>}
        <p className="controls"><kbd>WASD</kbd> / <kbd>← ↑ ↓ →</kbd> Движение</p>
        <div className="actions">
          {role === "crew" && <button disabled={!nearbyTask || !playing || busy || !!task} onClick={useTask}>Use <kbd>E</kbd></button>}
          <button disabled={!body || busy || !!task}
            onClick={() => { if (body) void run(() => commands().emitWithAck(EVENTS.BODY_REPORT, { bodyId: body.id })); }}>Report</button>
        </div>
        {canKill && <div className="kill-panel">
          {targets.length > 0 && <label>
            Цель
            <select value={target?.id ?? ""} onChange={(event) => setKillTarget(event.target.value)}>
              {targets.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
            </select>
          </label>}
          <button className="danger" disabled={!target || cooldown > 0 || busy}
            onClick={() => { if (target) void run(() => commands().emitWithAck(EVENTS.PLAYER_KILL, { targetId: target.id })); }}>
            Kill{cooldown > 0 ? ` · ${cooldown} с` : ""}
          </button>
        </div>}
        {room.voteResult && !inMeeting && <p className="notice" role="status">{voteSummary(room.voteResult)}</p>}
        <ErrorText text={session.error} />
        <LeaveButton session={session} />
      </aside>
      <section className="game-stage">
        {snapshot && room.phase !== "starting" && <GameCanvas snapshots={snapshots} playerId={playerId} taskSpots={me?.alive ? pendingSpots : []}
          blocked={!!task || !playing} />}
        {room.phase === "starting" && role && (
          <div className="overlay">
            <section className={`match-card role-card ${role}`}>
              <h2>{ROLE_NAMES[role]}</h2>
              <p>{role === "crew" ? "Выполняйте задания и найдите предателя" : "Устраните экипаж и не раскройте себя"}</p>
              <p className="muted">Матч скоро начнётся</p>
            </section>
          </div>
        )}
        {inMeeting && <Meeting session={session} now={arrivedAt} />}
        {playing && task && <TaskPanel key={task.challenge.token} challenge={task.challenge} busy={busy}
          onSolve={solve} onClose={() => setTask(null)} />}
      </section>
    </main>
  );
}

function Meeting({ session, now }: { session: InRoom; now: number }) {
  const { room, playerId, busy, run, privateState, error } = session;
  if (!room.meeting) return null;
  const voting = room.phase === "voting";
  const alive = room.players.find((player) => player.id === playerId)?.alive;
  const canVote = voting && alive && !privateState?.hasVoted;
  const seconds = Math.max(0, Math.ceil((room.meeting.deadline - now) / 1000));
  const cast = (targetId: string | null) => void run(() => commands().emitWithAck(EVENTS.VOTE_CAST, { targetId }));
  return (
    <div className="overlay">
      <section className="match-card meeting-card">
        <div className="phase-header"><h2>{voting ? "Голосование" : "Обсуждение"}</h2><time>{seconds} с</time></div>
        <p>О теле сообщил <strong>{room.meeting.reporter.name}</strong>.</p>
        <ul className="players">
          {room.players.map((player) => (
            <li key={player.id}>
              <PlayerName player={player} me={playerId} />
              <span className="muted">{player.alive ? "В игре" : "Мёртв"}</span>
              {canVote && player.alive && <button className="quiet" aria-label={`Голосовать за ${player.name}`}
                disabled={busy || !seconds} onClick={() => cast(player.id)}>Голосовать</button>}
            </li>
          ))}
        </ul>
        {canVote && <button disabled={busy || !seconds} onClick={() => cast(null)}>Skip</button>}
        {voting && privateState?.hasVoted && <p role="status">Ваш голос принят.</p>}
        <ErrorText text={error} />
      </section>
    </div>
  );
}

function Result({ session, result }: { session: InRoom; result: GameResult }) {
  const { room, busy, run, playerId } = session;
  const me = room.players.find((player) => player.id === playerId);
  const self = result.players.find((player) => player.id === playerId);
  const returnToLobby = () => void run(() => commands().emitWithAck(EVENTS.GAME_RETURN));
  return (
    <main className="centered">
      <section className="lobby-card wide">
        <Connection online={session.connected} />
        <h1 className={result.winner === "impostor" ? "hostile" : "ready"}>
          {result.winner === "crew" ? "Экипаж победил" : "Предатели победили"}
        </h1>
        {self && <p><strong>{self.role === result.winner ? "Вы победили." : "Вы проиграли."}</strong></p>}
        <p>{WIN_REASONS[result.reason]}</p>
        {room.voteResult && <p className="notice">{voteSummary(room.voteResult)}</p>}
        <ul className="players">
          {result.players.map((player) => (
            <li key={player.id}>
              <PlayerName player={player} me={playerId} />
              <span className={player.role === "impostor" ? "hostile" : "ready"}>{ROLE_NAMES[player.role]}</span>
            </li>
          ))}
        </ul>
        <div className="actions">
          {me?.isHost && <button className="primary" disabled={busy} onClick={returnToLobby}>Новый матч</button>}
          <button disabled={busy} onClick={returnToLobby}>Вернуться в лобби</button>
          <LeaveButton session={session} />
        </div>
        <p className="muted">В лобби игроки снова отмечают готовность перед стартом.</p>
        <ErrorText text={session.error} />
      </section>
    </main>
  );
}

function voteSummary(result: VoteResult) {
  if (result.outcome === "ejected") return `По итогам голосования исключён игрок ${result.ejected?.name}.`;
  if (result.outcome === "tie") return "Ничья. Никто не исключён.";
  if (result.outcome === "skip") return "Победил Skip. Никто не исключён.";
  return "Голоса не поданы.";
}

function LeaveButton({ session }: { session: InRoom }) {
  return <button className="quiet" disabled={session.busy}
    onClick={() => void session.run(() => commands().emitWithAck(EVENTS.ROOM_LEAVE), session.clearRoom)}>Выйти</button>;
}

function PlayerName({ player, me }: { player: PlayerState; me: string }) {
  return <span className="player-name">
    <i aria-hidden="true" style={{ backgroundColor: `#${player.color.toString(16).padStart(6, "0")}` }} />
    {player.name}{player.id === me ? " (вы)" : ""}
    {player.isHost && <small className="host">Хост</small>}
  </span>;
}

function Connection({ online }: { online: boolean }) {
  return <div className={`status ${online ? "online" : "offline"}`}>{online ? "Сервер подключён" : "Подключение…"}</div>;
}

function ErrorText({ text }: { text: string }) {
  return text && <p className="error" role="alert">{text}</p>;
}

function useServerClock(serverTime: number) {
  const [offset, setOffset] = useState(() => serverTime - Date.now());
  const [now, setNow] = useState(Date.now);
  useEffect(() => { setOffset(serverTime - Date.now()); }, [serverTime]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 125);
    return () => window.clearInterval(timer);
  }, []);
  return now + offset;
}
