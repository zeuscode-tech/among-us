import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { TaskChallenge, TaskProof, WireColor } from "@among-us/shared";

interface Props {
  challenge: TaskChallenge;
  busy: boolean;
  onSolve: (proof: TaskProof) => Promise<boolean>;
  onClose: () => void;
}

const COLORS: Record<WireColor, { hex: string; name: string }> = {
  red: { hex: "#ff7979", name: "Красный" }, blue: { hex: "#61aaff", name: "Синий" },
  yellow: { hex: "#ffe273", name: "Жёлтый" }, purple: { hex: "#d29bff", name: "Фиолетовый" },
};

export function TaskPanel({ challenge, busy, onSolve, onClose }: Props) {
  const title = challenge.kind === "wires" ? "Проводка · Wires" : "Заправка · Fuel";
  return (
    <section className="overlay">
      <div className="match-card" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {challenge.kind === "wires"
          ? <Wires challenge={challenge} busy={busy} onSolve={onSolve} />
          : <Fuel challenge={challenge} busy={busy} onSolve={onSolve} />}
        <button className="quiet" onClick={onClose}>Закрыть <kbd>Esc</kbd></button>
      </div>
    </section>
  );
}

function Wires({ challenge, busy, onSolve }: Pick<Props, "busy" | "onSolve"> & {
  challenge: Extract<TaskChallenge, { kind: "wires" }>;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [connections, setConnections] = useState<number[]>(challenge.left.map(() => -1));
  const [hint, setHint] = useState("");
  const match = (destination: number) => {
    if (selected === null) return;
    if (challenge.left[selected] !== challenge.right[destination]) {
      setHint("Выберите контакт того же цвета.");
      return;
    }
    setConnections((previous) => previous.map((value, index) => index === selected ? destination : value));
    setSelected(null);
    setHint("");
  };
  return (
    <>
      <p>Выберите контакт слева, затем соедините его с контактом того же цвета справа.</p>
      <div className="wires">
        <div className="wire-column">
          {challenge.left.map((color, index) => (
            <button key={color} style={wireStyle(color)} aria-label={`Слева: ${COLORS[color].name}`}
              aria-pressed={selected === index} disabled={connections[index] !== -1}
              onClick={() => { setSelected(index); setHint(""); }}>
              {COLORS[color].name}
            </button>
          ))}
        </div>
        <div className="wire-gap" aria-hidden="true">
          {connections.map((destination, source) => {
            if (destination < 0) return null;
            const offset = (destination - source) * 44;
            return <i key={source} style={{
              ...wireStyle(challenge.left[source]!), top: source * 44 + 19,
              width: Math.hypot(64, offset), transform: `rotate(${Math.atan2(offset, 64)}rad)`,
            }} />;
          })}
        </div>
        <div className="wire-column">
          {challenge.right.map((color, index) => (
            <button key={color} style={wireStyle(color)} aria-label={`Справа: ${COLORS[color].name}`}
              disabled={selected === null || connections.includes(index)} onClick={() => match(index)}>
              {COLORS[color].name}
            </button>
          ))}
        </div>
      </div>
      {hint && <p role="status">{hint}</p>}
      <button className="primary" disabled={busy || connections.includes(-1)}
        onClick={() => void onSolve({ kind: "wires", token: challenge.token, connections })}>
        Завершить задание
      </button>
    </>
  );
}

function wireStyle(color: WireColor): CSSProperties {
  return { "--wire": COLORS[color].hex } as CSSProperties;
}

function Fuel({ challenge, busy, onSolve }: Pick<Props, "busy" | "onSolve"> & {
  challenge: Extract<TaskChallenge, { kind: "fuel" }>;
}) {
  const [charge, setCharge] = useState(0);
  const frame = useRef<number | null>(null);
  const submitting = useRef(false);
  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);

  function stop() {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    if (!submitting.current) setCharge(0);
  }

  function hold() {
    if (frame.current !== null || submitting.current || busy) return;
    const start = performance.now();
    const step = (now: number) => {
      const fraction = Math.min(1, (now - start) / challenge.holdMs);
      setCharge(fraction);
      if (fraction < 1) {
        frame.current = requestAnimationFrame(step);
        return;
      }
      frame.current = null;
      submitting.current = true;
      void onSolve({ kind: "fuel", token: challenge.token }).then((ok) => {
        submitting.current = false;
        if (!ok) setCharge(0);
      });
    };
    frame.current = requestAnimationFrame(step);
  }

  return (
    <>
      <p>Удерживайте кнопку, пока бак не заполнится.</p>
      <progress aria-label="Заполнение бака" value={charge} max={1} />
      <button className="primary" disabled={busy} onBlur={stop}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          hold();
        }}
        onPointerUp={stop} onLostPointerCapture={stop} onPointerCancel={stop}
        onKeyDown={(event) => {
          if (event.key !== " " && event.key !== "Enter") return;
          event.preventDefault();
          hold();
        }}
        onKeyUp={(event) => {
          if (event.key !== " " && event.key !== "Enter") return;
          event.preventDefault();
          stop();
        }}>
        Удерживайте для заправки
      </button>
    </>
  );
}
