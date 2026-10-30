import { GAMES } from "../games/registry";
import { href } from "../router";

function Preview({ cells, size }: { cells: number[]; size: number }) {
  return (
    <div className="mini" style={{ ["--n" as string]: size }} aria-hidden="true">
      {cells.map((v, i) => (
        <span key={i} className={v ? "mini-tile" : "mini-empty"}>
          {v || ""}
        </span>
      ))}
    </div>
  );
}

export default function Lobby() {
  const first = GAMES[0]!;
  return (
    <div className="page">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <h1 id="hero-title">Squeekchain Arcade</h1>
          <p className="lead">Free puzzle games in your browser. Play for points and a place on the leaderboard.</p>
          <div className="hero-actions">
            <a className="btn btn-primary" href={href.game(first.slug)}>
              Play {first.title}
            </a>
            <a className="btn btn-ghost" href={href.leaderboard}>
              View leaderboard
            </a>
          </div>
        </div>
        <a className="hero-art" href={href.game(first.slug)} aria-label={`Play ${first.title}`}>
          <Preview cells={first.preview} size={first.previewSize} />
        </a>
      </section>

      <section aria-labelledby="games-title" className="block">
        <h2 id="games-title">Games</h2>
        <ul className="games">
          {GAMES.map((g) => (
            <li key={g.slug} className="card game-card">
              <Preview cells={g.preview} size={g.previewSize} />
              <div className="card-body">
                <h3>{g.title}</h3>
                <p>{g.blurb}</p>
                <p className="muted">{g.howTo}</p>
                <a className="btn btn-primary" href={href.game(g.slug)}>
                  Play {g.title}
                </a>
              </div>
            </li>
          ))}
          <li className="card soon">
            <h3>Next cabinet</h3>
            <p className="muted">More games are on the way. Each new game gets its own tab on the leaderboard.</p>
          </li>
        </ul>
      </section>

      <section aria-labelledby="rules-title" className="block">
        <h2 id="rules-title">How the arcade works</h2>
        <ul className="rules">
          <li>
            <h3>Play without signing up</h3>
            <p>Every game runs in your browser. No wallet or account is needed to play.</p>
          </li>
          <li>
            <h3>Connect to claim scores</h3>
            <p>A connected wallet names your scores on the leaderboard. Saving asks for a free signature, never a transaction.</p>
          </li>
          <li>
            <h3>Points, not tokens</h3>
            <p>Scores are points for bragging rights. They are not tokens and carry no financial reward.</p>
          </li>
        </ul>
      </section>
    </div>
  );
}
