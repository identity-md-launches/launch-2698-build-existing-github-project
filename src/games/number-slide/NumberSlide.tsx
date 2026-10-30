import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { href } from "../../router";
import { cleanName, scoreMessage, type Submission } from "../../scores/message";
import { addLocalRun, claimLocalRun, localRuns, saveName, savedName, submitScore, scoresApiConfigured, unlockLevel, unlockedLevel } from "../../scores/store";
import { short, useWalletSheet } from "../../wallet/ConnectSheet";
import { LEVELS, fmtTime, isSolved, scoreFor, scramble, slide, tileForDirection, type Board, type Direction, type Level } from "./engine";

type Outcome = "solved" | "time" | "moves";
type Result = { level: Level; outcome: Outcome; seconds: number; moves: number; score: number; seed: number; taps: number[]; at: number };
type Phase = { kind: "pick" } | { kind: "play"; level: Level; seed: number } | { kind: "result"; result: Result };

const newSeed = () => crypto.getRandomValues(new Uint32Array(1))[0]!;

export default function NumberSlide() {
  const [phase, setPhase] = useState<Phase>({ kind: "pick" });
  const [unlocked, setUnlocked] = useState(unlockedLevel);
  const [chosen, setChosen] = useState(() => Math.min(unlockedLevel(), LEVELS.length));

  const start = (level: Level) => setPhase({ kind: "play", level, seed: newSeed() });
  const finish = (result: Result) => {
    if (result.outcome === "solved") {
      addLocalRun({ player: "local", name: savedName(), level: result.level.id, score: result.score, seconds: result.seconds, moves: result.moves, at: result.at });
      const next = Math.min(result.level.id + 1, LEVELS.length);
      unlockLevel(next);
      setUnlocked(unlockedLevel());
      setChosen(next);
    }
    setPhase({ kind: "result", result });
  };

  return (
    <div className="page game-page">
      {phase.kind === "pick" && (
        <Picker unlocked={unlocked} chosen={chosen} onChoose={setChosen} onStart={() => start(LEVELS[chosen - 1]!)} />
      )}
      {phase.kind === "play" && (
        <Play key={phase.seed} level={phase.level} seed={phase.seed} onFinish={finish} onQuit={() => setPhase({ kind: "pick" })} onRestart={() => start(phase.level)} />
      )}
      {phase.kind === "result" && (
        <Results
          result={phase.result}
          onRetry={() => start(phase.result.level)}
          onNext={phase.result.level.id < LEVELS.length ? () => start(LEVELS[phase.result.level.id]!) : undefined}
          onLevels={() => setPhase({ kind: "pick" })}
        />
      )}
    </div>
  );
}

