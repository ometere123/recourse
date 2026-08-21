"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  fetchDamagedRecordCount,
  fetchDeterminations,
  fetchDetermination,
} from "@/lib/data-source";
import {
  DAMAGED_RECORD_COUNT,
  isExpiredUnfinalised,
  type Determination,
  type DeterminationSummary,
} from "@/lib/contract-types";
import { markedSpanFor } from "@/lib/match-span";
import { NoInferencePlate, TheRow } from "@/components/the-row";
import { StatusStamp } from "@/components/stamp";

/**
 * The front page has one job: make the difference between a lookup and a
 * judgment visible before anybody clicks anything. So the hero is not a value
 * proposition, it is an actual determination with the actual row it rests on.
 */
export default function HomePage() {
  const [featured, setFeatured] = useState<Determination | undefined>();
  const [rows, setRows] = useState<DeterminationSummary[]>([]);
  const [damaged, setDamaged] = useState(DAMAGED_RECORD_COUNT);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const register = await fetchDeterminations();
        if (!live) return;
        setRows(register);
        const pick =
          register.find((row) => row.status === "LISTED") ??
          register.find((row) => row.status === "ASSERTED") ??
          register[0];
        const [record, count] = await Promise.all([
          pick ? fetchDetermination(pick.id) : Promise.resolve(undefined),
          fetchDamagedRecordCount(),
        ]);
        if (!live) return;
        setFeatured(record);
        setDamaged(count);
      } catch {
        // The front page degrades to prose. It is not worth an error panel.
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const waiting = rows.filter((row) => row.status === "PENDING" || isExpiredUnfinalised(row));
  const span = featured ? markedSpanFor(featured) : undefined;

  return (
    <div className="rc-flow">
      <section className="rc-flow-tight">
        <h1 className="font-display text-34 font-semibold m-0">
          A sanctions hit you can read, and argue with.
        </h1>
        <p className="m-0">
          Screening services return a score and a colour. When the score is wrong — a shared
          romanisation, a stale record, an address that was never yours — there is no one to ask and
          nothing to appeal. Recourse writes a determination instead: the matched designation
          fields, the authority file consulted, whether a model was involved at all, and a window
          in which the determination can be contested by anybody willing to bond their claim.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link className="rc-btn rc-btn-filled" href="/check">
            Check a subject
          </Link>
          <Link className="rc-btn" href="/determinations">
            Read the register
          </Link>
        </div>
      </section>

      {featured && span && featured.matched_entry ? (
        <section className="rc-flow-tight">
          <h2 className="rc-label rc-section m-0">A determination, in full</h2>
          <div className="rc-flow-tight">
            <StatusStamp status={featured.status} large />
            <p className="m-0 break-all">
              <span className="rc-label">Subject</span>{" "}
              <span className="rc-verbatim">{featured.subject}</span>
            </p>
          </div>
          <TheRow
            bytes={featured.matched_entry}
            cut={span.cut}
            highlight={span.highlight}
            matchLabel={span.matchLabel}
            provenance={{
              list: featured.matched_list,
              digest: featured.source_digest,
              generated: featured.source_generated,
              fetchedAt: featured.screened_at,
            }}
          />
          {featured.status === "LISTED" ? <NoInferencePlate /> : null}
          <p className="text-13 m-0">
            <Link className="rc-link" href={`/determinations/${featured.id}`}>
              Read {featured.id} in full
            </Link>
          </p>
        </section>
      ) : null}

      <section className="rc-flow-tight">
        <h2 className="rc-label rc-section m-0">Four answers, not two</h2>
        <dl className="m-0">
          <Answer term="Listed">
            The subject appears in the published file byte-for-byte. Arithmetic, not judgment, and
            not appealable — there is nothing in it to overturn.
          </Answer>
          <Answer term="Clear">
            Scoped, always:{" "}
            <span className="font-semibold">
              does not appear in the untruncated portion of the list that was read
            </span>
            . Never &ldquo;not sanctioned&rdquo;, because that is not a claim any file can support.
          </Answer>
          <Answer term="Inconclusive">
            The authority&rsquo;s own file is damaged at exactly the point that would settle it.
            OFAC truncates its Remarks column at 1,000 characters, and{" "}
            <span className="rc-tabular font-semibold">{damaged} records</span> currently have a
            digital-currency address cut mid-value. A subject matching only the surviving part is
            recorded as unresolved, in writing, rather than quietly passed.
          </Answer>
          <Answer term="Contested">
            An appeal was heard and the validators could not agree. The contract returns the
            disagreement rather than a coin flip, and both bonds go back.
          </Answer>
        </dl>
      </section>

      {waiting.length > 0 ? (
        <section className="rc-flow-tight">
          <h2 className="rc-label rc-section m-0">Waiting on somebody</h2>
          <p className="m-0 text-13">
            Screening a report and closing an appeal window are open calls with no operator. These
            records are stuck until any wallet pays for one transaction.
          </p>
          <ul className="m-0 list-none border-t border-ink p-0">
            {waiting.slice(0, 5).map((row) => (
              <li className="border-b border-rule py-3" key={row.id}>
                <Link className="rc-link" href={`/determinations/${row.id}`}>
                  {row.id}
                </Link>{" "}
                <span className="text-13">
                  {row.status === "PENDING"
                    ? "— reported and bonded, never screened"
                    : "— appeal window closed, record not finalised"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rc-flow-tight">
        <h2 className="rc-label rc-section m-0">Why this needs consensus</h2>
        <p className="m-0">
          A contract that trusted one server&rsquo;s copy of a sanctions list would be trusting
          whoever ran that server. Here every validator fetches the published files independently
          inside the round and must agree on what they contain, so the determination is a fact about
          the file rather than about an operator. The same discipline decides the hard cases: an
          exact byte match returns before any prompt is built, and where the file itself is
          incomplete the contract writes down that it does not know.
        </p>
        <p className="text-13 m-0">
          <Link className="rc-link" href="/docs">
            How the states, bonds and calls fit together
          </Link>
        </p>
      </section>
    </div>
  );
}

function Answer({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-rule py-4">
      <dt className="rc-label">{term}</dt>
      <dd className="m-0 mt-1 text-13">{children}</dd>
    </div>
  );
}
