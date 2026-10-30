import { isSolved, slide, type Board } from "../src/games/number-slide/engine.ts";

/** Breadth-first solver for small boards; returns the tapped indexes of a shortest solution. */
export const solve = (start: Board, size: number, maxDepth = 24): number[] | null => {
  const key = (b: Board) => b.join(",");
  const seen = new Map<string, { prev: string | null; tap: number }>([[key(start), { prev: null, tap: -1 }]]);
  let frontier: Board[] = [start];
  for (let d = 0; d <= maxDepth && frontier.length; d++) {
    const next: Board[] = [];
    for (const b of frontier) {
      if (isSolved(b)) {
        const taps: number[] = [];
        let k: string | null = key(b);
        while (k) {
          const e: { prev: string | null; tap: number } = seen.get(k)!;
          if (e.tap >= 0) taps.unshift(e.tap);
          k = e.prev;
        }
        return taps;
      }
      const empty = b.indexOf(0);
      for (const n of [empty - size, empty + size, empty - 1, empty + 1]) {
        if (n < 0 || n >= b.length || (Math.abs(n - empty) === 1 && Math.floor(n / size) !== Math.floor(empty / size))) continue;
        const r = slide(b, size, n)!;
        const k = key(r.board);
        if (seen.has(k)) continue;
        seen.set(k, { prev: key(b), tap: n });
        next.push(r.board);
      }
    }
    frontier = next;
  }
  return null;
};
