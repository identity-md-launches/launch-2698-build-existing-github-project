import { loadConfig } from "../config";
import type { Submission } from "./message";
import { rank, type Row, type Run } from "./rank";

/** Scores on this device and, when the owner configured one, on the shared score server. */

const RUNS_KEY = "sqa.runs.v1";
const PROGRESS_KEY = "sqa.progress.v1";
const NAME_KEY = "sqa.name.v1";

const read = <T,>(key: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode or full storage: the game still plays */
  }
};

export const localRuns = (): Run[] => read<Run[]>(RUNS_KEY, []);

export const addLocalRun = (run: Run) => write(RUNS_KEY, [...localRuns(), run].slice(-500));

/** Mark this device's unsigned runs as the wallet's, so the on-device board names them. */
export const claimLocalRun = (at: number, player: string) =>
  write(RUNS_KEY, localRuns().map((r) => (r.at === at ? { ...r, player } : r)));

/** Highest level unlocked on this device (levels open in order). */
export const unlockedLevel = (): number => read<number>(PROGRESS_KEY, 1);
export const unlockLevel = (id: number) => write(PROGRESS_KEY, Math.max(unlockedLevel(), id));

export const savedName = (): string => read<string>(NAME_KEY, "");
export const saveName = (n: string) => write(NAME_KEY, n);

export type Board = { source: "server" | "device"; rows: Row[] };

export const fetchBoard = async (level: number): Promise<Board> => {
  const { scoresApi } = await loadConfig();
  if (!scoresApi) return { source: "device", rows: rank(localRuns(), level) };
  const r = await fetch(`${scoresApi}/leaderboard?level=${level}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`Leaderboard returned ${r.status}`);
  const body = (await r.json()) as { rows: Row[] };
  return { source: "server", rows: body.rows };
};

export type SaveResult = { where: "server"; position: number } | { where: "device" };

export const submitScore = async (sub: Submission, signature: string): Promise<SaveResult> => {
  const { scoresApi } = await loadConfig();
  if (!scoresApi) return { where: "device" };
  const r = await fetch(`${scoresApi}/scores`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...sub, signature }),
  });
  const body = (await r.json().catch(() => ({}))) as { error?: string; position?: number };
  if (!r.ok) throw new Error(body.error ?? `Score server returned ${r.status}`);
  return { where: "server", position: body.position ?? 0 };
};

export const scoresApiConfigured = async () => Boolean((await loadConfig()).scoresApi);
