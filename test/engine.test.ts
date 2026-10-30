import { test } from "node:test";
import assert from "node:assert/strict";
import { LEVELS, isSolved, replay, scoreFor, scramble, slide, solved, tileForDirection } from "../src/games/number-slide/engine.ts";
import { rank } from "../src/scores/rank.ts";
import { solve } from "./solve.ts";

test("scramble is deterministic per seed and never already solved", () => {
  for (const l of LEVELS) {
    assert.deepEqual(scramble(l, 42), scramble(l, 42));
    assert.equal(isSolved(scramble(l, 7)), false);
    assert.deepEqual([...scramble(l, 9)].sort((a, b) => a - b), [...solved(l.size)].sort((a, b) => a - b));
  }
});

test("early levels are solvable within the move limit", () => {
  for (const l of LEVELS.slice(0, 2)) {
    for (let seed = 1; seed <= 20; seed++) {
      const taps = solve(scramble(l, seed), l.size, l.shuffles);
      assert.ok(taps, `level ${l.id} seed ${seed} solvable`);
      assert.ok(taps.length <= l.moveLimit);
    }
  }
});

test("slide moves a whole line and counts each tile", () => {
  const b = [1, 2, 3, 4, 5, 6, 7, 8, 0];
  const r = slide(b, 3, 6)!;
  assert.deepEqual(r.board, [1, 2, 3, 4, 5, 6, 0, 7, 8]);
  assert.equal(r.moved, 2);
  assert.equal(slide(b, 3, 0), null);
  assert.equal(tileForDirection(b, 3, "left"), -1);
  assert.equal(tileForDirection(b, 3, "right"), 7);
  assert.equal(tileForDirection(b, 3, "down"), 5);
});

test("replay accepts a real solution and rejects a fake one", () => {
  const l = LEVELS[0]!;
  const taps = solve(scramble(l, 123), l.size)!;
  const ok = replay(1, 123, taps, 12.3);
  assert.deepEqual(ok, { ok: true, moves: taps.length, score: scoreFor(l, 12.3, taps.length) });
  assert.equal(replay(1, 123, taps.slice(0, -1), 12.3).ok, false);
  assert.equal(replay(1, 123, taps, l.timeLimit + 1).ok, false);
  assert.equal(replay(99, 123, taps, 5).ok, false);
});

test("ranking sorts by score, then best time", () => {
  const rows = rank(
    [
      { player: "a", name: "", level: 1, score: 900, seconds: 20, moves: 10, at: 1 },
      { player: "b", name: "", level: 1, score: 900, seconds: 15, moves: 10, at: 2 },
      { player: "c", name: "", level: 1, score: 950, seconds: 30, moves: 10, at: 3 },
      { player: "c", name: "", level: 2, score: 100, seconds: 90, moves: 10, at: 4 },
    ],
    1,
  );
  assert.deepEqual(rows.map((r) => r.player), ["c", "b", "a"]);
  assert.deepEqual(rank([{ player: "c", name: "", level: 2, score: 100, seconds: 9, moves: 1, at: 4 }, { player: "c", name: "", level: 1, score: 950, seconds: 30, moves: 1, at: 3 }], 0)[0]!.score, 1050);
});
