"use client";

import { useState } from "react";
import Link from "next/link";
import { checkSubject, type CheckOutcome } from "@/lib/data-source";
import { CLEAR_SCOPE } from "@/lib/contract-types";
import { displayTime, isAddress } from "@/lib/format";
import { markedSpanFor } from "@/lib/match-span";
import { VerdictStamp } from "@/components/stamp";
import { NoInferencePlate, TheRow } from "@/components/the-row";

/**
 * `check()` — the surface another contract calls, given a form so a person can
 * call it too.
 *
 * The four answers are FLAGGED, CLEAR, INCONCLUSIVE and CONTESTED, and the copy
 * for each is fixed here rather than composed per-render, because the wording of
 * a screening result is the product. In particular CLEAR is never rendered as
 * "not sanctioned": it is scoped to the untruncated portion of the file that was
 * actually read, and the blind spot is printed next to it, not in the docs.
 */
export default function CheckPage() {
  const [input, setInput] = useState("");
  const [outcome, setOutcome] = useState<CheckOutcome | undefined>();
  const [pending, setPending] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!input.trim()) return;
    setPending(true);
    setOutcome(undefined);
    try {
      setOutcome(await checkSubject(input));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="rc-flow">
      <header className="rc-flow-tight">
        <h1 className="font-display text-34 font-semibold m-0">Check a subject</h1>
        <p className="m-0">
          Reads the contract&rsquo;s <span className="rc-verbatim">check()</span> view. This is a
          free read: it consults determinations already on the record and screens nothing new.
        </p>
      </header>

      <form className="rc-flow-tight" onSubmit={submit}>
        <label className="rc-label block" htmlFor="subject">
          Wallet address or entity name
        </label>
        <input
          autoComplete="off"
          className="rc-input rc-input-verbatim"
          id="subject"
          onChange={(event) => setInput(event.target.value)}
          placeholder="0x… or GARANTEX EUROPE OU"
          spellCheck={false}
          value={input}
        />
        <p className="text-12 m-0">
          {input.trim()
            ? isAddress(input)
              ? "Read as a wallet address. Addresses are compared as lowercase hex, so checksum casing does not matter here."
              : "Read as an entity name. Names are case-folded and whitespace-collapsed before comparison."
            : "Addresses are matched byte-for-byte. Names are matched by candidate extraction, then judged."}
        </p>
        <button className="rc-btn rc-btn-filled" disabled={pending || !input.trim()} type="submit">
          {pending ? "Reading" : "Check"}
        </button>
      </form>

      {pending ? (
        <p className="rc-label m-0">
          <span className="rc-pending-bar mr-3" />
          Reading the contract
        </p>
      ) : null}

      {outcome ? <Outcome outcome={outcome} /> : null}
    </div>
  );
}

function Outcome({ outcome }: { outcome: CheckOutcome }) {
  if (outcome.kind === "unreachable") {
    return (
      <div className="rc-plate rc-plate-unstamped">
        <span className="rc-plate-title">Contract unreachable</span>
        <div className="rc-flow-tight">
          <span className="rc-void-stamp">No answer</span>
          <p className="m-0 text-13">{outcome.message}</p>
          <p className="m-0 text-13">
            <span className="font-semibold">This is not a clearance.</span> The read failed, so
            there is no result to report either way.
          </p>
        </div>
      </div>
    );
  }

  if (outcome.kind === "no-record") {
    return (
      <div className="rc-plate">
        <span className="rc-plate-title">No record</span>
        <div className="rc-flow-tight">
          <span className="rc-void-stamp">Never screened</span>
          <p className="m-0">
            The contract holds no determination for{" "}
            <span className="rc-verbatim break-all">{outcome.subject}</span>. Nobody has reported
            it, so nobody has screened it.
          </p>
          <p className="text-13 m-0">
            An absent record is not a clean record. The only thing this tells you is that the
            question has not been asked on chain yet.
          </p>
          <Link
            className="rc-btn rc-btn-filled"
            href={`/report?subject=${encodeURIComponent(outcome.subject)}`}
          >
            Report this subject
          </Link>
        </div>
      </div>
    );
  }

  const { result, determination } = outcome;
  const span = determination ? markedSpanFor(determination) : undefined;

  return (
    <div className="rc-flow">
      <div className="rc-flow-tight">
        <VerdictStamp large verdict={result.verdict} />
        <p className="m-0 break-all">
          <span className="rc-label">Subject</span>{" "}
          <span className="rc-verbatim">{result.subject}</span>
        </p>
        <p className="text-12 m-0 rc-tabular">
          Determination{" "}
          <Link className="rc-link" href={`/determinations/${result.determination_id}`}>
            {result.determination_id}
          </Link>{" "}
          · status {result.status.replace(/_/g, " ")} · screened {displayTime(result.screened_at)}
        </p>
      </div>

      <VerdictCopy outcome={outcome} />

      {determination && determination.matched_entry && span ? (
        <section className="rc-flow-tight">
          <h2 className="rc-label rc-section m-0">The row it rests on</h2>
          <TheRow
            bytes={determination.matched_entry}
            cut={span.cut}
            highlight={span.highlight}
            matchLabel={span.matchLabel}
            provenance={{
              list: determination.matched_list,
              digest: determination.source_digest,
              generated: determination.source_generated,
              fetchedAt: determination.screened_at,
            }}
          />
        </section>
      ) : null}

      {determination?.status === "LISTED" ? <NoInferencePlate /> : null}
    </div>
  );
}

