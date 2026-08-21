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

const address = process.env.NEXT_PUBLIC_RECOURSE_CONTRACT;
const required = [
  "report",
  "screen",
  "corroborate",
  "rescreen",
  "appeal",
  "adjudicate_appeal",
  "expire_appeal_window",
  "refresh_source_health",
  "check",
  "get_determination",
  "get_appeal",
  "list_determinations",
  "list_appeals",
  "get_source_health",
  "stats",
  "prefilter_fingerprint",
];

if (!address) {
  console.error("NEXT_PUBLIC_RECOURSE_CONTRACT is not set.");
  process.exit(1);
}

const client = createClient({
  chain: studionet,
  account: createAccount(),
  endpoint: process.env.NEXT_PUBLIC_GENLAYER_ENDPOINT ?? "https://studio.genlayer.com/api",
});
const schema = await client.getContractSchema(address);
const missing = required.filter((method) => !schema.methods?.[method]);
if (missing.length > 0) {
  console.error(`Missing methods: ${missing.join(", ")}`);
  process.exit(1);
}
console.log(`Schema verified for ${address}: ${required.length} required methods present.`);