function Picker({ unlocked, chosen, onChoose, onStart }: { unlocked: number; chosen: number; onChoose: (id: number) => void; onStart: () => void }) {
  const best = (id: number) => Math.max(0, ...localRuns().filter((r) => r.level === id).map((r) => r.score));
  const level = LEVELS[chosen - 1]!;
  return (
    <>
      <section className="game-intro">
        <h1>Number Slide</h1>
        <p className="lead">Put the tiles back in order, 1 first, with the empty cell last. Beat the clock and the move limit.</p>
        <button className="btn btn-primary btn-wide" onClick={onStart}>
          Start level {level.id}: {level.name}
        </button>
      </section>

      <section aria-labelledby="levels-title" className="block">
        <h2 id="levels-title">Choose a level</h2>
        <p className="muted">Clear a level to open the next one. Bigger boards give bigger scores.</p>
        <ol className="levels">
          {LEVELS.map((l) => {
            const locked = l.id > unlocked;
            const b = best(l.id);
            return (
              <li key={l.id}>
                <button
                  className="level"
                  aria-pressed={chosen === l.id}
                  disabled={locked}
                  onClick={() => onChoose(l.id)}
                >
                  <span className="level-num">{l.id}</span>
                  <span className="level-body">
                    <span className="level-name">{l.name}</span>
                    <span className="level-meta">
                      {l.size}×{l.size} · {l.moveLimit} moves · {fmtTime(l.timeLimit)}
                    </span>
                  </span>
                  <span className="level-best">{locked ? "Locked" : b ? `Best ${b}` : "New"}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-labelledby="how-title" className="block how">
        <h2 id="how-title">How to play</h2>
        <ul>
          <li>Tap or click a tile next to the empty cell to slide it. A tile further along the same row or column slides the whole line.</li>
          <li>On a keyboard, the arrow keys push a tile into the empty cell. On a phone, swipe on the board.</li>
          <li>Each tile that moves counts as one move. The clock starts on your first move.</li>
          <li>Score: level points, plus up to 500 for time left and up to 500 for moves left. Points are for bragging rights only.</li>
        </ul>
      </section>
    </>
  );
}

function Play({ level, seed, onFinish, onQuit, onRestart }: { level: Level; seed: number; onFinish: (r: Result) => void; onQuit: () => void; onRestart: () => void }) {
  const [board, setBoard] = useState<Board>(() => scramble(level, seed));
  const [moves, setMoves] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => performance.now());
  const taps = useRef<number[]>([]);
  const done = useRef(false);
  const swipe = useRef<{ x: number; y: number; id: number } | null>(null);
  const suppressClick = useRef(false);

  const elapsed = startedAt === null ? 0 : (now - startedAt) / 1000;
  const left = Math.max(0, level.timeLimit - elapsed);

  const end = useCallback(
    (outcome: Outcome, seconds: number, moveCount: number) => {
      if (done.current) return;
      done.current = true;
      const s = Math.max(0.1, Math.round(seconds * 10) / 10);
      onFinish({
        level, outcome, seconds: Math.min(s, level.timeLimit), moves: moveCount,
        score: outcome === "solved" ? scoreFor(level, Math.min(s, level.timeLimit), moveCount) : 0,
        seed, taps: taps.current.slice(), at: Date.now(),
      });
    },
    [level, onFinish, seed],
  );

  useEffect(() => {
    if (startedAt === null) return;
    const t = setInterval(() => setNow(performance.now()), 200);
    return () => clearInterval(t);
  }, [startedAt]);

  useEffect(() => {
    if (startedAt !== null && elapsed >= level.timeLimit) end("time", level.timeLimit, moves);
  }, [elapsed, startedAt, level.timeLimit, end, moves]);

  const tap = useCallback(
    (index: number) => {
      if (done.current || index < 0) return;
      const r = slide(board, level.size, index);
      if (!r) return;
      const t = performance.now();
      const began = startedAt ?? t;
      if (startedAt === null) setStartedAt(t);
      taps.current.push(index);
      const total = moves + r.moved;
      setBoard(r.board);
      setMoves(total);
      setNow(t);
      const seconds = (t - began) / 1000;
      if (total > level.moveLimit) end("moves", seconds, total);
      else if (isSolved(r.board)) end("solved", seconds, total);
      else if (total === level.moveLimit) end("moves", seconds, total);
    },
    [board, end, level, moves, startedAt],
  );

  useEffect(() => {
    const keys: Record<string, Direction> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
    const on = (e: KeyboardEvent) => {
      const dir = keys[e.key];
      if (!dir || (e.target as HTMLElement).closest("input, textarea, select")) return;
      e.preventDefault();
      tap(tileForDirection(board, level.size, dir));
    };
    addEventListener("keydown", on);
    return () => removeEventListener("keydown", on);
  }, [board, level.size, tap]);

  const onPointerDown = (e: ReactPointerEvent) => {
    swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    suppressClick.current = true;
    const dir: Direction = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
    tap(tileForDirection(board, level.size, dir));
  };

  const empty = board.indexOf(0);
  const movesLeft = level.moveLimit - moves;
  return (
    <section className="play" aria-labelledby="play-title">
      <div className="play-head">
        <h1 id="play-title">
          Level {level.id}: {level.name}
        </h1>
        <div className="play-actions">
          <button className="btn btn-ghost" onClick={onRestart}>
            New scramble
          </button>
          <button className="btn btn-ghost" onClick={onQuit}>
            Quit to levels
          </button>
        </div>
      </div>
      <dl className="hud">
        <div className={left <= 10 && startedAt !== null ? "warn" : ""}>
          <dt>Time left</dt>
          <dd>{fmtTime(Math.ceil(left))}</dd>
        </div>
        <div className={movesLeft <= 5 ? "warn" : ""}>
          <dt>Moves left</dt>
          <dd>
            {movesLeft}
            <span className="of"> of {level.moveLimit}</span>
          </dd>
        </div>
      </dl>
      <div
        className="board"
        style={{ ["--n" as string]: level.size }}
        role="group"
        aria-label={`${level.size} by ${level.size} sliding puzzle`}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (swipe.current = null)}
      >
        {board.map((v, i) => {
          const sameLine = i !== empty && (Math.floor(i / level.size) === Math.floor(empty / level.size) || i % level.size === empty % level.size);
          return v === 0 ? (
            <div key="empty" className="cell empty" aria-hidden="true" />
          ) : (
            <button
              key={v}
              className={`cell tile${v === i + 1 ? " home" : ""}`}
              data-movable={sameLine || undefined}
              aria-label={`Tile ${v}${sameLine ? ", can slide" : ""}`}
              onClick={() => {
                if (suppressClick.current) {
                  suppressClick.current = false;
                  return;
                }
                tap(i);
              }}
            >
              {v}
            </button>
          );
        })}
      </div>
      <p className="muted hint">{startedAt === null ? "The clock starts on your first move." : "Tiles already in place glow green."}</p>
    </section>
  );
}

type SaveState = { kind: "idle" } | { kind: "busy" } | { kind: "done"; text: string } | { kind: "error"; text: string };

function Results({ result, onRetry, onNext, onLevels }: { result: Result; onRetry: () => void; onNext?: () => void; onLevels: () => void }) {
  const solved = result.outcome === "solved";
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const title = solved ? "Level cleared" : result.outcome === "time" ? "Time ran out" : "Out of moves";
  return (
    <section className="results" aria-labelledby="results-title">
      <h1 id="results-title" ref={heading} tabIndex={-1}>
        {title}
      </h1>
      <p className="lead">
        Level {result.level.id}: {result.level.name}
        {solved ? "" : ". Try again with a fresh scramble."}
      </p>
      <dl className="stats">
        <div>
          <dt>Score</dt>
          <dd className="big">{result.score}</dd>
        </div>
        <div>
          <dt>Time</dt>
          <dd>{result.seconds.toFixed(1)}s</dd>
        </div>
        <div>
          <dt>Moves</dt>
          <dd>
            {result.moves}
            <span className="of"> of {result.level.moveLimit}</span>
          </dd>
        </div>
      </dl>
      <div className="result-actions">
        {solved && onNext && (
          <button className="btn btn-primary" onClick={onNext}>
            Play level {result.level.id + 1}
          </button>
        )}
        <button className={`btn ${solved && onNext ? "btn-ghost" : "btn-primary"}`} onClick={onRetry}>
          {solved ? "Replay this level" : "Try again"}
        </button>
        <button className="btn btn-ghost" onClick={onLevels}>
          All levels
        </button>
      </div>
      {solved && <SaveScore result={result} />}
    </section>
  );
}

function SaveScore({ result }: { result: Result }) {
  const { address, isConnected } = useAccount();
  const { openSheet } = useWalletSheet();
  const { signMessageAsync } = useSignMessage();
  const [name, setName] = useState(savedName);
  const [state, setState] = useState<SaveState>({ kind: "idle" });
  const [shared, setShared] = useState<boolean | null>(null);
  useEffect(() => {
    void scoresApiConfigured().then(setShared);
  }, []);

  const save = async () => {
    if (!address) return;
    const clean = cleanName(name);
    saveName(clean);
    setState({ kind: "busy" });
    try {
      if (!shared) {
        claimLocalRun(result.at, address);
        setState({ kind: "done", text: `Saved on this device as ${short(address)}.` });
        return;
      }
      const sub: Submission = {
        address, name: clean, game: "number-slide", level: result.level.id, seed: result.seed, taps: result.taps,
        seconds: result.seconds, moves: result.moves, score: result.score, issuedAt: Date.now(),
      };
      const signature = await signMessageAsync({ message: scoreMessage(sub) });
      const r = await submitScore(sub, signature);
      claimLocalRun(result.at, address);
      setState({ kind: "done", text: r.where === "server" ? `Saved. You are number ${r.position} on the overall board.` : "Saved on this device." });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      setState({
        kind: "error",
        text: /rejected|denied/i.test(msg) ? "Signature cancelled. Your score is still kept on this device." : `Unable to save: ${msg.split("\n")[0] || "unknown error"}. Try again.`,
      });
    }
  };

  return (
    <div className="save">
      <h2>Save to the leaderboard</h2>
      {!isConnected ? (
        <>
          <p className="muted">Your score is kept on this device. Connect a wallet to put your name on it.</p>
          <button className="btn btn-primary" onClick={openSheet}>
            Connect a wallet
          </button>
        </>
      ) : state.kind === "done" ? (
        <p className="ok" role="status">
          {state.text} <a href={href.leaderboard}>See the leaderboard</a>
        </p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label htmlFor="player-name">Display name (optional)</label>
          <div className="save-row">
            <input
              id="player-name"
              name="nickname"
              autoComplete="nickname"
              maxLength={16}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={short(address!)}
            />
            <button className="btn btn-primary" type="submit" disabled={state.kind === "busy" || shared === null}>
              {state.kind === "busy" ? "Waiting for wallet…" : shared ? "Sign and save" : "Save score"}
            </button>
          </div>
          {shared !== null && (
            <p className="muted small">
              {shared
                ? "Your wallet asks you to sign a short message. It is free and sends no transaction."
                : "No score server is set up for this copy of the site, so scores stay on this device."}
            </p>
          )}
          {state.kind === "error" && (
            <p className="err" role="alert">
              {state.text}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