/** The four answers, each in fixed words. */
function VerdictCopy({ outcome }: { outcome: Extract<CheckOutcome, { kind: "record" }> }) {
  const { result, determination } = outcome;
  const damaged = result.damaged_records;

  const blindSpot = (
    <p className="text-13 m-0 border-t border-rule pt-4">
      <span className="rc-label">Stated blind spot</span> OFAC truncates its Remarks column at
      1,000 characters. <span className="rc-tabular font-semibold">
        {damaged === undefined ? "source health unavailable" : `${damaged} records`}
      </span>{" "}in the
      current file have a digital-currency address severed by that limit, so those addresses cannot
      be matched in full by anyone, including this contract. A subject matching only the surviving
      part of one is returned INCONCLUSIVE, never CLEAR.
    </p>
  );

  switch (result.verdict) {
    case "FLAGGED":
      return (
        <div className="rc-flow-tight border-l-2 border-stamp pl-4">
          <p className="m-0">
            {determination?.status === "LISTED"
              ? "The subject appears in the published file byte-for-byte. This is arithmetic, and it is not appealable."
              : "Validators judged the subject to be the same party as a listed row. That is a reading of the evidence, and it can be appealed."}
          </p>
        </div>
      );

    case "CLEAR":
      return (
        <div className="rc-flow-tight border-l-2 border-ink pl-4">
          <p className="m-0 font-semibold">{CLEAR_SCOPE}</p>
          <p className="m-0">
            That is the entire claim, and the scope is the point. It means: on the file named below,
            as published on the date that file states, the subject did not appear in the portion the
            authority actually printed. It does not mean the subject is unsanctioned, and it says
            nothing about any list this contract did not read.
          </p>
          {blindSpot}
        </div>
      );

    case "INCONCLUSIVE":
      return (
        <div className="rc-plate rc-plate-truncated">
          <span className="rc-plate-title">Source truncated</span>
          <div className="rc-flow-tight">
            <p className="m-0">
              The subject matches every character the authority published, and the authority stopped
              printing mid-value. There is no byte after the cut to agree or disagree with.
            </p>
            <p className="m-0 font-semibold">
              Do not read this as a pass and do not read it as a hit. It is a hole in the source.
            </p>
            <p className="text-13 m-0">
              Escalate to a human, and rescreen when the file is republished.
            </p>
            {blindSpot}
          </div>
        </div>
      );

    case "CONTESTED":
      return (
        <div className="rc-flow-tight border-l-2 border-process pl-4">
          <p className="m-0">
            An appeal was heard and the validators could not agree. The contract refuses to break
            the tie, and returns the disagreement to you instead of a coin flip. Both bonds were
            returned.
          </p>
          <p className="text-13 m-0">
            Apply your own risk tolerance. That decision was never the contract&rsquo;s to make.
          </p>
        </div>
      );

    case "UNKNOWN":
      return (
        <div className="rc-flow-tight border-l-2 border-process pl-4">
          <p className="m-0 font-semibold">A determination exists, but screening has not produced an answer.</p>
          <p className="text-13 m-0">
            This is not CLEAR and it is not NOT_LISTED. Open the determination to inspect or run
            the pending permissionless screen.
          </p>
        </div>
      );
  }
}
