import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const deployment = JSON.parse(readFileSync(resolve(root, "DEPLOYMENT.json"), "utf8"));
const source = readFileSync(resolve(root, deployment.contractFile));
const actual = createHash("sha256").update(source).digest("hex");
if (actual !== deployment.contractSha256) {
  console.error(`FAIL contract SHA drift: DEPLOYMENT.json=${deployment.contractSha256} current=${actual}`);
  process.exit(1);
}
console.log(`OK contract source matches DEPLOYMENT.json SHA-256 ${actual}`);
if (!deployment.deployedSourceVerified) {
  console.log("NOTE explorer source parity is unverified; this guard proves repository/deployment-record drift only.");
}
