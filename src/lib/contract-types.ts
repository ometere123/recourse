/**
 * Every shape the Recourse Intelligent Contract exposes, and nothing else.
 *
 * Two conventions from the contract side that the whole app has to respect:
 *
 * 1. `u256` values (bonds) arrive from `view` methods as decimal **strings**, not
 *    numbers and not bigints. They are 18-decimal wei amounts. Never do arithmetic
 *    on them without going through BigInt first — see `lib/format.ts`.
 * 2. Enum fields are plain `str` on the contract. They are typed as unions here so
 *    the UI cannot invent a status the contract can never emit, but any value read
 *    off-chain is still validated at the boundary (`lib/data-source.ts`) rather
 *    than trusted.
 */

/** Wei-denominated u256, delivered by the contract as a decimal string. */
export type U256String = string;

export type SubjectKind = "ADDRESS" | "ENTITY";

export type BasisKind = "PRIMARY_LIST" | "ASSERTED";

export type DeterminationStatus =
  | "PENDING"
  | "LISTED"
  | "NOT_LISTED"
  | "INCONCLUSIVE"
  | "ASSERTED"
  | "UNDER_APPEAL"
  | "UPHELD"
  | "CONTESTED"
  | "OVERTURNED";

/**
 * Why the contract declined to reach a determination.
 *
 * `SOURCE_TRUNCATED` is not a hypothetical. OFAC's SDN.CSV hard-truncates its
 * Remarks column at 1,000 characters, and because digital-currency addresses are
 * published inside Remarks, 13 records in the current file are cut mid-value.
 * If a queried address matches the surviving prefix of one of those cut values,
 * the honest answer is neither LISTED nor CLEAR: the bytes that would settle it
 * do not exist in the published file. The contract writes INCONCLUSIVE and names
 * the damage rather than guessing in either direction.
 */
export type InconclusiveReason =
  | "SOURCE_TRUNCATED"
  | "PARSER_DISAGREEMENT"
  | "SOURCE_UNAVAILABLE"
  | "IDENTITY_UNCLEAR"
  | "MODEL_UNUSABLE";

export type MatchedList = "OFAC_SDN" | "OFAC_ALT" | "UN_CONSOLIDATED" | "NONE";

export type AppealGrounds =
  | "DIFFERENT_PARTY"
  | "INVALID_ASSOCIATION"
  | "DELISTED"
  | "STALE_SOURCE";

export type AppealStatus = "OPEN" | "UPHELD" | "OVERTURNED" | "UNCLEAR";

/** `check(subject)` — the integration surface other contracts call. */
export type CheckVerdict = "UNKNOWN" | "CLEAR" | "FLAGGED" | "INCONCLUSIVE" | "CONTESTED";

/**
 * How many records in the current SDN.CSV have a digital-currency address cut
 * off by OFAC's own 1,000-character Remarks limit. Read from the contract's
 * `get_source_health()` view; this is the fallback for fixture mode. It is a
 * stated blind spot, printed on the result page, not a footnote in the docs.
 */
export const DAMAGED_RECORD_COUNT = 13;

/**
 * The scope of a CLEAR result, in one sentence, used verbatim wherever CLEAR is
 * rendered. A CLEAR result is never worded as "this address is not sanctioned":
 * the contract can only speak for the bytes the authority actually published.
 */
export const CLEAR_SCOPE =
  "Does not appear in the untruncated portion of the SDN list.";

export type Determination = {
  id: string;
  reporter: string;
  /** Normalised: lowercased 0x address, or uppercased whitespace-collapsed entity name. */
  subject: string;
  subject_kind: SubjectKind;
  basis_kind: BasisKind;
  basis_url: string;
  bond: U256String;
  status: DeterminationStatus;
  /** Captured source excerpt in fixtures; stored designation fields in live mode. */
  matched_entry: string;
  matched_list: MatchedList;
  source_digest: string;
  /** The list's own dateGenerated / publication date, parsed deterministically. */
  source_generated: string;
  /** Set only when `status` is INCONCLUSIVE. Empty string otherwise. */
  inconclusive_reason: InconclusiveReason | "";
  /**
   * For SOURCE_TRUNCATED: how many characters of the queried subject survived in
   * the published row before the authority's own limit cut it off. `0` when the
   * record is not damaged. The Row uses this to place the caret exactly.
   */
  surviving_prefix_len: number;
  rationale: string;
  appeal_deadline: string;
  appeal_id: string;
  screened_at: string;
};

export type Appeal = {
  id: string;
  determination_id: string;
  appellant: string;
  evidence_url: string;
  /** The stored, bounded ground text submitted to the contract. */
  grounds: string;
  bond: U256String;
  status: AppealStatus;
  verdict_rationale: string;
  evidence_digest: string;
  settled_at: string;
};

/** `check(subject)` result. `basis` is the matched row when there is one. */
export type CheckResult = {
  verdict: CheckVerdict;
  determination_id: string;
  subject: string;
  subject_kind: SubjectKind;
  status: DeterminationStatus;
  basis: string;
  matched_list: MatchedList;
  source_digest: string;
  source_generated: string;
  inconclusive_reason: InconclusiveReason | "";
  surviving_prefix_len: number;
  /** Source-health unreadable-record count folded in, so the blind spot travels with it. */
  damaged_records?: number;
  screened_at: string;
};

/** `list_determinations()` summary row. */
export type DeterminationSummary = {
  id: string;
  subject: string;
  subject_kind: SubjectKind;
  status: DeterminationStatus;
  matched_list: MatchedList;
  bond: U256String;
  appeal_id: string;
  appeal_deadline: string;
  screened_at: string;
};

