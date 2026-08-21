import assert from "node:assert/strict";
import test from "node:test";
import {
  coerceAppeal,
  coerceCheckResponse,
  coerceDetermination,
  coerceDeterminationList,
  coerceSourceHealth,
  coerceStats,
  dataModeFor,
} from "../../src/lib/live-adapters.ts";
import {
  ContractSchemaError,
  optionalFiniteNumber,
  requireEnum,
} from "../../src/lib/live-coercion.ts";
import { inspectTransaction, requireFinalizedSuccess } from "../../src/lib/transaction-status.ts";
import { addTransaction, loadTransactions } from "../../src/lib/storage.ts";

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

const determination = {
  id: "R-1",
  reporter: "0xabc",
  subject: "0x123",
  subject_kind: "ADDRESS",
  basis_url: "",
  bond: "1000",
  status: "NOT_LISTED",
  match_kind: "NONE",
  appeal_deadline: "",
  appeal_id: "",
  screened_at: "2026-08-21T00:00:00",
};

test("production determination coercion rejects malformed required fields", () => {
  assert.equal(coerceDetermination(determination).status, "NOT_LISTED");
  assert.throws(() => coerceDetermination({ ...determination, id: "" }), ContractSchemaError);
  assert.throws(() => coerceDetermination({ ...determination, bond: "1.5" }), ContractSchemaError);
  assert.throws(() => coerceDetermination({ ...determination, status: "CLEAN" }), ContractSchemaError);
  assert.equal(coerceDetermination({ ...determination, subject_kind: "EVM" }).subject_kind, "ADDRESS");
});

test("production appeal coercion preserves PENDING as OPEN and rejects unknown states", () => {
  const appeal = {
    id: "A-1",
    determination_id: "R-1",
    appellant: "0xabc",
    evidence_url: "https://example.com",
    grounds: "DIFFERENT_PARTY",
    bond: "1000",
    status: "PENDING",
    disposition: "",
  };
  assert.equal(coerceAppeal(appeal).status, "OPEN");
  assert.throws(() => coerceAppeal({ ...appeal, status: "DONE" }), ContractSchemaError);
});

test("check semantics distinguish no record, NOT_LISTED, and malformed reads", () => {
  assert.deepEqual(
    coerceCheckResponse({ result: "UNKNOWN", determination_id: "" }, "NEW SUBJECT", "ENTITY"),
    { kind: "no-record", subject: "NEW SUBJECT", subject_kind: "ENTITY" },
  );
  const clear = coerceCheckResponse(
    { result: "CLEAR", determination_id: "R-1", status: "NOT_LISTED", subject: "0x123" },
    "0x123",
    "ADDRESS",
  );
  assert.equal(clear.kind, "record");
  if (clear.kind === "record") {
    assert.equal(clear.result.verdict, "CLEAR");
    assert.equal(clear.result.status, "NOT_LISTED");
  }
  const evm = coerceCheckResponse(
    { result: "CLEAR", determination_id: "R-1", status: "NOT_LISTED", shape: "EVM" },
    "0x123",
    "ADDRESS",
  );
  assert.equal(evm.kind, "record");
  assert.throws(() => coerceCheckResponse(undefined, "x", "ENTITY"), ContractSchemaError);
  assert.throws(
    () => coerceCheckResponse({ result: "CLEAR", status: "NOT_LISTED" }, "x", "ENTITY"),
    /without a determination id/,
  );
});

test("ACCEPTED remains active and FINALIZED success is explicit", () => {
  assert.deepEqual(inspectTransaction({ statusName: "ACCEPTED" }), {
    stage: "ACCEPTED",
    executionResult: undefined,
    executionError: undefined,
  });
  const success = {
    statusName: "FINALIZED",
    consensus_data: { leader_receipt: [{ execution_result: "SUCCESS" }] },
  };
  assert.equal(requireFinalizedSuccess(success, "0x1").executionResult, "SUCCESS");
});

test("FINALIZED rollback, error, and missing execution result all fail closed", () => {
  for (const result of ["ROLLBACK", "ERROR", undefined]) {
    const tx = {
      statusName: "FINALIZED",
      consensus_data: { leader_receipt: [{ execution_result: result, error: "boom" }] },
    };
    assert.throws(() => requireFinalizedSuccess(tx, "0x2"), /did not succeed/);
  }
  assert.equal(inspectTransaction({ statusName: "FINALIZED" }).executionResult, "MISSING");
});

test("unknown transaction status fails closed", () => {
  assert.throws(() => inspectTransaction({ statusName: "VERY_DONE" }), ContractSchemaError);
});

test("source health and stats reject missing or malformed live fields", () => {
  assert.deepEqual(
    coerceSourceHealth({ source_len: "5647099", unreadable_records: "13", observed_at: "2026-08-21" }),
    { sourceLength: 5647099, unreadableRecords: 13, observedAt: "2026-08-21" },
  );
  assert.throws(() => coerceSourceHealth({ unreadable_records: "13" }), ContractSchemaError);
  assert.deepEqual(
    coerceStats({ determinations: "2", appeals: "1", bounty_pool: "0", balance: "1000" }),
    { determinations: 2, appeals: 1, bountyPool: "0", balance: "1000" },
  );
  assert.throws(() => coerceStats({ determinations: "two" }), ContractSchemaError);
});

test("live mode is explicit and malformed list rows never disappear", () => {
  assert.equal(dataModeFor("0xabc"), "live");
  assert.equal(dataModeFor(undefined), "fixture");
  assert.throws(() => coerceDeterminationList([determination, null]), /index 1/);
});

test("persisted transaction survives a reload through the production storage helper", () => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    },
  });
  addTransaction({
    hash: "0xabc",
    label: "Report",
    functionName: "report",
    createdAt: "2026-08-21T00:00:00Z",
    status: "ACCEPTED",
  });
  assert.equal(loadTransactions()[0]?.status, "ACCEPTED");
  delete (globalThis as { window?: unknown }).window;
});
