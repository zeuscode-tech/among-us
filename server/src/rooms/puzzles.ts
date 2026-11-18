import { randomUUID } from "node:crypto";
import type { Puzzle, TaskChallenge, TaskSpotKind } from "@among-us/shared";

export function createChallenge(kind: TaskSpotKind, random: () => number): TaskChallenge {
  const draw = (n: number) => Math.floor(random() * n);
  const list = (n: number, make: (index: number) => number) => Array.from({ length: n }, (_, i) => make(i));
  const order = [0, 1, 2, 3];
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = draw(i + 1);
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  let puzzle: Puzzle;
  switch (kind) {
    case "spectrum": {
      const reference = 280 + draw(300);
      const readings = order.map((v) => reference + (17 + v * 31 + draw(12)) * (draw(2) ? 1 : -1));
      puzzle = { kind, reference, readings };
      break;
    }
    case "echo":
      puzzle = { kind, pattern: list(4, () => draw(4)), showMs: 2800 };
      break;
    case "balance":
      puzzle = { kind, target: 7 + draw(4), limits: [3 + draw(2), 4, 5] };
      break;
    case "orbit": {
      const target = list(3, () => draw(4));
      puzzle = { kind, target, initial: target.map((v) => (v + 1 + draw(3)) % 4) };
      break;
    }
    case "trace": {
      const flipX = !!draw(2);
      const flipY = !!draw(2);
      const orient = (cell: number) => {
        const x = cell % 4;
        const y = Math.floor(cell / 4);
        return (flipY ? 3 - y : y) * 4 + (flipX ? 3 - x : x);
      };
      const blocked = draw(2) ? [1, 6, 8, 13] : [2, 4, 9, 11];
      puzzle = { kind, size: 4, start: orient(0), finish: orient(15), blocked: blocked.map(orient) };
      break;
    }
    case "decode":
      puzzle = { kind, alphabet: order, signal: list(4, () => draw(4)) };
      break;
    case "sample": {
      const limit = 22 + draw(6);
      const safe = new Set(order.slice(0, 2));
      puzzle = { kind, limit, samples: list(5, (i) => i).map((i) => safe.has(i)
        ? { temperature: limit - 1 - draw(8), stable: true }
        : { temperature: limit + (i % 2 === 0 ? 1 + draw(8) : -2), stable: i % 2 === 0 }) };
      break;
    }
  }
  return { ...puzzle, token: randomUUID() };
}

export function acceptsAnswer(puzzle: TaskChallenge, proof: unknown, elapsedMs: number): boolean {
  if (!proof || typeof proof !== "object" || !("token" in proof) || !("answer" in proof)) return false;
  if (puzzle.token !== proof.token || !Array.isArray(proof.answer) || proof.answer.length > 16) return false;
  const values: unknown[] = proof.answer;
  if (!values.every((v): v is number => typeof v === "number" && Number.isSafeInteger(v))) return false;
  const same = (expected: readonly number[]) => expected.length === values.length && expected.every((v, i) => v === values[i]);
  switch (puzzle.kind) {
    case "spectrum":
      return same(puzzle.readings.map((_, i) => i).sort((a, b) => Math.abs(puzzle.readings[a]! - puzzle.reference) - Math.abs(puzzle.readings[b]! - puzzle.reference)));
    case "echo":
      return elapsedMs >= puzzle.showMs && same([...puzzle.pattern].reverse());
    case "balance":
      return values.length === puzzle.limits.length
        && puzzle.limits.every((limit, i) => values[i]! >= 0 && values[i]! <= limit)
        && values.reduce((sum, value) => sum + value, 0) === puzzle.target;
    case "orbit":
      return same(puzzle.target);
    case "trace": {
      const { start, finish, size, blocked } = puzzle;
      return values[0] === start && values.at(-1) === finish && new Set(values).size === values.length
        && values.every((cell, i) => {
          if (cell < 0 || cell >= size * size || blocked.includes(cell)) return false;
          if (i === 0) return true;
          const previous = values[i - 1]!;
          return Math.abs(cell % size - previous % size) + Math.abs(Math.floor(cell / size) - Math.floor(previous / size)) === 1;
        });
    }
    case "decode":
      return same(puzzle.signal.map((glyph) => puzzle.alphabet[glyph]!));
    case "sample":
      return same(puzzle.samples.flatMap((sample, i) => sample.stable && sample.temperature <= puzzle.limit ? [i] : []));
  }
}
