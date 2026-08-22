import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { existsSync, readFileSync } from "node:fs";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...value] = trimmed.split("=");
    process.env[key] ??= value.join("=");
  }
}

const MIN_REPORT_BOND_WEI = 1_000_000_000_000_000n;
const RPC_GAP_MS = 4_500; // At most 13 requests/minute, below the submission limit.
const POLL_MS = 5_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isRateLimit = (error) => /429|rate.?limit|-32429|-32028/i.test(String(error?.message ?? error));

async function rpc(label, action, attempts = 6) {
  let delay = RPC_GAP_MS;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const value = await action();
      await sleep(RPC_GAP_MS);
      return value;
    } catch (error) {
      if (!isRateLimit(error) || attempt === attempts) throw error;
      console.error(`${label}: StudioNet rate limit, retry ${attempt}/${attempts} in ${delay}ms`);
      await sleep(delay);
      delay = Math.min(delay * 2, 40_000);
    }
  }
  throw new Error(`${label}: retry budget exhausted`);
}

const statusName = (tx) => tx?.statusName ?? tx?.status_name ?? tx?.status;
const executionDetails = (tx) => {
  const leader = tx?.consensus_data?.leader_receipt?.[0];
  return { result: leader?.execution_result ?? tx?.txExecutionResultName, error: leader?.error ?? null, returnValue: leader?.result };
};

async function requireFinalizedSuccess(client, hash, label, retries) {
  let transaction;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    transaction = await rpc(`${label} receipt`, () => client.getTransaction({ hash }));
    if (statusName(transaction) === "FINALIZED") break;
    if (attempt === retries) throw new Error(`${label} did not finalize after ${retries} polls`);
    await sleep(POLL_MS);
  }
  const execution = executionDetails(transaction);
  if (statusName(transaction) !== "FINALIZED") throw new Error(`${label} did not finalize (status ${statusName(transaction) ?? "missing"})`);
  if (execution.result !== "SUCCESS") {
    throw new Error(`${label} finalized without GenVM success (${execution.result ?? "MISSING"})${execution.error ? `: ${execution.error}` : ""}. Transaction: ${hash}`);
  }
  return { transaction, execution };
}

const [reportHash, screenHash, determinationId, subject, reporter] = process.argv.slice(2);
const HASH_RE = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
if (!HASH_RE.test(reportHash ?? "") || !HASH_RE.test(screenHash ?? "")) {
  throw new Error(
    "usage: node scripts/exercise-studionet.mjs <report-tx-hash> <screen-tx-hash> " +
      "<determination-id> <subject> <reporter-address>",
  );
}
if (!determinationId || !subject || !ADDRESS_RE.test(reporter ?? "")) {
  throw new Error("determination id, subject, and a 20-byte reporter address are required");
}
const address = process.env.NEXT_PUBLIC_RECOURSE_CONTRACT;
if (!address) throw new Error("NEXT_PUBLIC_RECOURSE_CONTRACT is not set");
const client = createClient({
  chain: studionet,
  account: createAccount(),
  endpoint: process.env.NEXT_PUBLIC_GENLAYER_ENDPOINT ?? "https://studio.genlayer.com/api",
});

const reportFinal = await requireFinalizedSuccess(client, reportHash, "report", 72);
const screenFinal = await requireFinalizedSuccess(client, screenHash, "screen", 108);
const determination = await rpc("get_determination final", () => client.readContract({ address, functionName: "get_determination", args: [determinationId] }));
const check = await rpc("check subject", () => client.readContract({ address, functionName: "check", args: [subject] }));
const sourceHealth = await rpc("get_source_health", () => client.readContract({ address, functionName: "get_source_health", args: [] }));
const stats = await rpc("stats", () => client.readContract({ address, functionName: "stats", args: [] }));
if (String(determination.id) !== determinationId) throw new Error("Determination read-back id mismatch");
if (String(determination.subject).toLowerCase() !== subject.toLowerCase()) throw new Error("Determination subject mismatch");
if (String(determination.reporter).toLowerCase() !== reporter.toLowerCase()) throw new Error("Determination reporter mismatch");
if (String(determination.bond) !== MIN_REPORT_BOND_WEI.toString()) throw new Error("Determination bond mismatch");
if (String(check.determination_id) !== determinationId) throw new Error("check(subject) id mismatch");
if (determination.status === "PENDING") throw new Error("screen succeeded but determination is still PENDING");

console.log(JSON.stringify({ network: "studionet", contract: address, reporter, subject, bondWei: MIN_REPORT_BOND_WEI.toString(), determinationId, report: { hash: reportHash, status: statusName(reportFinal.transaction), ...reportFinal.execution }, screen: { hash: screenHash, status: statusName(screenFinal.transaction), ...screenFinal.execution }, determination, check, sourceHealth, stats }, null, 2));
