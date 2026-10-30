import { createConfig, http } from "wagmi";
import { base } from "wagmi/chains";
import { coinbaseWallet, injected } from "wagmi/connectors";
import { SITE_NAME } from "../config";

/**
 * Wallets only identify a player and sign their score; the arcade sends no transactions and
 * calls no contracts. Base is listed because wagmi needs one chain and Coinbase Smart Wallet lives
 * there; no chain switch is ever requested.
 */
export const chain = base;

export const config = createConfig({
  chains: [chain],
  // EIP-6963 discovery lists every installed extension under its own name
  multiInjectedProviderDiscovery: true,
  connectors: [injected(), coinbaseWallet({ appName: SITE_NAME })],
  transports: { [chain.id]: http() },
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
