import type {
  AppealStatus,
  CheckVerdict,
  DeterminationStatus,
} from "@/lib/contract-types";

/**
 * The status word, struck like an impression from one of the two plates.
 *
 * Ink assignment is the whole argument of this design, so it is written once,
 * here, and nowhere else:
 *
 *   stamp red, solid     an adverse finding was made        LISTED · ASSERTED
 *   stamp red, dashed    the plate was inked but the source is cut short
 *                                                            INCONCLUSIVE
 *   ink, solid           screened, nothing found             NOT_LISTED
 *   ink, dashed          not yet determined                  PENDING
 *   process blue         a procedure ran and the subject won OVERTURNED
 *   both plates          two inks visibly disagreeing        CONTESTED
 *
 * Colour never carries the meaning alone: the word is the meaning, and the ink
 * only tells you which plate printed it.
 */

type Tone = "stamp" | "ink" | "process" | "contested" | "inconclusive" | "pending";

const DETERMINATION_TONE: Record<DeterminationStatus, Tone> = {
  PENDING: "pending",
  LISTED: "stamp",
  NOT_LISTED: "ink",
  INCONCLUSIVE: "inconclusive",
  ASSERTED: "stamp",
  UNDER_APPEAL: "contested",
  UPHELD: "stamp",
  CONTESTED: "contested",
  OVERTURNED: "process",
};

const APPEAL_TONE: Record<AppealStatus, Tone> = {
  OPEN: "process",
  UPHELD: "stamp",
  OVERTURNED: "process",
  UNCLEAR: "contested",
};

const VERDICT_TONE: Record<CheckVerdict, Tone> = {
  FLAGGED: "stamp",
  CLEAR: "ink",
  INCONCLUSIVE: "inconclusive",
  CONTESTED: "contested",
};

const TONE_CLASS: Record<Tone, string> = {
  stamp: "text-stamp",
  ink: "text-ink",
  process: "text-process",
  contested: "rc-stamp-contested",
  inconclusive: "rc-stamp-inconclusive",
  pending: "rc-stamp-pending",
};

function Impression({
  word,
  tone,
  large,
  note,
}: {
  word: string;
  tone: Tone;
  large?: boolean;
  note?: string;
}) {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-3 gap-y-1">
      {/* keyed on the word so React remounts — and therefore re-strikes — only
          when the determination itself changes, per the 180ms motion spec */}
      <span
        key={word}
        className={`rc-stamp ${large ? "rc-stamp-lg" : ""} ${TONE_CLASS[tone]}`}
      >
        {word.replace(/_/g, " ")}
      </span>
      {note ? <span className="text-12 tracking-[0.08em] uppercase">{note}</span> : null}
    </span>
  );
}

export function StatusStamp({
  status,
  large,
  note,
}: {
  status: DeterminationStatus;
  large?: boolean;
  note?: string;
}) {
  return <Impression word={status} tone={DETERMINATION_TONE[status]} large={large} note={note} />;
}

export function AppealStamp({ status, large }: { status: AppealStatus; large?: boolean }) {
  return <Impression word={status} tone={APPEAL_TONE[status]} large={large} />;
}

export function VerdictStamp({
  verdict,
  large,
  note,
}: {
  verdict: CheckVerdict;
  large?: boolean;
  note?: string;
}) {
  return <Impression word={verdict} tone={VERDICT_TONE[verdict]} large={large} note={note} />;
}