/* ------------------------------------------------------------------------- *
 * Which determinations touched a model, and which were arithmetic.
 * This is a property of the contract's ordering discipline, not a UI opinion:
 * LISTED is reached by byte equality and returns before any prompt runs,
 * NOT_LISTED is reached when the deterministic scan extracts zero candidates,
 * and INCONCLUSIVE is reached by prefix equality against a row the authority
 * itself cut short — also pure arithmetic, and specifically a refusal to let a
 * model guess the missing bytes.
 * ------------------------------------------------------------------------- */
export function usedInference(status: DeterminationStatus): boolean {
  return (
    status === "ASSERTED" ||
    status === "UNDER_APPEAL" ||
    status === "UPHELD" ||
    status === "CONTESTED" ||
    status === "OVERTURNED"
  );
}

/**
 * The two vocabularies the contract speaks. `check()` answers integrators in
 * four words; a determination record carries the seven-state status. This is the
 * only place the mapping is written down.
 */
export function verdictOf(status: DeterminationStatus): CheckVerdict | undefined {
  switch (status) {
    case "LISTED":
    case "ASSERTED":
    case "UPHELD":
      return "FLAGGED";
    case "NOT_LISTED":
    case "OVERTURNED":
      return "CLEAR";
    case "INCONCLUSIVE":
      return "INCONCLUSIVE";
    case "CONTESTED":
    case "UNDER_APPEAL":
      return "CONTESTED";
    default:
      return undefined; // PENDING has no verdict: nothing has been screened yet.
  }
}

/** `LISTED` is structurally unappealable — enforced by the contract before any spend. */
export function isAppealable(determination: Pick<Determination, "status" | "appeal_id">): boolean {
  return determination.status === "ASSERTED" && !determination.appeal_id;
}

/** The appeal window closed and nobody has finalised it. Anyone may press the button. */
export function isExpiredUnfinalised(
  determination: Pick<Determination, "status" | "appeal_id" | "appeal_deadline">,
  now: number = Date.now(),
): boolean {
  if (determination.status !== "ASSERTED") return false;
  if (determination.appeal_id) return false;
  const deadline = Date.parse(normaliseIsoZ(determination.appeal_deadline));
  return !Number.isNaN(deadline) && deadline < now;
}

/** Contract writes ISO strings without a zone; treat naked timestamps as UTC. */
export function normaliseIsoZ(value: string): string {
  if (!value) return "";
  if (value.endsWith("Z") || value.includes("+")) return value;
  return `${value}Z`;
}

/* ------------------------------------------------------------------------- *
 * Transaction lifecycle
 * ------------------------------------------------------------------------- */

/** Every `statusName` GenLayer's `getTransaction()` can return. */
export type TxStage =
  | "UNINITIALIZED"
  | "PENDING"
  | "PROPOSING"
  | "COMMITTING"
  | "REVEALING"
  | "ACCEPTED"
  | "UNDETERMINED"
  | "FINALIZED"
  | "CANCELED"
  | "APPEAL_REVEALING"
  | "APPEAL_COMMITTING"
  | "READY_TO_FINALIZE"
  | "VALIDATORS_TIMEOUT"
  | "LEADER_TIMEOUT";

/** The six stages a healthy round walks through, in order, for the rail's ruler. */
export const TX_STAGE_ORDER: TxStage[] = [
  "PENDING",
  "PROPOSING",
  "COMMITTING",
  "REVEALING",
  "ACCEPTED",
  "FINALIZED",
];

/**
 * Consensus states that are **retryable, not failures**. A round that rotated out
 * of validators is not a determination about the subject and must never be
 * rendered like one.
 */
export const RETRYABLE_STAGES: ReadonlySet<string> = new Set([
  "UNDETERMINED",
  "VALIDATORS_TIMEOUT",
  "LEADER_TIMEOUT",
]);

export type StoredTransaction = {
  hash: `0x${string}`;
  label: string;
  functionName: string;
  createdAt: string;
  status: TxStage;
  executionResult?: string;
  executionError?: string;
  /** Which determination or appeal this write concerns, for deep-linking the rail. */
  subjectId?: string;
};

/**
 * The ten-state lifecycle from the shared section of the design system.
 * Distinct from `TxStage`: `TxStage` is what the chain reports, `WriteState` is
 * what the person in front of the form is being told.
 */
export type WriteState =
  | { kind: "idle" }
  | { kind: "validating" }
  | { kind: "wallet-pending"; method: string; cost: string }
  | { kind: "submitted"; hash: `0x${string}`; method: string }
  | { kind: "consensus-running"; hash: `0x${string}`; method: string; phase: ConsensusPhase }
  | { kind: "success"; hash: `0x${string}`; method: string; stage: TxStage }
  | { kind: "EXPECTED"; message: string; field?: string }
  | { kind: "EXTERNAL"; message: string; source: string }
  | { kind: "TRANSIENT"; message: string }
  | { kind: "LLM_ERROR"; message: string };

/** Which leg of `screen()` the round is on. Drives the named-source matrix. */
export type ConsensusPhase = "fetching-sources" | "scanning" | "judging-identity";

export type SourceState = "pending" | "checked" | "unreachable" | "not-applicable";

/** A named source row. Never render a loading row without the file name beside it. */
export type SourceRow = {
  /** Short label, e.g. `SDN.CSV`. */
  file: string;
  url: string;
  list: MatchedList;
  state: SourceState;
  detail: string;
};
