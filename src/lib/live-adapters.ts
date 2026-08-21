import type {
  Appeal,
  AppealStatus,
  BasisKind,
  CheckResult,
  CheckVerdict,
  Determination,
  DeterminationStatus,
  InconclusiveReason,
  MatchedList,
  SubjectKind,
} from "./contract-types.ts";
import {
  optionalFiniteNumber,
  requireDecimalString,
  requireEnum,
  requireNonNegativeInteger,
  requireRecord,
  requireString,
} from "./live-coercion.ts";

type Raw = Record<string, unknown>;

const str = (raw: Raw, key: string): string => {
  const value = raw[key];
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint") return value.toString();
  return "";
};

const num = (raw: Raw, key: string): number => optionalFiniteNumber(raw[key]) ?? 0;
const oneOf = <T extends string>(value: string, allowed: readonly T[], fallback: T): T =>
  value === "" ? fallback : requireEnum("contract field", value, allowed);

const STATUSES = [
  "PENDING", "LISTED", "NOT_LISTED", "INCONCLUSIVE", "ASSERTED", "UNDER_APPEAL",
  "UPHELD", "CONTESTED", "OVERTURNED",
] as const satisfies readonly DeterminationStatus[];
const LISTS = ["OFAC_SDN", "OFAC_ALT", "UN_CONSOLIDATED", "NONE"] as const satisfies readonly MatchedList[];
const KINDS = ["ADDRESS", "ENTITY"] as const satisfies readonly SubjectKind[];
const BASES = ["PRIMARY_LIST", "ASSERTED"] as const satisfies readonly BasisKind[];
const APPEAL_STATUSES = ["OPEN", "UPHELD", "OVERTURNED", "UNCLEAR"] as const satisfies readonly AppealStatus[];
const VERDICTS = ["CLEAR", "FLAGGED", "INCONCLUSIVE", "CONTESTED"] as const satisfies readonly CheckVerdict[];
const REASONS = [
  "SOURCE_TRUNCATED", "PARSER_DISAGREEMENT", "SOURCE_UNAVAILABLE", "IDENTITY_UNCLEAR", "MODEL_UNUSABLE",
] as const satisfies readonly InconclusiveReason[];

export function coerceDetermination(value: unknown): Determination {
  const raw = requireRecord("determination", value);
  const reason = str(raw, "inconclusive_reason") || str(raw, "reason");
  const status = requireEnum("determination status", requireString("determination status", raw.status), STATUSES);
  const contractKind = str(raw, "subject_kind");
  const entry = [
    ["ent_num", str(raw, "entry_ent_num")], ["name", str(raw, "entry_name")],
    ["program", str(raw, "entry_program")], ["symbol", str(raw, "entry_symbol")],
    ["address", str(raw, "match_kind") === "EXACT" ? str(raw, "subject") : ""],
    ["address_prefix", str(raw, "entry_prefix")],
  ].filter(([, item]) => Boolean(item)).map(([key, item]) => `${key}="${item}"`).join(" | ");
  const prefix = str(raw, "entry_prefix");
  return {
    id: requireString("determination id", raw.id),
    reporter: str(raw, "reporter"),
    subject: requireString("determination subject", raw.subject),
    subject_kind: contractKind === "NAME" ? "ENTITY" : contractKind === "EVM" ? "ADDRESS" : oneOf(contractKind, KINDS, "ADDRESS"),
    basis_kind: oneOf(str(raw, "basis_kind"), BASES, "PRIMARY_LIST"),
    basis_url: str(raw, "basis_url"),
    bond: requireDecimalString("determination bond", raw.bond),
    status,
    matched_entry: str(raw, "matched_entry") || entry,
    matched_list: oneOf(str(raw, "matched_list"), LISTS, "NONE"),
    source_digest: str(raw, "source_digest"),
    source_generated: str(raw, "source_generated"),
    inconclusive_reason: reason === "" ? "" : requireEnum("inconclusive reason", reason, REASONS),
    surviving_prefix_len: num(raw, "surviving_prefix_len") || prefix.length,
    rationale: str(raw, "rationale") || str(raw, "verdict"),
    appeal_deadline: str(raw, "appeal_deadline"),
    appeal_id: str(raw, "appeal_id"),
    screened_at: str(raw, "screened_at"),
  };
}

