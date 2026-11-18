import { useEffect, useState, type CSSProperties } from "react";
import { TASKS, type TaskChallenge, type TaskProof } from "@among-us/shared";

interface Props {
  challenge: TaskChallenge;
  busy: boolean;
  error: string;
  onSolve: (proof: TaskProof) => Promise<boolean>;
  onClose: () => void;
}

const GLYPHS = ["●", "▲", "■", "✦"];
const HEADINGS = ["↑", "→", "↓", "←"];
const GLYPH_NAMES = ["Круг", "Треугольник", "Квадрат", "Звезда"];

export function TaskPanel({ challenge, busy, error, onSolve, onClose }: Props) {
  const config = TASKS[challenge.kind];
  const initial = challenge.kind === "trace" ? [challenge.start]
    : challenge.kind === "orbit" ? challenge.initial
    : challenge.kind === "balance" ? challenge.limits.map(() => 0) : [];
  const [answer, setAnswer] = useState<number[]>(initial);
  const [revealed, setRevealed] = useState(challenge.kind === "echo");
  useEffect(() => {
    if (challenge.kind !== "echo") return;
    const timer = window.setTimeout(() => setRevealed(false), challenge.showMs);
    return () => window.clearTimeout(timer);
  }, [challenge]);

  const append = (value: number) => setAnswer((previous) => [...previous, value]);
  const change = (index: number, value: number) => setAnswer((previous) =>
    previous.map((entry, i) => i === index ? value : entry));
  const toggle = (index: number) => setAnswer((previous) => previous.includes(index)
    ? previous.filter((value) => value !== index) : [...previous, index].sort((a, b) => a - b));

  let complete = false;
  let content;
  switch (challenge.kind) {
    case "spectrum":
      complete = answer.length === challenge.readings.length;
      content = <>
        <p>Упорядочьте сигналы по близости к опорной частоте <strong>{challenge.reference} Гц</strong>. Начните с ближайшего.</p>
        <div className="puzzle-choices">
          {challenge.readings.map((reading, index) => <button key={reading} disabled={answer.includes(index)} onClick={() => append(index)}>
            {reading} Гц
          </button>)}
        </div>
        <p className="puzzle-sequence">{answer.map((index) => challenge.readings[index]).join(" → ") || "Выберите первый сигнал"}</p>
      </>;
      break;
    case "echo":
      complete = !revealed && answer.length === challenge.pattern.length;
      content = <>
        <p>{revealed ? "Запомните четыре символа, пока они видны." : "Передайте сигнал в обратном порядке."}</p>
        <p className="puzzle-sequence" aria-label="Последовательность эха">
          {(revealed ? challenge.pattern : answer).map((value) => GLYPHS[value]).join("  ") || "· · · ·"}
        </p>
        <div className="puzzle-choices">
          {GLYPHS.map((glyph, index) => <button key={glyph} aria-label={GLYPH_NAMES[index]}
            disabled={revealed || complete} onClick={() => append(index)}>{glyph}</button>)}
        </div>
      </>;
      break;
    case "balance": {
      const sum = answer.reduce((total, current) => total + current, 0);
      complete = sum === challenge.target;
      content = <>
        <p>Настройте три регулятора. Вместе они должны дать <strong>{challenge.target} ед.</strong></p>
        <div className="puzzle-controls">
          {challenge.limits.map((limit, index) => <label key={index}>
            Регулятор {index + 1} · {answer[index]} / {limit}
            <input aria-label={`Регулятор ${index + 1}`} type="range" min={0} max={limit}
              value={answer[index]} onChange={(event) => change(index, Number(event.target.value))} />
          </label>)}
        </div>
        <output className="puzzle-sequence">{sum} / {challenge.target} ед.</output>
      </>;
      break;
    }
    case "orbit":
      complete = answer.every((value, index) => value === challenge.target[index]);
      content = <>
        <p>Поверните каждое кольцо так, чтобы стрелка совпала с отметкой справа.</p>
        <div className="orbit-controls">
          {challenge.target.map((target, index) => <div key={index}>
            <button className="orbit-wheel" aria-label={`Повернуть кольцо ${index + 1}`}
              onClick={() => change(index, (answer[index]! + 1) % 4)}>{HEADINGS[answer[index]!]}</button>
            <span className="orbit-target" aria-label={`Цель кольца ${index + 1}`}>{HEADINGS[target]}</span>
          </div>)}
        </div>
      </>;
      break;
    case "trace": {
      const { size, blocked, start, finish } = challenge;
      const head = answer.at(-1)!;
      complete = head === finish;
      content = <>
        <p>Проведите дрон от старта до шлюза. Выбирайте соседние клетки и обходите завалы.</p>
        <div className="trace-grid" style={{ "--grid-size": size } as CSSProperties}>
          {Array.from({ length: size * size }, (_, cell) => {
            const adjacent = Math.abs(cell % size - head % size) + Math.abs(Math.floor(cell / size) - Math.floor(head / size)) === 1;
            return <button key={cell} aria-label={`Клетка ${cell + 1}`}
              title={cell === start ? "Старт" : cell === finish ? "Шлюз" : undefined}
              aria-pressed={answer.includes(cell)} disabled={complete || !adjacent || blocked.includes(cell) || answer.includes(cell)}
              onClick={() => append(cell)}>
              {cell === head ? "◆" : cell === finish ? "◎" : blocked.includes(cell) ? "▨" : answer.includes(cell) ? "•" : "·"}
            </button>;
          })}
        </div>
      </>;
      break;
    }
    case "decode":
      complete = answer.length === challenge.signal.length;
      content = <>
        <p>Прочитайте код по легенде и введите соответствующие цифры.</p>
        <div className="puzzle-choices">
          {challenge.alphabet.map((value, index) => <span key={index} className="puzzle-chip">{GLYPHS[index]} = {value}</span>)}
        </div>
        <p className="puzzle-sequence">{challenge.signal.map((value) => GLYPHS[value]).join(" ")}</p>
        <div className="puzzle-choices">
          {GLYPHS.map((_, index) => <button key={index} disabled={complete} onClick={() => append(index)}>{index}</button>)}
        </div>
        <p className="puzzle-sequence">{answer.join(" ") || "· · · ·"}</p>
      </>;
      break;
    case "sample":
      complete = answer.length > 0;
      content = <>
        <p>Отберите все стабильные пробы не горячее <strong>{challenge.limit} °C</strong>.</p>
        <div className="sample-grid">
          {challenge.samples.map((sample, index) => <button key={index} aria-pressed={answer.includes(index)} onClick={() => toggle(index)}>
            Проба {index + 1} · {sample.temperature} °C · {sample.stable ? "стабильна" : "нестабильна"}
          </button>)}
        </div>
      </>;
  }

  return (
    <section className="overlay">
      <div className="match-card" role="dialog" aria-modal="true" aria-label={config.name}>
        <h2>{config.name}</h2>
        {content}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="actions puzzle-actions">
          <button className="primary" disabled={!complete || busy}
            onClick={() => void onSolve({ token: challenge.token, answer })}>Завершить задание</button>
          {challenge.kind !== "sample" && <button disabled={busy} onClick={() => setAnswer(initial)}>Сбросить ввод</button>}
          <button className="quiet" onClick={onClose}>Закрыть <kbd>Esc</kbd></button>
        </div>
      </div>
    </section>
  );
}
