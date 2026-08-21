"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createReadClient } from "@/lib/genlayer/read-client";
import type { TransactionHash } from "genlayer-js/types";
import { CONTRACT_ADDRESS } from "@/lib/genlayer/config";
import { normaliseIsoZ, type StoredTransaction, type TxStage } from "@/lib/contract-types";
import {
  addTransaction,
  clearTransactions,
  loadTransactions,
  saveTransactions,
  STALE_AFTER_MS,
} from "@/lib/storage";

/** Nothing further will happen to a transaction in one of these states. */
const COMPLETE: ReadonlySet<string> = new Set([
  "FINALIZED",
  "CANCELED",
  "UNDETERMINED",
  "VALIDATORS_TIMEOUT",
  "LEADER_TIMEOUT",
]);

const POLL_MS = 15000;

type TransactionValue = {
  transactions: StoredTransaction[];
  track: (transaction: StoredTransaction) => void;
  update: (
    hash: string,
    status: TxStage,
    execution?: { result?: string; error?: string },
  ) => void;
  clear: () => void;
  /** Live rounds only. Drives the "n in consensus" count in the masthead. */
  active: StoredTransaction[];
};

const TransactionContext = createContext<TransactionValue | undefined>(undefined);

export function TransactionProvider({ children }: { children: ReactNode }) {
  const [transactions, setTransactions] = useState<StoredTransaction[]>([]);
  const polling = useRef(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setTransactions(loadTransactions()));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const track = useCallback((transaction: StoredTransaction) => {
    setTransactions(addTransaction(transaction));
  }, []);

  const update = useCallback((
    hash: string,
    status: TxStage,
    execution?: { result?: string; error?: string },
  ) => {
    setTransactions((current) => {
      const next = current.map((tx) =>
        tx.hash === hash
          ? {
              ...tx,
              status,
              executionResult: execution?.result ?? tx.executionResult,
              executionError: execution?.error ?? tx.executionError,
            }
          : tx,
      );
      saveTransactions(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    clearTransactions();
    setTransactions([]);
  }, []);

  /**
   * Poll the chain for anything still in flight. Only unfinished, non-stale
   * transactions are asked about — a rail full of week-old hashes must not turn
   * into a permanent background load on the node.
   */
  useEffect(() => {
    if (!CONTRACT_ADDRESS) return;

    let cancelled = false;

    const tick = async () => {
      if (polling.current) return;
      const now = Date.now();
      const pendingHashes = loadTransactions()
        .filter((tx) => !COMPLETE.has(tx.status))
        .filter((tx) => now - Date.parse(normaliseIsoZ(tx.createdAt)) < STALE_AFTER_MS)
        .map((tx) => tx.hash);
      if (pendingHashes.length === 0) return;

      polling.current = true;
      try {
        const client = createReadClient();
        for (const hash of pendingHashes) {
          if (cancelled) return;
          try {
            const tx = await client.getTransaction({ hash: hash as TransactionHash });
            const status = (tx as { statusName?: string } | undefined)?.statusName;
            if (status) {
              const leader = tx?.consensus_data?.leader_receipt?.[0];
              update(hash, status as TxStage, {
                result: leader?.execution_result,
                error: leader?.error ?? undefined,
              });
            }
          } catch {
            // A node hiccup is not information about this transaction. Leave the
            // recorded status alone and ask again next tick.
          }
        }
      } finally {
        polling.current = false;
      }
    };

    void tick();
    const timer = window.setInterval(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [update]);

  const active = useMemo(
    () => transactions.filter((tx) => !COMPLETE.has(tx.status)),
    [transactions],
  );

  const value = useMemo<TransactionValue>(
    () => ({ transactions, track, update, clear, active }),
    [transactions, track, update, clear, active],
  );

  return <TransactionContext.Provider value={value}>{children}</TransactionContext.Provider>;
}

export function useTransactions(): TransactionValue {
  const value = useContext(TransactionContext);
  if (!value) throw new Error("useTransactions must be used inside TransactionProvider.");
  return value;
}

export { COMPLETE as COMPLETE_STATUSES };