export function coerceAppeal(value: unknown): Appeal {
  const raw = requireRecord("appeal", value);
  const rawStatus = str(raw, "status");
  const disposition = str(raw, "disposition");
  return {
    id: requireString("appeal id", raw.id),
    determination_id: requireString("appeal determination id", raw.determination_id),
    appellant: str(raw, "appellant"), evidence_url: str(raw, "evidence_url"), grounds: str(raw, "grounds"),
    bond: requireDecimalString("appeal bond", raw.bond),
    status: rawStatus === "PENDING" ? "OPEN" : requireEnum("appeal status", disposition || rawStatus, APPEAL_STATUSES),
    verdict_rationale: str(raw, "verdict_rationale") || str(raw, "rationale"),
    evidence_digest: str(raw, "evidence_digest"), settled_at: str(raw, "settled_at"),
  };
}

export function coerceCheckResponse(value: unknown, subject: string, subjectKind: SubjectKind) {
  const row = requireRecord("check response", value);
  const rawVerdict = str(row, "verdict") || str(row, "result");
  const verdict = rawVerdict === "UNKNOWN" ? "UNKNOWN" : requireEnum("check verdict", rawVerdict, VERDICTS);
  const determination_id = str(row, "determination_id");
  if (verdict === "UNKNOWN" && !determination_id) return { kind: "no-record" as const, subject, subject_kind: subjectKind };
  if (!determination_id) throw new Error("Contract returned a verdict without a determination id.");
  const rawReason = str(row, "inconclusive_reason") || str(row, "reason");
  const result: CheckResult = {
    verdict, determination_id, subject: str(row, "subject") || subject,
    subject_kind: oneOf(
      (str(row, "subject_kind") || str(row, "shape")) === "EVM" ? "ADDRESS" : str(row, "subject_kind") || str(row, "shape"),
      KINDS,
      subjectKind,
    ),
    status: requireEnum("determination status", str(row, "status"), STATUSES),
    basis: str(row, "basis") || str(row, "note"), matched_list: oneOf(str(row, "matched_list"), LISTS, "NONE"),
    source_digest: str(row, "source_digest"), source_generated: str(row, "source_generated"),
    inconclusive_reason: rawReason === "" ? "" : requireEnum("inconclusive reason", rawReason, REASONS),
    surviving_prefix_len: num(row, "surviving_prefix_len"),
    damaged_records: optionalFiniteNumber(row.damaged_records) ?? optionalFiniteNumber(row.unreadable_records),
    screened_at: str(row, "screened_at"),
  };
  return { kind: "record" as const, result };
}

export type SourceHealth = { sourceLength: number; unreadableRecords: number; observedAt: string };
export function coerceSourceHealth(value: unknown): SourceHealth {
  const raw = requireRecord("source health", value);
  return {
    sourceLength: requireNonNegativeInteger("source health source_len", raw.source_len),
    unreadableRecords: requireNonNegativeInteger("source health unreadable_records", raw.unreadable_records),
    observedAt: requireString("source health observed_at", raw.observed_at, true),
  };
}

export function coerceDeterminationList(value: unknown): Determination[] {
  if (!Array.isArray(value)) throw new Error("Contract returned a malformed determination list.");
  return value.map((row, index) => {
    try {
      return coerceDetermination(row);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Malformed determination at index ${index}: ${message}`);
    }
  });
}

export function dataModeFor(contractAddress: string | undefined): "live" | "fixture" {
  return contractAddress ? "live" : "fixture";
}

export type ContractStats = { determinations: number; appeals: number; bountyPool: string; balance: string };
export function coerceStats(value: unknown): ContractStats {
  const raw = requireRecord("stats", value);
  return {
    determinations: requireNonNegativeInteger("stats determinations", raw.determinations),
    appeals: requireNonNegativeInteger("stats appeals", raw.appeals),
    bountyPool: requireDecimalString("stats bounty_pool", raw.bounty_pool),
    balance: requireDecimalString("stats balance", raw.balance),
  };
}
