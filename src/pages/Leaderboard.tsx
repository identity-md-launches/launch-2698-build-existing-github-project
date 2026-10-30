import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { LEVELS, fmtTime } from "../games/number-slide/engine";
import { href } from "../router";
import { fetchBoard, type Board } from "../scores/store";
import { ConnectControl, short } from "../wallet/ConnectSheet";

type State = { kind: "loading" } | { kind: "ready"; board: Board } | { kind: "error"; text: string };

const fmtSeconds = (s: number) => (s < 60 ? `${s.toFixed(1)}s` : fmtTime(s));

export default function Leaderboard() {
  const [level, setLevel] = useState(0);
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const { address } = useAccount();

  useEffect(() => {
    let live = true;
    setState({ kind: "loading" });
    fetchBoard(level)
      .then((board) => live && setState({ kind: "ready", board }))
      .catch((e: unknown) => live && setState({ kind: "error", text: e instanceof Error ? e.message : "Unknown error" }));
    return () => {
      live = false;
    };
  }, [level, attempt]);

  const tabs = [{ id: 0, label: "Overall" }, ...LEVELS.map((l) => ({ id: l.id, label: `Level ${l.id}` }))];
  return (
    <div className="page">
      <section className="board-head" aria-labelledby="lb-title">
        <h1 id="lb-title">Leaderboard</h1>
        <p className="lead">
          Number Slide players ranked by score, then by best time.
          {level === 0 ? " Overall adds up each player's best score on every level." : ""}
        </p>
        {!address && (
          <div className="claim">
            <p className="muted">Connect a wallet to put your name on the scores you save.</p>
            <ConnectControl />
          </div>
        )}
      </section>

      <div className="tabs" role="group" aria-label="Board">
        {tabs.map((t) => (
          <button key={t.id} className="chip" aria-pressed={level === t.id} onClick={() => setLevel(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {state.kind === "ready" && state.board.source === "device" && (
        <p className="notice">This copy of the site has no score server, so this board shows scores saved in this browser only.</p>
      )}

      <div className="table-wrap" aria-live="polite" aria-busy={state.kind === "loading"}>
        {state.kind === "loading" && <p className="muted pad">Loading scores…</p>}
        {state.kind === "error" && (
          <div className="pad">
            <p className="err">Unable to load the leaderboard ({state.text}).</p>
            <button className="btn btn-ghost" onClick={() => setAttempt((a) => a + 1)}>
              Retry
            </button>
          </div>
        )}
        {state.kind === "ready" && state.board.rows.length === 0 && (
          <div className="pad empty-state">
            <p>No scores here yet. Clear a level to take the first spot.</p>
            <a className="btn btn-primary" href={href.game("number-slide")}>
              Play Number Slide
            </a>
          </div>
        )}
        {state.kind === "ready" && state.board.rows.length > 0 && (
          <table className="scores">
            <caption className="sr-only">{tabs.find((t) => t.id === level)!.label} ranking</caption>
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Player</th>
                <th scope="col" className="num">
                  Score
                </th>
                <th scope="col" className="num">
                  Best time
                </th>
                <th scope="col" className="num wide-only">
                  {level === 0 ? "Levels" : "Runs"}
                </th>
              </tr>
            </thead>
            <tbody>
              {state.board.rows.map((r, i) => {
                const you = address && r.player.toLowerCase() === address.toLowerCase();
                const who = r.player === "local" ? "This device" : short(r.player);
                return (
                  <tr key={r.player} className={you ? "you" : undefined}>
                    <td className="rank">{i + 1}</td>
                    <td>
                      <span className="who">{r.name || who}</span>
                      {r.name && <span className="addr">{who}</span>}
                      {you && <span className="you-tag">You</span>}
                    </td>
                    <td className="num">{r.score}</td>
                    <td className="num">{fmtSeconds(r.bestTime)}</td>
                    <td className="num wide-only">{level === 0 ? r.levels : r.runs}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
