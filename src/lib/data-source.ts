import {
  DAMAGED_RECORD_COUNT,
  type Appeal,
  type AppealGrounds,
  type AppealStatus,
  type BasisKind,
  type CheckResult,
  type CheckVerdict,
  type Determination,
  type DeterminationStatus,
  type DeterminationSummary,
  type InconclusiveReason,
  type MatchedList,
  type SubjectKind,
  verdictOf,
} from "./contract-types";
import { CONTRACT_ADDRESS } from "./genlayer/config";
import * as contract from "./genlayer/contract";
import { MOCK_APPEALS, MOCK_DETERMINATIONS } from "./mock-data";
import { isAddress } from "./format";

/**
 * THE GATE.
 *
 * One flag decides whether the app reads the deployed Intelligent Contract or
 * the fixture set, and every screen in the app goes through the functions below.
 * Deploying the contract and setting NEXT_PUBLIC_RECOURSE_CONTRACT is therefore
 * the entire migration: no component imports mock data, and no component calls
 * genlayer-js directly for reads.
 *
 * The other job of this file is the trust boundary. Contract views return plain
 * dicts over the wire, so values are coerced into the declared shapes here
 * rather than being asserted with `as` at the point of use. A contract that
 * grows a status this UI has never heard of degrades to a printed raw value
 * instead of crashing a page.
 */
export const DATA_MODE: "live" | "fixture" = CONTRACT_ADDRESS ? "live" : "fixture";
export const IS_FIXTURE = DATA_MODE === "fixture";

/* ------------------------------------------------------------------------- *
 * Coercion helpers
 * ------------------------------------------------------------------------- */

type Raw = Record<string, unknown>;

const str = (raw: Raw, key: string): string => {
  const value = raw[key];
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint") return value.toString();
  return "";
};

const num = (raw: Raw, key: string): number => {
  const value = raw[key];
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return 0;
};

const oneOf = <T extends string>(value: string, allowed: readonly T[], fallback: T): T =>
  (allowed as readonly string[]).includes(value) ? (value as T) : fallback;

const STATUSES = [
  "PENDING",
  "LISTED",
  "NOT_LISTED",
  "INCONCLUSIVE",
  "ASSERTED",
  "UNDER_APPEAL",
  "UPHELD",
  "CONTESTED",
  "OVERTURNED",
] as const satisfies readonly DeterminationStatus[];

const LISTS = ["OFAC_SDN", "OFAC_ALT", "UN_CONSOLIDATED", "NONE"] as const satisfies
  readonly MatchedList[];

const KINDS = ["ADDRESS", "ENTITY"] as const satisfies readonly SubjectKind[];

const BASES = ["PRIMARY_LIST", "ASSERTED"] as const satisfies readonly BasisKind[];

const GROUNDS = [
  "DIFFERENT_PARTY",
  "INVALID_ASSOCIATION",
  "DELISTED",
  "STALE_SOURCE",
] as const satisfies readonly AppealGrounds[];

const APPEAL_STATUSES = ["OPEN", "UPHELD", "OVERTURNED", "UNCLEAR"] as const satisfies
  readonly AppealStatus[];

const VERDICTS = ["CLEAR", "FLAGGED", "INCONCLUSIVE", "CONTESTED"] as const satisfies
  readonly CheckVerdict[];

