"use client";

import { createAccount, createClient } from "genlayer-js";
import { chain, CHAIN_NAME, GENLAYER_ENDPOINT } from "./config";

/** Write client backed by the browser's injected wallet. */
export async function createInjectedClient(address: `0x${string}`) {
  const provider = typeof window !== "undefined" ? window.ethereum : undefined;
  const client = createClient({ chain, endpoint: GENLAYER_ENDPOINT, account: address, provider });
  await client.connect(CHAIN_NAME);
  return client;
}

/**
 * Write client backed by a key generated in, and never leaving, this browser.
 * StudioNet has no faucet-free path for injected wallets in every browser, so
 * this is the fallback that keeps the app usable — the key is stored in
 * localStorage and the UI says so plainly.
 */
export function createGeneratedClient(privateKey: `0x${string}`) {
  const account = createAccount(privateKey);
  return createClient({ chain, endpoint: GENLAYER_ENDPOINT, account });
}

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on?: (event: string, listener: (...args: unknown[]) => void) => void;
      removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
    };
  }
}
