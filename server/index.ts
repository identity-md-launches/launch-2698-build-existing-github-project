/**
 * Squeekchain Arcade score server. Node 22.18+ runs this TypeScript file directly.
 *
 *   PORT=8787 node server/index.ts
 *
 * Serves the static export in dist/, answers /arcade.config.json so the site uses this server's
 * API, and stores signed scores in a JSON file. A score is accepted only when its signature
 * matches the wallet address and its moves, replayed from the seed, really solve the puzzle.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, getAddress, http, isAddress, verifyMessage } from "viem";
import { base } from "viem/chains";
import { replay } from "../src/games/number-slide/engine.ts";
import { cleanName, scoreMessage, type Submission } from "../src/scores/message.ts";
import { rank, type Run } from "../src/scores/rank.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? "0.0.0.0";
const DATA_FILE = resolve(process.env.DATA_FILE ?? join(root, "server/data/scores.json"));
const DIST = resolve(process.env.DIST_DIR ?? join(root, "dist"));
// Smart-contract wallets (Coinbase Smart Wallet) sign by ERC-1271/6492, which needs a chain read.
const RPC_URL = process.env.RPC_URL ?? "https://mainnet.base.org";
const MAX_AGE_MS = 15 * 60 * 1000;

type Stored = Run & { signature: string; seed: number };

let runs: Stored[] = [];
let writing = Promise.resolve();

const load = async () => {
  try {
    runs = JSON.parse(await readFile(DATA_FILE, "utf8"));
  } catch {
    runs = [];
  }
};

const persist = () => {
  writing = writing.then(async () => {
    await mkdir(dirname(DATA_FILE), { recursive: true });
    const tmp = `${DATA_FILE}.tmp`;
    await writeFile(tmp, JSON.stringify(runs));
    await rename(tmp, DATA_FILE);
  });
  return writing;
};

const client = createPublicClient({ chain: base, transport: http(RPC_URL) });

const verify = async (address: `0x${string}`, message: string, signature: `0x${string}`) => {
  try {
    if (await verifyMessage({ address, message, signature })) return true;
  } catch {
    /* not a plain EOA signature; try the contract-wallet path */
  }
  try {
    return await client.verifyMessage({ address, message, signature });
  } catch {
    return false;
  }
};

const send = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
};

const readBody = (req: IncomingMessage, limit = 64 * 1024) =>
  new Promise<string>((ok, fail) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        fail(new Error("Body too large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => ok(Buffer.concat(chunks).toString("utf8")));
    req.on("error", fail);
  });

const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

export const accept = async (raw: unknown): Promise<{ status: number; body: unknown }> => {
  const b = raw as Partial<Submission> & { signature?: string };
  if (!b || typeof b !== "object") return { status: 400, body: { error: "Expected a JSON object" } };
  if (typeof b.address !== "string" || !isAddress(b.address)) return { status: 400, body: { error: "Invalid address" } };
  if (typeof b.signature !== "string" || !/^0x[0-9a-fA-F]+$/.test(b.signature)) return { status: 400, body: { error: "Invalid signature" } };
  if (b.game !== "number-slide") return { status: 400, body: { error: "Unknown game" } };
  if (!isInt(b.level, 1, 99) || !isInt(b.seed, 0, 2 ** 32) || !isInt(b.moves, 1, 10000) || !isInt(b.score, 0, 1e7))
    return { status: 400, body: { error: "Invalid run fields" } };
  if (!Array.isArray(b.taps) || b.taps.length > 2000 || !b.taps.every((t) => isInt(t, 0, 99)))
    return { status: 400, body: { error: "Invalid moves list" } };
  if (typeof b.seconds !== "number" || !Number.isFinite(b.seconds)) return { status: 400, body: { error: "Invalid time" } };
  if (!isInt(b.issuedAt, 0, Number.MAX_SAFE_INTEGER) || Math.abs(Date.now() - b.issuedAt) > MAX_AGE_MS)
    return { status: 400, body: { error: "Score is too old to save. Play the level again." } };
  if (typeof b.name !== "string" || cleanName(b.name) !== b.name) return { status: 400, body: { error: "Invalid name" } };

  const seconds = Math.round(b.seconds * 10) / 10;
  const result = replay(b.level, b.seed, b.taps, seconds);
  if (!result.ok) return { status: 422, body: { error: result.reason } };
  if (result.moves !== b.moves || result.score !== b.score) return { status: 422, body: { error: "Score does not match the run" } };

  if (runs.some((r) => r.signature === b.signature)) return { status: 409, body: { error: "Score already saved" } };
  const sub: Submission = {
    address: b.address as `0x${string}`, name: b.name, game: "number-slide", level: b.level, seed: b.seed,
    taps: b.taps, seconds, moves: b.moves, score: b.score, issuedAt: b.issuedAt,
  };
  const message = scoreMessage(sub);
  if (!(await verify(sub.address, message, b.signature as `0x${string}`)))
    return { status: 401, body: { error: "Signature does not match the wallet" } };

  const run: Stored = {
    player: getAddress(sub.address), name: sub.name, level: sub.level, score: sub.score, seconds,
    moves: sub.moves, at: Date.now(), signature: b.signature, seed: sub.seed,
  };
  runs.push(run);
  await persist();
  const position = rank(runs, 0, 10000).findIndex((r) => r.player === run.player) + 1;
  return { status: 201, body: { saved: true, position } };
};

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml",
  ".png": "image/png", ".woff2": "font/woff2", ".woff": "font/woff", ".json": "application/json", ".ico": "image/x-icon",
};

const serveStatic = async (res: ServerResponse, path: string) => {
  const rel = normalize(decodeURIComponent(path)).replace(/^(\.\.[/\\])+/, "");
  let file = join(DIST, rel);
  if (!file.startsWith(DIST)) return send(res, 403, { error: "Forbidden" });
  if (file.endsWith("/") || file === DIST) file = join(file, "index.html");
  try {
    const data = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    send(res, 404, { error: "Not found" });
  }
};

export const handle = async (req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url ?? "/", "http://local");
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "content-type");
  res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return void res.writeHead(204).end();
  try {
    if (url.pathname === "/api/health") return send(res, 200, { ok: true, runs: runs.length });
    if (url.pathname === "/api/leaderboard" && req.method === "GET") {
      const level = Number(url.searchParams.get("level") ?? 0);
      if (!isInt(level, 0, 99)) return send(res, 400, { error: "Invalid level" });
      return send(res, 200, { level, rows: rank(runs, level) });
    }
    if (url.pathname === "/api/scores" && req.method === "POST") {
      let body: unknown;
      try {
        body = JSON.parse(await readBody(req));
      } catch {
        return send(res, 400, { error: "Expected a JSON body" });
      }
      const out = await accept(body);
      return send(res, out.status, out.body);
    }
    if (url.pathname.startsWith("/api/")) return send(res, 404, { error: "Not found" });
    if (url.pathname === "/arcade.config.json") return send(res, 200, { scoresApi: "./api" });
    return serveStatic(res, url.pathname);
  } catch (e) {
    return send(res, 500, { error: e instanceof Error ? e.message : "Server error" });
  }
};

export const start = async (port = PORT) => {
  await load();
  const server = createServer((req, res) => void handle(req, res));
  await new Promise<void>((ok) => server.listen(port, HOST, ok));
  return server;
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await start();
  const addr = server.address();
  console.log(`Squeekchain Arcade on http://localhost:${typeof addr === "object" && addr ? addr.port : PORT}/ (scores in ${DATA_FILE})`);
}
