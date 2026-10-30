import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAccount, useConnect, useDisconnect, type Connector } from "wagmi";
import { WALLET_ICONS } from "./wallet-icons";
import { OPEN_IN, isMobileBrowser } from "./open-in";

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const svgUri = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

type SheetCtx = { openSheet: () => void };
const Ctx = createContext<SheetCtx>({ openSheet: () => {} });
export const useWalletSheet = () => useContext(Ctx);

/** Holds the sheet's open state so the header control and the results screen open the same sheet. */
export function WalletSheetProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const openSheet = useCallback(() => {
    opener.current = document.activeElement as HTMLElement | null;
    setOpen(true);
  }, []);
  const close = useCallback(() => {
    setOpen(false);
    opener.current?.focus?.();
  }, []);
  return (
    <Ctx.Provider value={{ openSheet }}>
      {children}
      {open && <Sheet onClose={close} />}
    </Ctx.Provider>
  );
}

/** The one connect control: "Connect", or the short address with a disconnect action. */
export function ConnectControl() {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { openSheet } = useWalletSheet();
  if (isConnected && address)
    return (
      <button className="btn btn-ghost connect" onClick={() => disconnect()} title={`Connected as ${address}`} aria-label={`Disconnect ${short(address)}`}>
        <span className="dot-on" aria-hidden="true" />
        {short(address)}
        <span className="connect-off">· Disconnect</span>
        <svg className="connect-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 1.5v6M4.6 3.6a5.5 5.5 0 1 0 6.8 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
    );
  return (
    <button className="btn btn-ghost connect" onClick={openSheet} aria-haspopup="dialog">
      Connect
    </button>
  );
}

function Sheet({ onClose }: { onClose: () => void }) {
  const mobile = isMobileBrowser();
  const { isConnected } = useAccount();
  const { connectors, connect, isPending, variables, error, reset } = useConnect();
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const shell = document.getElementById("shell");
    shell?.setAttribute("inert", "");
    dialog.current?.querySelector<HTMLElement>("button, a")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    addEventListener("keydown", onKey);
    return () => {
      shell?.removeAttribute("inert");
      removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  useEffect(() => {
    if (isConnected) onClose();
  }, [isConnected, onClose]);
  useEffect(() => () => reset(), [reset]);

  // EIP-6963 names each installed extension; wagmi's generic injected row is only for a browser
  // where discovery found nothing, and then it is called what it is. Extensions first, then
  // Coinbase Wallet.
  const named = connectors.some((c) => c.type === "injected" && c.id !== "injected");
  const listed = [...connectors.filter((c) => c.type === "injected"), ...connectors.filter((c) => c.type !== "injected")]
    .filter((c) => !(c.id === "injected" && named));
  const label = (c: Connector) =>
    c.id === "injected" ? "Browser wallet" : c.id === "coinbaseWalletSDK" && mobile ? "Coinbase Smart Wallet" : c.name;
  const icon = (c: Connector) => c.icon ?? (WALLET_ICONS[c.id] ? svgUri(WALLET_ICONS[c.id]!) : undefined);

  return (
    <div className="sheet-bg" onClick={onClose}>
      <div ref={dialog} className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2 id="sheet-title">Connect a wallet</h2>
          <button className="x" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="sheet-note">Your address names your scores on the leaderboard. Signing a score is free and sends no transaction.</p>
        {mobile &&
          OPEN_IN.map((w) => (
            <a key={w.id} className="row" href={w.href(location.href)}>
              <span className="ic">
                {WALLET_ICONS[w.id] && <img width={28} height={28} src={svgUri(WALLET_ICONS[w.id]!)} alt="" />}
              </span>
              <span>Open in {w.name}</span>
            </a>
          ))}
        {listed
          .filter((c) => !mobile || c.type !== "injected")
          .map((c) => {
            const src = icon(c);
            return (
              <button key={c.uid} className="row" onClick={() => connect({ connector: c })} disabled={isPending}>
                <span className="ic">{src ? <img width={28} height={28} src={src} alt="" /> : <span className="ic-blank" />}</span>
                <span>
                  {label(c)}
                  {isPending && variables?.connector === c ? " · opening…" : ""}
                </span>
              </button>
            );
          })}
        {error && !isPending && (
          <p className="sheet-error" role="status">
            {/rejected|denied/i.test(error.message) ? "Request cancelled in the wallet. Choose a wallet to try again." : "Unable to connect. Choose a wallet to try again."}
          </p>
        )}
      </div>
    </div>
  );
}
