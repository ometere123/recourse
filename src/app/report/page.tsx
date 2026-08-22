"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useWallet } from "@/components/wallet-provider";
import { useTransactions } from "@/components/transaction-provider";
import { WriteStatePanel } from "@/components/write-state-panel";
import { useWrite } from "@/lib/use-write";
import { formatGen, isAddress, parseGen } from "@/lib/format";

/**
 * Reporting a subject. The bond is the whole mechanism, so the form says what it
 * is for in the place where it is asked for: the reporter is staking that the
 * subject really does appear in a published list, and a screen that finds
 * nothing takes the stake.
 */
export default function ReportPage() {
  return (
    <Suspense fallback={<p className="rc-label">Loading form</p>}>
      <ReportForm />
    </Suspense>
  );
}

function ReportForm() {
  const params = useSearchParams();
  const router = useRouter();
  const { getWriteClient, mode } = useWallet();
  const { track } = useTransactions();
  const { state, submit, expected, reset } = useWrite();

  const [subject, setSubject] = useState(() => params.get("subject") ?? "");
  const [basisUrl, setBasisUrl] = useState("");
  const [bond, setBond] = useState("100");
  const [touched, setTouched] = useState(false);

  const subjectKind = useMemo(
    () => (isAddress(subject) ? "ADDRESS" : "ENTITY") as "ADDRESS" | "ENTITY",
    [subject],
  );

  const bondWei = parseGen(bond);
  const problems: { field: string; message: string }[] = [];
  if (!subject.trim()) {
    problems.push({ field: "subject", message: "A subject is required." });
  } else if (subject.trim().startsWith("0x") && !isAddress(subject)) {
    problems.push({
      field: "subject",
      message:
        "That looks like an address but is not 40 hex characters after 0x. Fix it, or remove the 0x to report it as a name.",
    });
  }
  if (bondWei === undefined || bondWei <= 0n) {
    problems.push({ field: "bond", message: "The bond must be a positive amount of GEN." });
  }
  if (!/^https?:\/\//i.test(basisUrl.trim())) {
    problems.push({
      field: "basis",
      message: "Give the report a public URL that anyone can open and check.",
    });
  }

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (problems.length > 0) {
      expected(problems[0].message, problems[0].field);
      return;
    }
    const result = await submit(
      getWriteClient,
      {
        method: "report",
        args: [subject.trim(), subjectKind === "ENTITY" ? "NAME" : "ADDRESS", basisUrl.trim()],
        value: bondWei ?? 0n,
        cost: formatGen(bondWei ?? 0n),
        label: `Report ${subject.trim().slice(0, 24)}`,
        phases: ["fetching-sources"],
      },
      (hash) =>
        track({
          hash,
          label: `Report ${subject.trim().slice(0, 24)}`,
          functionName: "report",
          createdAt: new Date().toISOString(),
          status: "PENDING",
        }),
    );
    if (result.ok) router.push("/determinations");
  };

  const busy = state.kind !== "idle" && state.kind !== "success";

  return (
    <div className="rc-flow">
      <header className="rc-flow-tight">
        <h1 className="font-display text-34 font-semibold m-0">Report a subject</h1>
        <p className="m-0">
          Reporting puts a subject on the register and bonds your claim that it appears in a
          published sanctions list. Screening it is a separate, permissionless call, so a report
          does not decide anything. It only pays for the question to be asked.
        </p>
      </header>

      <form className="rc-flow" onSubmit={onSubmit} noValidate>
        <section className="rc-flow-tight">
          <label className="rc-label block" htmlFor="subject">
            Subject
          </label>
          <input
            aria-describedby="subject-help"
            aria-invalid={touched && problems.some((p) => p.field === "subject")}
            autoComplete="off"
            className={`rc-input rc-input-verbatim ${
              touched && problems.some((p) => p.field === "subject") ? "rc-input-invalid" : ""
            }`}
            id="subject"
            onChange={(event) => setSubject(event.target.value)}
            placeholder="0x… or SUEX OTC, S.R.O."
            spellCheck={false}
            value={subject}
          />
          <p className="text-12 m-0" id="subject-help">
            Read as{" "}
            <span className="font-semibold">
              {subjectKind === "ADDRESS" ? "a wallet address" : "an entity name"}
            </span>
            . Addresses are normalised to lowercase hex; names are case-folded and
            whitespace-collapsed. The contract stores the normalised form, and every later
            comparison uses it.
          </p>
        </section>

        <section className="rc-flow-tight">
            <label className="rc-label block" htmlFor="basis-url">
              Report source URL
            </label>
            <input
              aria-invalid={touched && problems.some((p) => p.field === "basis")}
              className={`rc-input ${
                touched && problems.some((p) => p.field === "basis") ? "rc-input-invalid" : ""
              }`}
              id="basis-url"
              onChange={(event) => setBasisUrl(event.target.value)}
              placeholder="https://home.treasury.gov/news/press-releases/…"
              type="url"
              value={basisUrl}
            />
            <p className="text-12 m-0">
              This is the public source behind your report. The contract records it for the audit
              trail; screening itself independently fetches the authoritative sanctions exports.
            </p>
          </section>

        <section className="rc-flow-tight">
          <label className="rc-label block" htmlFor="bond">
            Bond (GEN)
          </label>
          <input
            aria-invalid={touched && problems.some((p) => p.field === "bond")}
            className={`rc-input rc-tabular ${
              touched && problems.some((p) => p.field === "bond") ? "rc-input-invalid" : ""
            }`}
            id="bond"
            inputMode="decimal"
            onChange={(event) => setBond(event.target.value)}
            value={bond}
          />
          <p className="text-12 m-0">
            Staked against your claim. If the screen finds the subject, the bond returns to you. If
            it finds nothing, the bond is slashed to the bounty pool. That cost is what keeps this
            register from being a place to smear an address for free. The contract enforces its own
            minimum and will refuse a bond below it.
          </p>
        </section>

        <div className="rc-flow-tight">
          <button className="rc-btn rc-btn-filled" disabled={busy} type="submit">
            {busy ? "Working" : "Report and bond"}
          </button>
          {mode === "none" ? (
            <p className="text-13 m-0">
              This is a write, so it needs a wallet. Choose{" "}
              <span className="font-semibold">Connect wallet</span> in the masthead.
            </p>
          ) : null}
        </div>
      </form>

      <WriteStatePanel state={state} />

      {state.kind !== "idle" ? (
        <button className="rc-btn" onClick={reset} type="button">
          Dismiss
        </button>
      ) : null}
    </div>
  );
}
