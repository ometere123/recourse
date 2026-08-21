import { TransactionStatus } from "genlayer-js/types";
import type { CalldataEncodable, GenLayerClient, TransactionHash } from "genlayer-js/types";
import { CONTRACT_ADDRESS, REQUIRED_METHODS } from "./config";
import { createReadClient } from "./read-client";
import type {
  Appeal,
  CheckResult,
  Determination,
  DeterminationSummary,
} from "../contract-types";

type Client = GenLayerClient<typeof import("./config").chain>;

/* ------------------------------------------------------------------------- *
 * Views
 * ------------------------------------------------------------------------- */

export async function verifyContractSchema() {
  if (!CONTRACT_ADDRESS) return { ok: false, missing: REQUIRED_METHODS, configured: false };
  const address = CONTRACT_ADDRESS;
  const client = createReadClient();
  const schema = await client.getContractSchema(address) as { methods: Record<string, unknown> };
  const missing = REQUIRED_METHODS.filter((method) => !schema.methods[method]);
  return { ok: missing.length === 0, missing, configured: true };
}

/**
 * `check(subject)` — the fail-closed integration surface. A subject with no
 * record is a successful read that comes back UNKNOWN; transport or execution
 * failure throws and must remain unavailable at the UI boundary.
 */
export async function check(subject: string): Promise<CheckResult> {
  if (!CONTRACT_ADDRESS) throw new Error("No deployed contract address is configured.");
  const address = CONTRACT_ADDRESS;
  const client = createReadClient();
  return client.readContract({ address, functionName: "check", args: [subject] }) as Promise<CheckResult>;
}

export async function getDetermination(id: string): Promise<Determination | undefined> {
  if (!CONTRACT_ADDRESS) return undefined;
  const address = CONTRACT_ADDRESS;
  const client = createReadClient();
  return readOptional<Determination>(() =>
    client.readContract({ address, functionName: "get_determination", args: [id] }),
  );
}

export async function getAppeal(id: string): Promise<Appeal | undefined> {
  if (!CONTRACT_ADDRESS) return undefined;
  const address = CONTRACT_ADDRESS;
  const client = createReadClient();
  return readOptional<Appeal>(() =>
    client.readContract({ address, functionName: "get_appeal", args: [id] }),
  );
}

export async function listDeterminations(): Promise<DeterminationSummary[]> {
  if (!CONTRACT_ADDRESS) return [];
  const address = CONTRACT_ADDRESS;
  const client = createReadClient();
  return client.readContract({
    address,
    functionName: "list_determinations",
    args: [0, 50],
  }) as Promise<DeterminationSummary[]>;
}

/**
 * `get_source_health()` — how many records in the current SDN.CSV have a
 * digital-currency address severed by OFAC's own 1,000-character Remarks limit.
 * The contract counts them while parsing, so the blind spot is measured rather
 * than asserted.
 */
export async function damagedRecordCount(): Promise<number | undefined> {
  if (!CONTRACT_ADDRESS) return undefined;
  const address = CONTRACT_ADDRESS;
  const client = createReadClient();
  const health = await client.readContract({
    address,
    functionName: "get_source_health",
    args: [],
  }) as { unreadable_records?: number | string; observed_at?: string };
  if (!health.observed_at) return undefined;
  const value = health?.unreadable_records;
  if (value === undefined) return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/* ------------------------------------------------------------------------- *
 * Writes
 * ------------------------------------------------------------------------- */

export async function writeContract(
  client: Client,
  functionName: string,
  args: CalldataEncodable[],
  value: bigint,
) {
  if (!CONTRACT_ADDRESS) throw new Error("No deployed contract address is configured.");
  const hash = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args,
    value,
    consensusMaxRotations: 3,
  });
  return hash as TransactionHash;
}

/**
 * Wait for finalization, then re-read the transaction and inspect the leader
 * receipt's `execution_result`. A GenLayer transaction can finalize while the
 * contract call inside it reverted; the receipt alone does not tell you that.
 */
export async function waitAccepted(client: Client, hash: TransactionHash) {
  const receipt = await client.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.FINALIZED,
    interval: 5000,
    retries: 90,
  });
  const finalized = await client.getTransaction({ hash });
  const result = finalized?.consensus_data?.leader_receipt?.[0]?.execution_result;
  if (result !== "SUCCESS") {
    const error = finalized?.consensus_data?.leader_receipt?.[0]?.error;
    throw new Error(
      `GenLayer contract execution did not succeed (${result ?? "MISSING"})` +
        `${error ? `: ${error}` : ""}. Transaction: ${hash}`,
    );
  }
  return receipt;
}

/* ------------------------------------------------------------------------- *
 * Read error handling
 * ------------------------------------------------------------------------- */

/**
 * Swallow the read failures that are expected on a live node and mean "no
 * record" or "back off", and rethrow anything else. A missing determination id
 * surfaces as `execution failed` from the contract's own guard, which is a
 * fact about the argument rather than a fault, so it must not become a red
 * error banner.
 */
async function readOptional<T>(read: () => Promise<unknown>): Promise<T | undefined> {
  try {
    return (await read()) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const lower = message.toLowerCase();
    if (
      lower.includes("unknown determination") ||
      lower.includes("unknown appeal") ||
      lower.includes("no determination exists")
    ) {
      return undefined;
    }
    throw error;
  }
}
