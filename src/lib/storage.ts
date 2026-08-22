import type { StoredTransaction } from "./contract-types";

/**
 * localStorage is the only persistence in this app. There is no backend, no
 * indexer and no session store: the transaction rail is a local receipt book for
 * writes this browser submitted, and everything authoritative is re-read from
 * the contract.
 *
 * Every accessor is defensive about `window` because these run in components
 * that Next.js pre-renders on the server.
 */

const TX_KEY = "recourse.transactions.v1";
const WALLET_KEY = "recourse.generated-key.v1";
const ACK_KEY = "recourse.generated-ack.v1";

/** Drop rail entries older than this. Two hours outlives any consensus round. */
export const STALE_AFTER_MS = 2 * 60 * 60 * 1000;

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private browsing, quota, or a disabled store. The rail is a convenience;
    // losing it must never break a write that already went to the chain.
  }
}

/* ------------------------------------------------------------------------- *
 * Transaction rail
 * ------------------------------------------------------------------------- */

export function loadTransactions(): StoredTransaction[] {
  const stored = readJson<StoredTransaction[]>(TX_KEY, []);
  if (!Array.isArray(stored)) return [];
  return stored.filter(
    (tx): tx is StoredTransaction => typeof tx?.hash === "string" && tx.hash.startsWith("0x"),
  );
}

export function saveTransactions(transactions: StoredTransaction[]) {
  writeJson(TX_KEY, transactions);
}

export function addTransaction(transaction: StoredTransaction): StoredTransaction[] {
  const existing = loadTransactions().filter((tx) => tx.hash !== transaction.hash);
  const next = [transaction, ...existing].slice(0, 40);
  saveTransactions(next);
  return next;
}

export function clearTransactions() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TX_KEY);
  } catch {
    /* see writeJson */
  }
}

/* ------------------------------------------------------------------------- *
 * Legacy generated wallet
 *
 * An earlier build offered a throwaway key held in localStorage. It is gone —
 * an injected wallet is the only signer now — but removing the feature is not a
 * reason to leave a plaintext private key behind in a browser that used it, so
 * the provider purges both entries once on mount.
 * ------------------------------------------------------------------------- */

export function purgeLegacyGeneratedKey() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(WALLET_KEY);
    window.localStorage.removeItem(ACK_KEY);
  } catch {
    /* see writeJson */
  }
}
