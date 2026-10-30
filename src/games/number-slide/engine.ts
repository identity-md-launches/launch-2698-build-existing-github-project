/**
 * Number Slide engine. Pure functions with no DOM access, shared by the browser game and the
 * score server, which replays a submitted run to check it was really solved.
 */

export type Level = {
  id: number;
  name: string;
  size: number;
  shuffles: number;
  moveLimit: number;
  timeLimit: number; // seconds
  base: number; // points for clearing the level
};

export const LEVELS: readonly Level[] = [
  { id: 1, name: "Warm-up", size: 3, shuffles: 10, moveLimit: 30, timeLimit: 90, base: 100 },
  { id: 2, name: "Nibble", size: 3, shuffles: 18, moveLimit: 45, timeLimit: 120, base: 200 },
  { id: 3, name: "Cheese run", size: 3, shuffles: 30, moveLimit: 70, timeLimit: 150, base: 300 },
  { id: 4, name: "Big wheel", size: 4, shuffles: 30, moveLimit: 80, timeLimit: 210, base: 450 },
  { id: 5, name: "Maze", size: 4, shuffles: 55, moveLimit: 140, timeLimit: 300, base: 650 },
  { id: 6, name: "Night shift", size: 5, shuffles: 60, moveLimit: 170, timeLimit: 420, base: 900 },
];

export const getLevel = (id: number): Level | undefined => LEVELS.find((l) => l.id === id);

/** Board cells in reading order; 0 is the empty cell. */
export type Board = number[];

export const solved = (size: number): Board => {
  const b = Array.from({ length: size * size }, (_, i) => i + 1);
  b[b.length - 1] = 0;
  return b;
};

export const isSolved = (b: Board): boolean => b.every((v, i) => (i === b.length - 1 ? v === 0 : v === i + 1));

/** mulberry32: small deterministic PRNG so a seed always rebuilds the same scramble. */
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const neighbours = (size: number, i: number): number[] => {
  const r = Math.floor(i / size);
  const c = i % size;
  const out: number[] = [];
  if (r > 0) out.push(i - size);
  if (r < size - 1) out.push(i + size);
  if (c > 0) out.push(i - 1);
  if (c < size - 1) out.push(i + 1);
  return out;
};

/**
 * Scramble by walking the empty cell from the solved board, never undoing the previous step.
 * Every scramble is therefore solvable in at most `shuffles` moves, so the move limit is fair.
 */
export const scramble = (level: Level, seed: number): Board => {
  const rand = rng(seed);
  for (;;) {
    const b = solved(level.size);
    let empty = b.length - 1;
    let prev = -1;
    for (let n = 0; n < level.shuffles; n++) {
      const opts = neighbours(level.size, empty).filter((i) => i !== prev);
      const next = opts[Math.floor(rand() * opts.length)]!;
      b[empty] = b[next]!;
      b[next] = 0;
      prev = empty;
      empty = next;
    }
    if (!isSolved(b)) return b;
  }
};

/**
 * Slide toward the empty cell. Tapping a tile in the empty cell's row or column slides every
 * tile between them; each tile that moves counts as one move. Returns null when nothing moves.
 */
export const slide = (b: Board, size: number, index: number): { board: Board; moved: number } | null => {
  const empty = b.indexOf(0);
  if (index === empty || index < 0 || index >= b.length) return null;
  const er = Math.floor(empty / size);
  const ec = empty % size;
  const r = Math.floor(index / size);
  const c = index % size;
  if (r !== er && c !== ec) return null;
  const step = r === er ? (c > ec ? 1 : -1) : c === ec && r > er ? size : -size;
  const next = b.slice();
  let hole = empty;
  let moved = 0;
  while (hole !== index) {
    next[hole] = next[hole + step]!;
    next[hole + step] = 0;
    hole += step;
    moved++;
  }
  return { board: next, moved };
};

export type Direction = "up" | "down" | "left" | "right";

/** The tile that moves when the player pushes in a direction (arrow key or swipe). */
export const tileForDirection = (b: Board, size: number, dir: Direction): number => {
  const empty = b.indexOf(0);
  const r = Math.floor(empty / size);
  const c = empty % size;
  if (dir === "up" && r < size - 1) return empty + size;
  if (dir === "down" && r > 0) return empty - size;
  if (dir === "left" && c < size - 1) return empty + 1;
  if (dir === "right" && c > 0) return empty - 1;
  return -1;
};

/**
 * Score for a cleared level: the level's base, plus up to 500 for time left and up to 500 for
 * moves left. A failed run scores 0.
 */
export const scoreFor = (level: Level, seconds: number, moves: number): number => {
  const timeLeft = Math.max(0, level.timeLimit - seconds) / level.timeLimit;
  const movesLeft = Math.max(0, level.moveLimit - moves) / level.moveLimit;
  return level.base + Math.round(timeLeft * 500) + Math.round(movesLeft * 500);
};

export type Replay = { ok: true; moves: number; score: number } | { ok: false; reason: string };

/** Replay a run from its seed and tapped cell indexes; used by the server to check a submission. */
export const replay = (levelId: number, seed: number, taps: number[], seconds: number): Replay => {
  const level = getLevel(levelId);
  if (!level) return { ok: false, reason: "Unknown level" };
  if (!(seconds > 0) || seconds > level.timeLimit) return { ok: false, reason: "Time outside the level's limit" };
  let board = scramble(level, seed);
  let moves = 0;
  for (const t of taps) {
    const r = slide(board, level.size, t);
    if (!r) return { ok: false, reason: "Invalid move in replay" };
    board = r.board;
    moves += r.moved;
    if (moves > level.moveLimit) return { ok: false, reason: "Move limit exceeded" };
  }
  if (!isSolved(board)) return { ok: false, reason: "Puzzle not solved" };
  return { ok: true, moves, score: scoreFor(level, seconds, moves) };
};

/** m:ss for clocks and limits. */
export const fmtTime = (s: number): string => {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
};
