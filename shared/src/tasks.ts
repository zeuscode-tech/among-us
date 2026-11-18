export const TASKS = {
  spectrum: { name: "Спектрометр", color: 0xa6b0ff, icon: "≋" },
  echo: { name: "Эхо-сигнал", color: 0x63d9ff, icon: "◉" },
  balance: { name: "Стабилизатор", color: 0xffc969, icon: "±" },
  orbit: { name: "Кольца наведения", color: 0xeab0ff, icon: "⊙" },
  trace: { name: "Маршрут дрона", color: 0xa2eb77, icon: "◇" },
  decode: { name: "Шифр маяка", color: 0xff9a99, icon: "#" },
  sample: { name: "Карантин проб", color: 0x6af0c4, icon: "▣" },
} as const;

export type TaskSpotKind = keyof typeof TASKS;

export type Puzzle =
  | { kind: "spectrum"; reference: number; readings: number[] }
  | { kind: "echo"; pattern: number[]; showMs: number }
  | { kind: "balance"; target: number; limits: number[] }
  | { kind: "orbit"; target: number[]; initial: number[] }
  | { kind: "trace"; size: number; start: number; finish: number; blocked: number[] }
  | { kind: "decode"; alphabet: number[]; signal: number[] }
  | { kind: "sample"; limit: number; samples: { temperature: number; stable: boolean }[] };

export type TaskChallenge = Puzzle & { token: string };
export interface TaskProof { token: string; answer: number[] }
