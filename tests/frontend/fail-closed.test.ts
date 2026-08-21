import assert from "node:assert/strict";
import test from "node:test";
import { ContractSchemaError, optionalFiniteNumber, requireEnum } from "../../src/lib/live-coercion.ts";

const VERDICTS = ["UNKNOWN", "CLEAR", "FLAGGED", "INCONCLUSIVE", "CONTESTED"] as const;

test("UNKNOWN remains a distinct contract result", () => {
  assert.equal(requireEnum("check result", "UNKNOWN", VERDICTS), "UNKNOWN");
});

test("an unknown verdict cannot fall back to CLEAR", () => {
  assert.throws(
    () => requireEnum("check result", "NEW_CLEANISH_STATUS", VERDICTS),
    ContractSchemaError,
  );
});

test("missing and malformed source health remain unavailable", () => {
  assert.equal(optionalFiniteNumber(undefined), undefined);
  assert.equal(optionalFiniteNumber("not-a-number"), undefined);
  assert.equal(optionalFiniteNumber("13"), 13);
});
