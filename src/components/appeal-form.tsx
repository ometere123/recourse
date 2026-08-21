"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchAppeal, fetchDetermination } from "@/lib/data-source";
import {
  isAppealable,
  isExpiredUnfinalised,
  type Appeal,
  type AppealGrounds,
  type Determination,
} from "@/lib/contract-types";
import { countdown, displayTime, formatGen, parseGen } from "@/lib/format";
import { markedSpanFor } from "@/lib/match-span";
import { useWrite } from "@/lib/use-write";
import { useWallet } from "./wallet-provider";
import { useTransactions } from "./transaction-provider";
import { WriteStatePanel } from "./write-state-panel";
import { TheRow } from "./the-row";
import { StatusStamp } from "./stamp";
import { GROUNDS_GLOSS } from "./determination-view";

const GROUNDS: AppealGrounds[] = [
  "DIFFERENT_PARTY",
  "INVALID_ASSOCIATION",
  "DELISTED",
  "STALE_SOURCE",
];

const CONTRACT_GROUNDS: Record<AppealGrounds, string> = {
  DIFFERENT_PARTY: "DIFFERENT_PARTY: the appellant says the subject is a different legal party.",
  INVALID_ASSOCIATION: "INVALID_ASSOCIATION: the cited relationship does not establish the asserted identity.",
  DELISTED: "DELISTED: the designation record has been removed or superseded by the authority.",
  STALE_SOURCE: "STALE_SOURCE: the finding relies on source material that is no longer current.",
};

/**
 * The appeal form.
 *
 * Grounds are a fixed enumerated set, printed as they would appear on a form,
 * because an appeal has to be answerable: a free-text grievance cannot be
 * adjudicated by a rule, and the validators are asked one narrow question about
 * one stated ground. Choosing the ground is the substantive act on this page,
 * which is why it is the largest thing on it.
 */
