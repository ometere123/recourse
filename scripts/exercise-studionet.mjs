import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

function decryptKeystore(path, password) {
  const ks = JSON.parse(readFileSync(path, "utf8"));
  const c = ks.Crypto || ks.crypto;
  const k = c.kdfparams;
  const derived = crypto.scryptSync(Buffer.from(password), Buffer.from(k.salt, "hex"), k.dklen, {
    N: k.n,
    r: k.r,
    p: k.p,
    maxmem: 1024 * 1024 * 1024,
  });
  const decipher = crypto.createDecipheriv(
    "aes-128-ctr",
    derived.subarray(0, 16),
    Buffer.from(c.cipherparams.iv, "hex"),
  );
  return `0x${Buffer.concat([decipher.update(Buffer.from(c.ciphertext, "hex")), decipher.final()]).toString("hex")}`;
}

const [keystore, password] = process.argv.slice(2);
if (!keystore || !password) throw new Error("usage: node scripts/exercise-studionet.mjs <keystore> <password>");
const address = process.env.NEXT_PUBLIC_RECOURSE_CONTRACT;
if (!address) throw new Error("NEXT_PUBLIC_RECOURSE_CONTRACT is not set");
const client = createClient({
  chain: studionet,
  account: createAccount(decryptKeystore(keystore, password)),
  endpoint: process.env.NEXT_PUBLIC_GENLAYER_ENDPOINT ?? "https://studio.genlayer.com/api",
});
const hash = await client.writeContract({
  address,
  functionName: "report",
  args: ["0x098B716B8Aaf21512996dC57EB0615e2383E2f96", "ADDRESS", "https://home.treasury.gov/policy-issues/financial-sanctions/sanctions-programs-and-country-information"],
  value: 1_000_000_000_000_000n,
});
const reportReceipt = await client.waitForTransactionReceipt({ hash, status: "ACCEPTED", interval: 10000, retries: 90 });
const rows = await client.readContract({ address, functionName: "list_determinations", args: [0n, 50n] });
const determinationId = rows.at(-1)?.id;
if (!determinationId) throw new Error("report succeeded but no determination id was readable");
const screenHash = await client.writeContract({ address, functionName: "screen", args: [determinationId], value: 0n });
const screenReceipt = await client.waitForTransactionReceipt({ hash: screenHash, status: "ACCEPTED", interval: 10000, retries: 120 });
const determination = await client.readContract({ address, functionName: "get_determination", args: [determinationId] });
console.log(JSON.stringify({
  determinationId,
  report: { hash, status: reportReceipt.status_name ?? reportReceipt.status, execution: reportReceipt.consensus_data?.leader_receipt?.[0]?.execution_result },
  screen: { hash: screenHash, status: screenReceipt.status_name ?? screenReceipt.status, execution: screenReceipt.consensus_data?.leader_receipt?.[0]?.execution_result },
  determination,
}, null, 2));
