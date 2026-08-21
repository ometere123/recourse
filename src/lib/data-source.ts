import {
  DAMAGED_RECORD_COUNT,
  type Appeal,
  type CheckResult,
  type Determination,
  type DeterminationSummary,
  type SubjectKind,
  verdictOf,
} from "./contract-types";
import { CONTRACT_ADDRESS } from "./genlayer/config";
import * as contract from "./genlayer/contract";
import { MOCK_APPEALS, MOCK_DETERMINATIONS } from "./mock-data";
import { isAddress } from "./format";
import {
  coerceAppeal,
  coerceCheckResponse,
  coerceDetermination,
  coerceDeterminationList,
  coerceSourceHealth,
  coerceStats,
  dataModeFor,
  type ContractStats,
} from "./live-adapters";

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
export const DATA_MODE = dataModeFor(CONTRACT_ADDRESS);
export const IS_FIXTURE = DATA_MODE === "fixture";

type Raw = Record<string, unknown>;
const asDetermination = coerceDetermination;
const asAppeal = coerceAppeal;

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
  return coerceDeterminationList(rows).map(summarise);
}

export async function fetchDetermination(id: string): Promise<Determination | undefined> {
  if (IS_FIXTURE) return MOCK_DETERMINATIONS.find((d) => d.id === id);
  const raw = (await contract.getDetermination(id)) as unknown;
  if (!raw || typeof raw !== "object") return undefined;
  const parsed = asDetermination(raw as Raw);
  if (!parsed.id) throw new Error("Contract returned a determination without an id.");
  return parsed;
}

export async function fetchAppeal(id: string): Promise<Appeal | undefined> {
  if (!id) return undefined;
  if (IS_FIXTURE) return MOCK_APPEALS.find((a) => a.id === id);
  const raw = (await contract.getAppeal(id)) as unknown;
  if (!raw || typeof raw !== "object") return undefined;
  const parsed = asAppeal(raw as Raw);
  if (!parsed.id) throw new Error("Contract returned an appeal without an id.");
  return parsed;
}

/**
 * How many records in the published SDN.CSV have a digital-currency address that
 * the authority's own 1,000-character Remarks limit cut in half. Surfaced on
 * every result as a stated blind spot.
 */
export async function fetchDamagedRecordCount(): Promise<number | undefined> {
  if (IS_FIXTURE) return DAMAGED_RECORD_COUNT;
  const health = coerceSourceHealth(await contract.getSourceHealth());
  return health.observedAt ? health.unreadableRecords : undefined;
}

export async function fetchStats(): Promise<ContractStats> {
  if (IS_FIXTURE) {
    return { determinations: MOCK_DETERMINATIONS.length, appeals: MOCK_APPEALS.length, bountyPool: "0", balance: "0" };
  }
  return coerceStats(await contract.getStats());
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
  try {
    const parsed = coerceCheckResponse(raw, subject, subject_kind);
    if (parsed.kind === "no-record") return parsed;
    const { result } = parsed;
    const determination = await fetchDetermination(result.determination_id);
    return { kind: "record", result, determination };
  } catch (error) {
    return {
      kind: "unreachable",
      message: error instanceof Error ? error.message : "The contract returned an unusable response.",
    };
  }
}

/** Project a stored determination into the shape `check()` returns. */
export function toCheckResult(d: Determination): CheckResult {
  return {
    verdict: verdictOf(d.status) ?? "UNKNOWN",
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