function asDetermination(raw: Raw): Determination {
  const reason = str(raw, "inconclusive_reason");
  const status = oneOf(str(raw, "status"), STATUSES, "PENDING");
  const contractKind = str(raw, "subject_kind");
  const entry = [
    ["ent_num", str(raw, "entry_ent_num")],
    ["name", str(raw, "entry_name")],
    ["program", str(raw, "entry_program")],
    ["symbol", str(raw, "entry_symbol")],
    ["address", str(raw, "match_kind") === "EXACT" ? str(raw, "subject") : ""],
    ["address_prefix", str(raw, "entry_prefix")],
  ]
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => `${key}="${value}"`)
    .join(" | ");
  const prefix = str(raw, "entry_prefix");
  return {
    id: str(raw, "id"),
    reporter: str(raw, "reporter"),
    subject: str(raw, "subject"),
    subject_kind: contractKind === "NAME" ? "ENTITY" : oneOf(contractKind, KINDS, "ADDRESS"),
    basis_kind: oneOf(str(raw, "basis_kind"), BASES, "PRIMARY_LIST"),
    basis_url: str(raw, "basis_url"),
    bond: str(raw, "bond"),
    status,
    matched_entry: str(raw, "matched_entry") || entry,
    matched_list: oneOf(str(raw, "matched_list"), LISTS, entry ? "OFAC_SDN" : "NONE"),
    source_digest: str(raw, "source_digest"),
    source_generated: str(raw, "source_generated"),
    inconclusive_reason:
      reason === "SOURCE_TRUNCATED" || reason === "PARSER_DISAGREEMENT" ||
      reason === "SOURCE_UNAVAILABLE" || reason === "IDENTITY_UNCLEAR" ||
      reason === "MODEL_UNUSABLE"
        ? (reason as InconclusiveReason)
        : "",
    surviving_prefix_len: num(raw, "surviving_prefix_len") || prefix.length,
    rationale: str(raw, "rationale") || str(raw, "verdict"),
    appeal_deadline: str(raw, "appeal_deadline"),
    appeal_id: str(raw, "appeal_id"),
    screened_at: str(raw, "screened_at"),
  };
}

function asAppeal(raw: Raw): Appeal {
  const rawStatus = str(raw, "status");
  const disposition = str(raw, "disposition");
  return {
    id: str(raw, "id"),
    determination_id: str(raw, "determination_id"),
    appellant: str(raw, "appellant"),
    evidence_url: str(raw, "evidence_url"),
    grounds: oneOf(str(raw, "grounds"), GROUNDS, "DIFFERENT_PARTY"),
    bond: str(raw, "bond"),
    status:
      rawStatus === "PENDING"
        ? "OPEN"
        : oneOf(disposition || rawStatus, APPEAL_STATUSES, "OPEN"),
    verdict_rationale: str(raw, "verdict_rationale") || str(raw, "rationale"),
    evidence_digest: str(raw, "evidence_digest"),
    settled_at: str(raw, "settled_at"),
  };
}

export function summarise(d: Determination): DeterminationSummary {
  return {
    id: d.id,
    subject: d.subject,
    subject_kind: d.subject_kind,
    status: d.status,
    matched_list: d.matched_list,
    bond: d.bond,
    appeal_id: d.appeal_id,
    appeal_deadline: d.appeal_deadline,
    screened_at: d.screened_at,
  };
}

/* ------------------------------------------------------------------------- *
 * Reads
 * ------------------------------------------------------------------------- */

export async function fetchDeterminations(): Promise<DeterminationSummary[]> {
  if (IS_FIXTURE) return MOCK_DETERMINATIONS.map(summarise);
  const rows = await contract.listDeterminations();
  return (rows as unknown[])
    .filter((row): row is Raw => typeof row === "object" && row !== null)
    .map((row) => summarise(asDetermination(row)));
}

export async function fetchDetermination(id: string): Promise<Determination | undefined> {
  if (IS_FIXTURE) return MOCK_DETERMINATIONS.find((d) => d.id === id);
  const raw = (await contract.getDetermination(id)) as unknown;
  if (!raw || typeof raw !== "object") return undefined;
  const parsed = asDetermination(raw as Raw);
  return parsed.id ? parsed : undefined;
}

export async function fetchAppeal(id: string): Promise<Appeal | undefined> {
  if (!id) return undefined;
  if (IS_FIXTURE) return MOCK_APPEALS.find((a) => a.id === id);
  const raw = (await contract.getAppeal(id)) as unknown;
  if (!raw || typeof raw !== "object") return undefined;
  const parsed = asAppeal(raw as Raw);
  return parsed.id ? parsed : undefined;
}

