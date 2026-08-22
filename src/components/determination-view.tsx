import Link from "next/link";
import {
  CLEAR_SCOPE,
  usedInference,
  type Appeal,
  type Determination,
  type DeterminationStatus,
} from "@/lib/contract-types";
import { displayTime, formatGen, humaniseEnum, shortenAddress } from "@/lib/format";
import { markedSpanFor } from "@/lib/match-span";
import { NoInferencePlate, ProvenanceRail, TheRow } from "./the-row";
import { StatusStamp, AppealStamp } from "./stamp";

/**
 * A determination, printed as a determination: the stamp, the row it rests on,
 * the reasoning, and the record of who paid what. Nothing on this page is a
 * score, a percentage or a gauge, because none of those things is what the
 * contract wrote.
 */

export function DeterminationView({
  determination: d,
  appeal,
  damagedRecords,
  actions,
}: {
  determination: Determination;
  appeal?: Appeal;
  damagedRecords?: number;
  actions?: React.ReactNode;
}) {
  const span = markedSpanFor(d);

  return (
    <article className="rc-flow">
      <header className="rc-flow-tight">
        <p className="rc-label m-0">
          Determination <span className="rc-verbatim normal-case">{d.id}</span>
        </p>
        <h1 className="font-display text-34 font-semibold m-0 break-all">
          {d.subject_kind === "ADDRESS" ? (
            <span className="rc-verbatim text-26 leading-8">{d.subject}</span>
          ) : (
            d.subject
          )}
        </h1>
        <p className="text-13 m-0">
          {d.subject_kind === "ADDRESS"
            ? "Wallet address, compared as lowercase hex."
            : "Named legal entity, compared as case-folded and whitespace-collapsed text."}
        </p>
        <div className="pt-2">
          <StatusStamp status={d.status} large />
        </div>
      </header>

      <Disposition determination={d} damagedRecords={damagedRecords} />

      {d.matched_entry && span ? (
        <section className="rc-flow-tight">
          <h2 className="rc-label rc-section m-0">The designation record</h2>
          <TheRow
            bytes={d.matched_entry}
            cut={span.cut}
            highlight={span.highlight}
            matchLabel={span.matchLabel}
            provenance={{
              list: d.matched_list,
              digest: d.source_digest,
              generated: d.source_generated,
              fetchedAt: d.screened_at,
            }}
          />
        </section>
      ) : null}

      {d.status === "LISTED" ? <NoInferencePlate /> : null}

      {d.rationale ? (
        <section className="rc-flow-tight">
          <h2 className="rc-label rc-section m-0">
            {usedInference(d.status) ? "What the validators were asked, and answered" : "Reasoning"}
          </h2>
          <p className="m-0">{d.rationale}</p>
          {usedInference(d.status) ? (
            <p className="text-13 m-0">
              This is a judgment, not a lookup. It is recorded so it can be read, argued with, and
              appealed.
            </p>
          ) : null}
        </section>
      ) : null}

      {!d.matched_entry && d.status !== "PENDING" ? (
        <section className="rc-flow-tight">
          <h2 className="rc-label rc-section m-0">Sources consulted</h2>
          <ProvenanceRail
            provenance={{
              list: d.matched_list,
              digest: d.source_digest,
              generated: d.source_generated,
              fetchedAt: d.screened_at,
            }}
          />
        </section>
      ) : null}

      <Record determination={d} />

      {appeal ? <AppealRecord appeal={appeal} /> : null}

      {actions ? (
        <section className="rc-flow-tight">
          <h2 className="rc-label rc-section m-0">What can be done next</h2>
          {actions}
        </section>
      ) : null}
    </article>
  );
}

/* ------------------------------------------------------------------------- *
 * Disposition — what this status means, in one paragraph, every time.
 * ------------------------------------------------------------------------- */