export function AppealForm({ id }: { id: string }) {
  const [determination, setDetermination] = useState<Determination | undefined>();
  const [existing, setExisting] = useState<Appeal | undefined>();
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState<string | undefined>();
  const [grounds, setGrounds] = useState<AppealGrounds | undefined>();
  const [evidence, setEvidence] = useState("");
  const [bond, setBond] = useState("");
  const [touched, setTouched] = useState(false);

  const { getWriteClient, mode } = useWallet();
  const { track } = useTransactions();
  const { state, submit, expected, reset } = useWrite();
  const router = useRouter();

  const load = useCallback(async () => {
    setLoading(true);
    setReadError(undefined);
    try {
      const record = await fetchDetermination(id);
      setDetermination(record);
      if (record?.appeal_id) setExisting(await fetchAppeal(record.appeal_id));
      if (record && !bond) setBond(formatGen(record.bond).replace(/,/g, ""));
    } catch (error) {
      setReadError(error instanceof Error ? error.message : "The live contract could not be read.");
    } finally {
      setLoading(false);
    }
    // `bond` is intentionally not a dependency: this seeds the field once from
    // the determination and must not fight the person typing in it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void load());
    return () => window.cancelAnimationFrame(frame);
  }, [load]);

  const span = useMemo(
    () => (determination ? markedSpanFor(determination) : undefined),
    [determination],
  );

  const bondWei = parseGen(bond);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!grounds) {
      expected("Choose the ground you are appealing on.", "grounds");
      return;
    }
    if (!/^https?:\/\//i.test(evidence.trim())) {
      expected(
        "Evidence must be a URL every validator can fetch during the round. A file on your computer cannot be read by consensus.",
        "evidence",
      );
      return;
    }
    if (bondWei === undefined || bondWei <= 0n) {
      expected("The appeal bond must be a positive amount of GEN.", "bond");
      return;
    }
    const label = `Appeal ${id}`;
    const result = await submit(
      getWriteClient,
      {
        method: "appeal",
        args: [id, evidence.trim(), CONTRACT_GROUNDS[grounds]],
        value: bondWei,
        cost: formatGen(bondWei),
        label,
        subjectId: id,
        phases: ["fetching-sources"],
      },
      (hash) =>
        track({
          hash,
          label,
          functionName: "appeal",
          createdAt: new Date().toISOString(),
          status: "PENDING",
          subjectId: id,
        }),
    );
    if (result.ok) router.push(`/determinations/${id}`);
  };

  if (loading) {
    return (
      <p className="rc-label m-0">
        <span className="rc-pending-bar mr-3" />
        Reading determination {id}
      </p>
    );
  }

  if (readError) {
    return (
      <div className="rc-plate rc-plate-unstamped">
        <span className="rc-plate-title">Appeal record unavailable</span>
        <div className="rc-flow-tight">
          <span className="rc-void-stamp">Nothing was read</span>
          <p className="m-0 text-13">{readError}</p>
          <p className="m-0 text-13">
            This is not a missing determination. The live read failed, and no fixture record was substituted.
          </p>
          <button className="rc-btn" onClick={() => void load()} type="button">Try again</button>
        </div>
      </div>
    );
  }

  if (!determination) {
    return (
      <div className="rc-flow">
        <h1 className="font-display text-34 font-semibold m-0">No such determination</h1>
        <p className="m-0">
          There is nothing on the register under <span className="rc-verbatim">{id}</span>, so there
          is nothing to appeal.
        </p>
      </div>
    );
  }

  const busy = state.kind !== "idle" && state.kind !== "success";
  const remaining = countdown(determination.appeal_deadline);
  const appealable = isAppealable(determination) && !isExpiredUnfinalised(determination);

  return (
    <div className="rc-flow">
      <header className="rc-flow-tight">
        <p className="rc-label m-0">
          Appeal against{" "}
          <Link className="rc-link" href={`/determinations/${id}`}>
            {id}
          </Link>
        </p>
        <h1 className="font-display text-34 font-semibold m-0 break-all">
          {determination.subject_kind === "ADDRESS" ? (
            <span className="rc-verbatim text-26 leading-8">{determination.subject}</span>
          ) : (
            determination.subject
          )}
        </h1>
        <StatusStamp status={determination.status} />
      </header>

      {determination.matched_entry && span ? (
        <section className="rc-flow-tight">
          <h2 className="rc-label rc-section m-0">What you are contesting</h2>
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

      {!appealable ? <NotAppealable determination={determination} existing={existing} /> : null}

      {appealable ? (
        <form className="rc-flow" onSubmit={onSubmit} noValidate>
          <p className="text-13 m-0">
            Open until <span className="rc-tabular">{displayTime(determination.appeal_deadline)}</span>
            {remaining ? <> — {remaining} left</> : null}.
          </p>

          <fieldset className="border-0 m-0 p-0">
            <legend className="rc-label mb-3">Ground</legend>
            <div className="rc-flow-tight">
              {GROUNDS.map((option) => (
                <label
                  className={`rc-choice ${grounds === option ? "rc-choice-selected" : ""}`}
                  key={option}
                >
                  <input
                    checked={grounds === option}
                    className="mr-3"
                    name="grounds"
                    onChange={() => setGrounds(option)}
                    type="radio"
                    value={option}
                  />
                  <span className="rc-verbatim">{option}</span>
                  <span className="block text-13 mt-1">{GROUNDS_GLOSS[option]}</span>
                </label>
              ))}
            </div>
            <p className="text-12 mt-3 mb-0">
              One ground, chosen deliberately. The validators are asked whether your evidence
              defeats <span className="font-semibold">this</span> ground — not whether the
              determination feels unfair.
            </p>
          </fieldset>

          <section className="rc-flow-tight">
            <label className="rc-label block" htmlFor="evidence">
              Evidence URL
            </label>
            <input
              aria-invalid={touched && !/^https?:\/\//i.test(evidence.trim())}
              className="rc-input"
              id="evidence"
              onChange={(event) => setEvidence(event.target.value)}
              placeholder="https://…"
              type="url"
              value={evidence}
            />
            <p className="text-12 m-0">
              Every validator fetches this during the round. The contract records the URL and the
              adjudication rationale. A registry extract, an incorporation document or a delisting
              notice carries weight; a blog post asserting the conclusion does not.
            </p>
          </section>

          <section className="rc-flow-tight">
            <label className="rc-label block" htmlFor="appeal-bond">
              Appeal bond (GEN)
            </label>
            <input
              className="rc-input rc-tabular"
              id="appeal-bond"
              inputMode="decimal"
              onChange={(event) => setBond(event.target.value)}
              value={bond}
            />
            <p className="text-12 m-0">
              Seeded from the reporter&rsquo;s bond of{" "}
              <span className="rc-tabular">{formatGen(determination.bond)} GEN</span>. If the appeal
              succeeds, the reporter&rsquo;s bond comes to you. If it fails, yours goes to them. If
              the validators cannot agree, both are returned and the record is written CONTESTED.
            </p>
          </section>

          <div className="rc-flow-tight">
            <button className="rc-btn rc-btn-filled" disabled={busy} type="submit">
              {busy ? "Working" : "File the appeal"}
            </button>
            {mode === "none" ? (
              <p className="text-13 m-0">
                Filing is a write and needs a wallet. Open{" "}
                <span className="font-semibold">Wallet</span> in the masthead.
              </p>
            ) : null}
          </div>
        </form>
      ) : null}

      <WriteStatePanel state={state} />

      {state.kind !== "idle" ? (
        <button className="rc-btn" onClick={reset} type="button">
          Dismiss
        </button>
      ) : null}
    </div>
  );
}

/** Why this particular determination cannot be appealed, said precisely. */
function NotAppealable({
  determination: d,
  existing,
}: {
  determination: Determination;
  existing?: Appeal;
}) {
  if (d.status === "LISTED") {
    return (
      <div className="rc-plate rc-plate-stamp">
        <span className="rc-plate-title">Structurally unappealable</span>
        <div className="rc-flow-tight">
          <p className="m-0">
            This determination is byte equality against a published file. There is no judgment in it
            to overturn: an appeal would have to argue that the row above does not say what it
            plainly says.
          </p>
          <p className="text-13 m-0">
            The contract refuses this call before any bond is taken, so filing anyway would cost you
            a transaction and nothing else. If the listing itself is wrong, that is a matter for the
            authority that published it, not for this register.
          </p>
        </div>
      </div>
    );
  }

  if (existing) {
    return (
      <div className="rc-plate rc-plate-process">
        <span className="rc-plate-title">Already appealed</span>
        <p className="m-0 text-13">
          Appeal <span className="rc-verbatim">{existing.id}</span> is on the record with status{" "}
          {existing.status}. One determination takes one appeal.{" "}
          <Link className="rc-link" href={`/determinations/${d.id}`}>
            Read the record
          </Link>
          .
        </p>
      </div>
    );
  }

  if (isExpiredUnfinalised(d)) {
    return (
      <div className="rc-plate rc-plate-stamp">
        <span className="rc-plate-title">Window closed</span>
        <p className="m-0 text-13">
          The appeal window closed{" "}
          <span className="rc-tabular">{displayTime(d.appeal_deadline)}</span>. The record still
          needs finalising, which anyone can do from{" "}
          <Link className="rc-link" href={`/determinations/${d.id}`}>
            the determination page
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="rc-plate">
      <span className="rc-plate-title">Not open to appeal</span>
      <p className="m-0 text-13">
        A determination is appealable only while it is ASSERTED and inside its window. This one is{" "}
        {d.status.replace(/_/g, " ")}.{" "}
        {d.status === "INCONCLUSIVE"
          ? "Nothing was asserted about the subject, so there is no finding to contest — a rescreen is the remedy."
          : null}
      </p>
    </div>
  );
}
