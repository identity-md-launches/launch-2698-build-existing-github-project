/** Site metadata and the owner-settable runtime configuration. */

export const SITE_NAME = "Squeekchain Arcade";
export const SITE_DESCRIPTION = "Free browser puzzle games with a Squeekchain twist. Play Number Slide, beat the clock and climb the leaderboard.";

export type RuntimeConfig = {
  /** Base URL of the score server's API, for example "https://scores.example.org/api". Empty keeps scores on this device. */
  scoresApi: string;
};

let cached: Promise<RuntimeConfig> | undefined;

/** Read ./arcade.config.json beside index.html, so the owner can point a static export at a score server without rebuilding. */
export const loadConfig = (): Promise<RuntimeConfig> =>
  (cached ??= fetch("./arcade.config.json", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}))
    .then((c: Partial<RuntimeConfig>) => ({ scoresApi: typeof c.scoresApi === "string" ? c.scoresApi.replace(/\/$/, "") : "" })));