function Disposition({
  determination: d,
  damagedRecords,
}: {
  determination: Determination;
  damagedRecords?: number;
}) {
  const blindSpot = (
    <p className="text-13 m-0">
      <span className="rc-label">Stated blind spot</span> OFAC truncates its Remarks column at
      1,000 characters, and{" "}
      <span className="rc-tabular font-semibold">
        {damagedRecords === undefined ? "source health unavailable" : `${damagedRecords} records`}
      </span>{" "}in the current file
      have a digital-currency address cut mid-value as a result. A subject matching only the
      surviving part of one of those values is recorded INCONCLUSIVE, never clear.
    </p>
  );

  switch (d.status) {
    case "LISTED":
      return (
        <Body>
          <p className="m-0">
            The subject appears in the published file by exact normalized string equality. The
            contract stores the matched designation identifiers below. This determination is
            arithmetic and it is not appealable: there is no identity judgment to contest.
          </p>
        </Body>
      );

    case "NOT_LISTED":
      return (
        <Body>
          <p className="m-0 font-semibold">{CLEAR_SCOPE}</p>
          <p className="m-0">
            That is the whole of the claim. The contract compared the subject against the files
            named below, as published on the date they state, and found nothing. It is not a
            statement that the subject is unsanctioned, not a statement about any other list, and
            not a statement about tomorrow&rsquo;s file.
          </p>
          {blindSpot}
        </Body>
      );

    case "INCONCLUSIVE":
      return (
        <div className="rc-plate rc-plate-truncated">
          <span className="rc-plate-title">Source truncated</span>
          <div className="rc-flow-tight">
            <p className="m-0">
              The question cannot be answered from the published bytes. The subject matches
              everything the authority printed, and the authority stopped printing mid-value. That
              is neither a match nor a clearance, and this contract will not resolve it by
              guessing.
            </p>
            <p className="text-13 m-0">
              Treat it as unresolved and escalate by hand. Rescreen once the authority republishes
              the file; if the record is repaired, the next screen will settle it.
            </p>
            {blindSpot}
          </div>
        </div>
      );

    case "ASSERTED":
      return (
        <Body>
          <p className="m-0">
            Validators judged the subject to be the same party as the row below. The subject does
            not appear byte-for-byte in the file, so this rests on a reading of the evidence, and
            a reading can be wrong.{" "}
            <span className="font-semibold">This determination is appealable.</span>
          </p>
        </Body>
      );

    case "UNDER_APPEAL":
      return (
        <Body>
          <p className="m-0">
            An appeal is open against this judgment. The original finding remains visible while
            validators review the submitted evidence.
          </p>
        </Body>
      );

    case "UPHELD":
      return (
        <Body>
          <p className="m-0">
            The appeal was heard and the original judgment was upheld. The appeal record below is
            the evidence trail for that decision.
          </p>
        </Body>
      );

    case "CONTESTED":
      return (
        <Body>
          <p className="m-0">
            The appeal was heard and the validators could not agree. This is a terminal state and
            it is the honest one: both bonds were returned, and the record says the question is
            open rather than picking a side.
          </p>
          <p className="text-13 m-0">
            An integrator reading <span className="rc-verbatim">check()</span> receives CONTESTED
            and applies its own risk tolerance, which is where that decision belongs.
          </p>
        </Body>
      );

    case "OVERTURNED":
      return (
        <Body>
          <p className="m-0">
            This determination was appealed and withdrawn. The row below is what was originally
            matched; the appeal established that it does not describe this subject. The
            reporter&rsquo;s bond was transferred to the appellant.
          </p>
          <p className="m-0 font-semibold">{CLEAR_SCOPE}</p>
          {blindSpot}
        </Body>
      );

    case "PENDING":
      return (
        <Body>
          <p className="m-0">
            Reported and bonded, but not screened. No file has been fetched and nothing has been
            determined about this subject. Screening is permissionless: anyone can run it, and the
            button is below.
          </p>
        </Body>
      );
  }
}

function Body({ children }: { children: React.ReactNode }) {
  return <div className="rc-flow-tight border-l-2 border-ink pl-4">{children}</div>;
}

/* ------------------------------------------------------------------------- *
 * The paper trail
 * ------------------------------------------------------------------------- */

