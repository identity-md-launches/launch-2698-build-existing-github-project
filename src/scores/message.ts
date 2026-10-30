/**
 * The text a player signs to save a score. Built the same way in the browser and on the score
 * server, so the server can rebuild it from the submission and check the signature.
 */

export type Submission = {
  address: `0x${string}`;
  name: string;
  game: "number-slide";
  level: number;
  seed: number;
  taps: number[];
  seconds: number; // one decimal place
  moves: number;
  score: number;
  issuedAt: number; // ms since epoch
};

/** FNV-1a over the tapped cells, so the signed text stays short but still pins the exact run. */
export const tapsDigest = (taps: number[]): string => {
  let h = 0x811c9dc5;
  for (const t of taps) {
    h ^= t & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0") + "-" + taps.length;
};

export const scoreMessage = (s: Omit<Submission, "address">): string =>
  [
    "Squeekchain Arcade: save my score",
    "Scores are points only. Signing costs nothing and sends no transaction.",
    `Game: ${s.game}`,
    `Name: ${s.name || "(none)"}`,
    `Level: ${s.level}`,
    `Score: ${s.score}`,
    `Time: ${s.seconds.toFixed(1)}s`,
    `Moves: ${s.moves}`,
    `Seed: ${s.seed}`,
    `Run: ${tapsDigest(s.taps)}`,
    `Issued: ${new Date(s.issuedAt).toISOString()}`,
  ].join("\n");

export const cleanName = (n: string): string => n.replace(/[^\p{L}\p{N} _.-]/gu, "").trim().slice(0, 16);
