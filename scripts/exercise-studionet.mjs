import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

const MIN_REPORT_BOND_WEI = 1_000_000_000_000_000n;
const BASIS_URL = "https://home.treasury.gov/policy-issues/financial-sanctions/sanctions-programs-and-country-information";

function decryptKeystore(path, password) {
  const ks = JSON.parse(readFileSync(path, "utf8"));
  const c = ks.Crypto || ks.crypto;
  const k = c.kdfparams;
  const derived = crypto.scryptSync(Buffer.from(password), Buffer.from(k.salt, "hex"), k.dklen, { N: k.n, r: k.r, p: k.p, maxmem: 1024 * 1024 * 1024 });
  const decipher = crypto.createDecipheriv("aes-128-ctr", derived.subarray(0, 16), Buffer.from(c.cipherparams.iv, "hex"));
  return `0x${Buffer.concat([decipher.update(Buffer.from(c.ciphertext, "hex")), decipher.final()]).toString("hex")}`;
}

const statusName = (tx) => tx?.statusName ?? tx?.status_name ?? tx?.status;
const executionDetails = (tx) => {
  const leader = tx?.consensus_data?.leader_receipt?.[0];
  return { result: leader?.execution_result ?? tx?.txExecutionResultName, error: leader?.error ?? null, returnValue: leader?.result };
};

async function requireFinalizedSuccess(client, hash, label, retries) {
  await client.waitForTransactionReceipt({ hash, status: "FINALIZED", interval: 10_000, retries, fullTransaction: true });
  const transaction = await client.getTransaction({ hash });
  const execution = executionDetails(transaction);
  if (statusName(transaction) !== "FINALIZED") throw new Error(`${label} did not finalize (status ${statusName(transaction) ?? "missing"})`);
  if (execution.result !== "SUCCESS") {
    throw new Error(`${label} finalized without GenVM success (${execution.result ?? "MISSING"})${execution.error ? `: ${execution.error}` : ""}. Transaction: ${hash}`);
  }
  return { transaction, execution };
}

async function listAll(client, address) {
  const rows = [];
  for (let offset = 0; ; offset += 50) {
    const page = await client.readContract({ address, functionName: "list_determinations", args: [BigInt(offset), 50n] });
    if (!Array.isArray(page)) throw new Error("list_determinations returned a malformed page");
    rows.push(...page);
    if (page.length < 50) return rows;
  }
}

const [keystore, password] = process.argv.slice(2);
if (!keystore || !password) throw new Error("usage: node scripts/exercise-studionet.mjs <keystore> <password>");
const address = process.env.NEXT_PUBLIC_RECOURSE_CONTRACT;
if (!address) throw new Error("NEXT_PUBLIC_RECOURSE_CONTRACT is not set");
const account = createAccount(decryptKeystore(keystore, password));
const client = createClient({ chain: studionet, account, endpoint: process.env.NEXT_PUBLIC_GENLAYER_ENDPOINT ?? "https://studio.genlayer.com/api" });

// The default random address is unique to this proof run and targets the deterministic negative path.
// Set RECOURSE_PROOF_SUBJECT to an independently verified listed address for an exact-positive proof.
const subject = (process.env.RECOURSE_PROOF_SUBJECT ?? `0x${crypto.randomBytes(20).toString("hex")}`).toLowerCase();
const baselineIds = new Set((await listAll(client, address)).map((row) => String(row.id)));

const reportHash = await client.writeContract({ address, functionName: "report", args: [subject, "ADDRESS", BASIS_URL], value: MIN_REPORT_BOND_WEI });
const reportFinal = await requireFinalizedSuccess(client, reportHash, "report", 120);

const newRows = (await listAll(client, address)).filter((row) => !baselineIds.has(String(row.id)));
const candidates = [];
for (const row of newRows) {
  const d = await client.readContract({ address, functionName: "get_determination", args: [String(row.id)] });
  if (String(d.subject).toLowerCase() === subject && String(d.reporter).toLowerCase() === account.address.toLowerCase() && String(d.bond) === MIN_REPORT_BOND_WEI.toString() && d.status === "PENDING") candidates.push(d);
}
if (candidates.length !== 1) throw new Error(`Could not identify exactly one determination created by report; found ${candidates.length}`);
const determinationId = String(candidates[0].id);

const screenHash = await client.writeContract({ address, functionName: "screen", args: [determinationId], value: 0n });
const screenFinal = await requireFinalizedSuccess(client, screenHash, "screen", 180);
const [determination, check, sourceHealth, stats] = await Promise.all([
  client.readContract({ address, functionName: "get_determination", args: [determinationId] }),
  client.readContract({ address, functionName: "check", args: [subject] }),
  client.readContract({ address, functionName: "get_source_health", args: [] }),
  client.readContract({ address, functionName: "stats", args: [] }),
]);
if (String(determination.id) !== determinationId) throw new Error("Determination read-back id mismatch");
if (String(determination.subject).toLowerCase() !== subject) throw new Error("Determination subject mismatch");
if (String(check.determination_id) !== determinationId) throw new Error("check(subject) id mismatch");
if (determination.status === "PENDING") throw new Error("screen succeeded but determination is still PENDING");

console.log(JSON.stringify({ network: "studionet", contract: address, reporter: account.address, subject, subjectKind: "ADDRESS", expectedPath: process.env.RECOURSE_PROOF_SUBJECT ? "caller-specified" : "deterministic-negative", bondWei: MIN_REPORT_BOND_WEI.toString(), determinationId, report: { hash: reportHash, status: statusName(reportFinal.transaction), ...reportFinal.execution }, screen: { hash: screenHash, status: statusName(screenFinal.transaction), ...screenFinal.execution }, determination, check, sourceHealth, stats }, null, 2));