function Record({ determination: d }: { determination: Determination }) {
  return (
    <section className="rc-flow-tight">
      <h2 className="rc-label rc-section m-0">Record</h2>
      <dl className="rc-flow-tight m-0">
        <Field term="Reporter">
          <span className="rc-verbatim">{shortenAddress(d.reporter, 12, 10)}</span>
        </Field>
        <Field term="Bond posted">
          <span className="rc-tabular">{formatGen(d.bond)} GEN</span>
          {d.status === "NOT_LISTED" ? (
            <span className="text-13">, slashed to the bounty pool</span>
          ) : null}
          {d.status === "OVERTURNED" ? (
            <span className="text-13">, transferred to the appellant</span>
          ) : null}
        </Field>
        <Field term="Basis">
          {humaniseEnum(d.basis_kind)}
          {d.basis_url ? (
            <>
              {" · "}
              <a className="rc-link break-all" href={d.basis_url} rel="noreferrer noopener">
                {d.basis_url}
              </a>
            </>
          ) : null}
        </Field>
        <Field term="Screened">
          <span className="rc-tabular">{displayTime(d.screened_at)}</span>
        </Field>
        {d.appeal_deadline ? (
          <Field term="Appeal window">
            <span className="rc-tabular">closes {displayTime(d.appeal_deadline)}</span>
          </Field>
        ) : null}
      </dl>
    </section>
  );
}

function AppealRecord({ appeal }: { appeal: Appeal }) {
  return (
    <section className="rc-flow-tight">
      <h2 className="rc-label rc-section m-0">Appeal {appeal.id}</h2>
      <div className="rc-plate rc-plate-process">
        <span className="rc-plate-title">Appeal record</span>
        <div className="rc-flow-tight">
          <AppealStamp status={appeal.status} />
          <dl className="rc-flow-tight m-0">
            <Field term="Grounds">
              <span className="rc-verbatim">{appeal.grounds}</span>
              <span className="text-13">, {GROUNDS_GLOSS[appeal.grounds] ?? "the stated appeal basis"}</span>
            </Field>
            <Field term="Appellant">
              <span className="rc-verbatim">{shortenAddress(appeal.appellant, 12, 10)}</span>
            </Field>
            <Field term="Bond">
              <span className="rc-tabular">{formatGen(appeal.bond)} GEN</span>
            </Field>
            <Field term="Evidence">
              {appeal.evidence_url ? (
                <a className="rc-link break-all" href={appeal.evidence_url} rel="noreferrer noopener">
                  {appeal.evidence_url}
                </a>
              ) : (
                "not provided"
              )}
            </Field>
            {appeal.evidence_digest ? (
              <Field term="Evidence digest">
                <span className="rc-verbatim break-all">{appeal.evidence_digest}</span>
              </Field>
            ) : null}
            {appeal.settled_at ? (
              <Field term="Settled">
                <span className="rc-tabular">{displayTime(appeal.settled_at)}</span>
              </Field>
            ) : null}
          </dl>
          {appeal.verdict_rationale ? (
            <>
              <hr className="rc-rule" />
              <p className="m-0">{appeal.verdict_rationale}</p>
            </>
          ) : (
            <p className="text-13 m-0">
              Open. The evidence has been posted and the adjudication round has not run yet.
              Running it is permissionless.
            </p>
          )}
          <p className="text-12 m-0">
            <Link className="rc-link" href={`/appeal/${appeal.determination_id}`}>
              Full appeal page
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}

export const GROUNDS_GLOSS: Record<string, string> = {
  DIFFERENT_PARTY: "the matched row describes somebody else",
  INVALID_ASSOCIATION: "the link between the subject and the listed party does not hold",
  DELISTED: "the party was removed from the list before this screening",
  STALE_SOURCE: "the file screened was not the current publication",
};

function Field({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="rc-field-row">
      <dt className="rc-label">{term}</dt>
      <dd className="m-0 text-13">{children}</dd>
    </div>
  );
}

export function statusHeadline(status: DeterminationStatus): string {
  switch (status) {
    case "LISTED":
      return "Appears in the published list";
    case "NOT_LISTED":
      return "Not in the untruncated portion";
    case "INCONCLUSIVE":
      return "Source truncated, unresolved";
    case "ASSERTED":
      return "Judged the same party";
    case "UNDER_APPEAL":
      return "Appeal in progress";
    case "UPHELD":
      return "Judgment upheld on appeal";
    case "CONTESTED":
      return "Appeal could not be settled";
    case "OVERTURNED":
      return "Withdrawn on appeal";
    case "PENDING":
      return "Reported, not screened";
  }
}
