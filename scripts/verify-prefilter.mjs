#!/usr/bin/env node
/**
 * Drift guard for the pre-filter embedded in contracts/Recourse.py.
 *
 * A GenLayer contract is a single module and cannot import a sibling file, so the
 * deterministic screening logic is developed and tested outside the contract and spliced
 * in verbatim. That splice is the weak point: nothing in the language stops someone from
 * editing the embedded copy in place, and a tested module sitting next to an untested copy
 * of itself that quietly disagrees is worse than having neither.
 *
 * This compares the region between the BEGIN/END banners in the contract against the
 * tested original, line by line, and exits non-zero on any difference.
 *
 *   node scripts/verify-prefilter.mjs
 *
 * For behavioural rather than textual equivalence — running the 52-test suite against the
 * copy that is actually inside the contract — see scripts/verify_embedded_prefilter.py.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const CONTRACT = resolve(here, "..", "contracts", "Recourse.py");
const ORIGINAL = resolve(here, "..", "tests", "prefilter", "prefilter.py");

const BEGIN = "# BEGIN embedded deterministic pre-filter";
const END = "# END embedded deterministic pre-filter";
const RULE = "# ====";

function fail(message) {
  console.error(`\n  FAIL  ${message}\n`);
  process.exit(1);
}

function read(path, label) {
  try {
    return readFileSync(path, "utf8").split("\n");
  } catch {
    return fail(`cannot read the ${label} at ${path}`);
  }
}

/** The spliced region: everything after the BEGIN banner's closing rule, up to END. */
function embeddedRegion(lines) {
  const begin = lines.findIndex((l) => l.startsWith(BEGIN));
  const end = lines.findIndex((l) => l.startsWith(END));
  if (begin < 0) fail(`the contract has no "${BEGIN}" banner`);
  if (end < 0) fail(`the contract has no "${END}" banner`);
  if (end < begin) fail("the END banner appears before the BEGIN banner");

  let rule = -1;
  for (let i = begin + 1; i < end; i += 1) {
    if (lines[i].startsWith(RULE)) {
      rule = i;
      break;
    }
  }
  if (rule < 0) fail("the BEGIN banner has no closing rule line");

  // The END banner opens with its own rule line, which sits inside the slice. Back over
  // any trailing rule or bare-comment lines so the region is code and nothing else.
  let stop = end;
  while (stop > rule + 1 && /^#\s*(={4,})?\s*$/.test(lines[stop - 1])) stop -= 1;
  return lines.slice(rule + 1, stop);
}

/** The original, minus its module docstring — the only thing the splice drops. */
function originalBody(lines) {
  if (!lines[0].startsWith('"""')) fail("the original does not open with a module docstring");
  let close = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trimEnd().endsWith('"""')) {
      close = i;
      break;
    }
  }
  if (close < 0) fail("the original's module docstring is unterminated");
  return lines.slice(close + 1);
}

/** Blank lines at either end are splice artefacts, not content. */
function trimBlank(lines) {
  let lo = 0;
  let hi = lines.length;
  while (lo < hi && lines[lo].trim() === "") lo += 1;
  while (hi > lo && lines[hi - 1].trim() === "") hi -= 1;
  return lines.slice(lo, hi);
}

const embedded = trimBlank(embeddedRegion(read(CONTRACT, "contract")));
const original = trimBlank(originalBody(read(ORIGINAL, "tested original")));

// A count mismatch is reported alongside the first differing line rather than instead of
// it, because "one line shorter" is a much less useful message than "line 214 changed".
const limit = Math.min(embedded.length, original.length);
for (let i = 0; i < limit; i += 1) {
  if (embedded[i] !== original[i]) {
    console.error(`\n  Divergence at line ${i + 1} of the spliced region:`);
    console.error(`    tested original : ${JSON.stringify(original[i])}`);
    console.error(`    embedded copy   : ${JSON.stringify(embedded[i])}`);
    fail(
      "contracts/Recourse.py no longer contains the tested pre-filter.\n" +
      "        Edit tests/prefilter/prefilter.py, re-run its tests, then re-splice.\n" +
        "        Never edit the embedded copy directly."
    );
  }
}

if (embedded.length !== original.length) {
  fail(
    `the spliced region is ${embedded.length} lines but the tested original is ` +
      `${original.length}. The first ${limit} lines match, so the splice is truncated ` +
      `or has trailing additions.`
  );
}

// Structural facts the contract publishes through prefilter_fingerprint(). Kept in sync
// here so a real change to the pre-filter has to be acknowledged in two places.
const defs = original.filter((l) => l.startsWith("def ")).length;
const declared = readFileSync(CONTRACT, "utf8").match(
  /^PREFILTER_FUNCTION_COUNT\s*=\s*(\d+)/m
);
if (!declared) fail("the contract does not declare PREFILTER_FUNCTION_COUNT");
if (Number(declared[1]) !== defs) {
  fail(
    `PREFILTER_FUNCTION_COUNT is ${declared[1]} but the pre-filter defines ${defs} ` +
      `top-level functions. Update the constant and prefilter_fingerprint()'s expectations.`
  );
}

const bytes = Buffer.byteLength(embedded.join("\n"), "utf8");
console.log(
  `  OK  embedded pre-filter matches the tested original: ` +
    `${original.length} lines, ${defs} functions, ${bytes} bytes.`
);
