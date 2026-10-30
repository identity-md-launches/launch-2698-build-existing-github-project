import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { scramble, LEVELS, scoreFor } from "../src/games/number-slide/engine.ts";
import { scoreMessage, type Submission } from "../src/scores/message.ts";
import { solve } from "./solve.ts";

process.env.DATA_FILE = join(mkdtempSync(join(tmpdir(), "sqa-")), "scores.json");
const { start } = await import("../server/index.ts");

test("server verifies, stores and ranks a signed score", async () => {
  const server = await start(0);
  const port = (server.address() as { port: number }).port;
  const api = `http://127.0.0.1:${port}/api`;
  try {
    // A throwaway key made for this test run only.
    const account = privateKeyToAccount(generatePrivateKey());
    const seed = 2024;
    const taps = solve(scramble(LEVELS[0]!, seed), 3)!;
    const sub: Submission = {
      address: account.address, name: "Squeek", game: "number-slide", level: 1, seed, taps,
      seconds: 14.2, moves: taps.length, score: scoreFor(LEVELS[0]!, 14.2, taps.length), issuedAt: Date.now(),
    };
    const signature = await account.signMessage({ message: scoreMessage(sub) });
    const post = (body: unknown) => fetch(`${api}/scores`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

    const ok = await post({ ...sub, signature });
    assert.equal(ok.status, 201, await ok.clone().text());
    assert.equal((await ok.json()).position, 1);
    assert.equal((await post({ ...sub, signature })).status, 409, "duplicate rejected");
    assert.equal((await post({ ...sub, score: sub.score + 1, signature })).status, 422, "inflated score rejected");
    const other = privateKeyToAccount(generatePrivateKey());
    const forged = await other.signMessage({ message: scoreMessage({ ...sub, issuedAt: sub.issuedAt + 1 }) });
    assert.equal((await post({ ...sub, issuedAt: sub.issuedAt + 1, signature: forged })).status, 401, "wrong signer rejected");

    const board = await (await fetch(`${api}/leaderboard?level=1`)).json();
    assert.equal(board.rows.length, 1);
    assert.equal(board.rows[0].player, account.address);
    assert.equal(board.rows[0].name, "Squeek");
    const cfg = await (await fetch(`http://127.0.0.1:${port}/arcade.config.json`)).json();
    assert.equal(cfg.scoresApi, "./api");
  } finally {
    server.close();
  }
});
