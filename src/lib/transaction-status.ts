import { normaliseIsoZ, type StoredTransaction, type TxStage } from "./contract-types.ts";
import { coerceTransactionStage, requireRecord } from "./live-coercion.ts";

export const TERMINAL_TRANSACTION_STAGES: ReadonlySet<TxStage> = new Set([
  "FINALIZED",
  "CANCELED",
  "UNDETERMINED",
  "VALIDATORS_TIMEOUT",
  "LEADER_TIMEOUT",
]);

export function shouldPollTransaction(
  transaction: StoredTransaction,
  nowMs: number,
  staleAfterMs: number,
): boolean {
  if (TERMINAL_TRANSACTION_STAGES.has(transaction.status)) return false;
  const createdAt = Date.parse(normaliseIsoZ(transaction.createdAt));
  return Number.isFinite(createdAt) && nowMs - createdAt < staleAfterMs;
}

export type TransactionInspection = {
  stage: TxStage;
  executionResult?: string;
  executionError?: string;
};

export function inspectTransaction(value: unknown): TransactionInspection {
  const tx = requireRecord("transaction", value);
  const stage = coerceTransactionStage(tx.statusName) as TxStage;
  const consensus = tx.consensus_data && typeof tx.consensus_data === "object"
    ? tx.consensus_data as Record<string, unknown>
    : undefined;
  const receipts = consensus?.leader_receipt;
  const leader = Array.isArray(receipts) && receipts[0] && typeof receipts[0] === "object"
    ? receipts[0] as Record<string, unknown>
    : undefined;
  const result = typeof leader?.execution_result === "string" ? leader.execution_result : undefined;
  const error = typeof leader?.error === "string" ? leader.error : undefined;
  return {
    stage,
    executionResult: stage === "FINALIZED" ? result ?? "MISSING" : result,
    executionError: error,
  };
}

export function requireFinalizedSuccess(value: unknown, hash: string): TransactionInspection {
  const inspected = inspectTransaction(value);
  if (inspected.stage !== "FINALIZED") {
    throw new Error(`Transaction did not finalize (reported ${inspected.stage}). Transaction: ${hash}`);
  }
  if (inspected.executionResult !== "SUCCESS") {
    throw new Error(
      `GenLayer contract execution did not succeed (${inspected.executionResult ?? "MISSING"})` +
        `${inspected.executionError ? `: ${inspected.executionError}` : ""}. Transaction: ${hash}`,
    );
  }
  return inspected;
}