/**
 * How many records in the published SDN.CSV have a digital-currency address that
 * the authority's own 1,000-character Remarks limit cut in half. Surfaced on
 * every result as a stated blind spot.
 */
export async function fetchDamagedRecordCount(): Promise<number> {
  if (IS_FIXTURE) return DAMAGED_RECORD_COUNT;
  const value = await contract.damagedRecordCount();
  return typeof value === "number" && Number.isFinite(value) ? value : DAMAGED_RECORD_COUNT;
}

/* ------------------------------------------------------------------------- *
 * check()
 *
 * Three outcomes, not two. "We hold no record for this subject" is a different
 * fact from "we screened this subject and it did not appear", and collapsing
 * them would be the same category error as calling a truncated row CLEAR.
 * ------------------------------------------------------------------------- */

export type CheckOutcome =
  | { kind: "record"; result: CheckResult; determination?: Determination }
  | { kind: "no-record"; subject: string; subject_kind: SubjectKind }
  | { kind: "unreachable"; message: string };

export async function checkSubject(input: string): Promise<CheckOutcome> {
  const subject = input.trim();
  const subject_kind: SubjectKind = isAddress(subject) ? "ADDRESS" : "ENTITY";

  if (IS_FIXTURE) {
    const needle = subject.toLowerCase();
    const found = MOCK_DETERMINATIONS.find(
      (d) => d.subject.toLowerCase() === needle && d.status !== "PENDING",
    );
    if (!found) return { kind: "no-record", subject, subject_kind };
    return { kind: "record", result: toCheckResult(found), determination: found };
  }

  let raw: unknown;
  try {
    raw = await contract.check(subject);
  } catch (error) {
    return {
      kind: "unreachable",
      message: error instanceof Error ? error.message : "The contract could not be reached.",
    };
  }
  if (!raw || typeof raw !== "object") return { kind: "no-record", subject, subject_kind };

  const row = raw as Raw;
  const verdict = oneOf(str(row, "verdict") || str(row, "result"), VERDICTS, "CLEAR");
  const determination_id = str(row, "determination_id");
  if (!determination_id) return { kind: "no-record", subject, subject_kind };

  const result: CheckResult = {
    verdict,
    determination_id,
    subject: str(row, "subject") || subject,
    subject_kind: oneOf(str(row, "subject_kind"), KINDS, subject_kind),
    status: oneOf(str(row, "status"), STATUSES, "PENDING"),
    basis: str(row, "basis") || str(row, "note"),
    matched_list: oneOf(str(row, "matched_list"), LISTS, "NONE"),
    source_digest: str(row, "source_digest"),
    source_generated: str(row, "source_generated"),
    inconclusive_reason: str(row, "inconclusive_reason") as CheckResult["inconclusive_reason"],
    surviving_prefix_len: num(row, "surviving_prefix_len"),
    damaged_records: num(row, "damaged_records") || num(row, "unreadable_records") || DAMAGED_RECORD_COUNT,
    screened_at: str(row, "screened_at"),
  };
  const determination = await fetchDetermination(determination_id);
  return { kind: "record", result, determination };
}

/** Project a stored determination into the shape `check()` returns. */
export function toCheckResult(d: Determination): CheckResult {
  return {
    verdict: verdictOf(d.status) ?? "CLEAR",
    determination_id: d.id,
    subject: d.subject,
    subject_kind: d.subject_kind,
    status: d.status,
    basis: d.matched_entry,
    matched_list: d.matched_list,
    source_digest: d.source_digest,
    source_generated: d.source_generated,
    inconclusive_reason: d.inconclusive_reason,
    surviving_prefix_len: d.surviving_prefix_len,
    damaged_records: DAMAGED_RECORD_COUNT,
    screened_at: d.screened_at,
  };
}
