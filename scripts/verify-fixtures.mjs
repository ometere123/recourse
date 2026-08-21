#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = resolve(here, "..", "tests", "prefilter", "fixtures");
const manifestPath = resolve(fixtures, "manifest.json");

function fail(message) {
  console.error(`FAIL fixture integrity: ${message}`);
  process.exitCode = 1;
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch (error) {
  throw new Error(`Cannot read fixture manifest ${manifestPath}: ${error.message}`);
}

if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.captures)) {
  throw new Error("Fixture manifest has an unsupported shape");
}

for (const capture of manifest.captures) {
  if (!capture.file || !Number.isSafeInteger(capture.bytes) || !/^[0-9a-f]{64}$/.test(capture.sha256)) {
    fail(`invalid manifest entry for ${capture.file ?? "<missing file>"}`);
    continue;
  }

  let bytes;
  try {
    bytes = readFileSync(resolve(fixtures, capture.file));
  } catch (error) {
    fail(`${capture.file} cannot be read: ${error.message}`);
    continue;
  }

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (bytes.byteLength !== capture.bytes) {
    fail(`${capture.file} is ${bytes.byteLength} bytes; expected ${capture.bytes}`);
  }
  if (sha256 !== capture.sha256) {
    fail(`${capture.file} SHA-256 is ${sha256}; expected ${capture.sha256}`);
  }
  if (bytes.byteLength === capture.bytes && sha256 === capture.sha256) {
    console.log(`PASS ${capture.file}: ${bytes.byteLength} bytes, sha256 ${sha256}`);
  }
}

if (process.exitCode) process.exit(process.exitCode);
