"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWallet } from "./wallet-provider";
import { useTransactions } from "./transaction-provider";
import { WriteStatePanel } from "./write-state-panel";
import { useWrite } from "@/lib/use-write";
import { PRIMARY_SOURCES } from "@/lib/genlayer/config";
import { countdown, displayTime } from "@/lib/format";
import {
  isExpiredUnfinalised,
  type Appeal,
  type Determination,
  type SourceRow,
} from "@/lib/contract-types";

/**
 * The permissionless buttons.
 *
 * Screening, adjudicating and closing an appeal window are open calls: the
 * contract does not care who makes them, and the record only advances when
 * somebody does. So they are printed as plain buttons on the record itself, with
 * the reason anybody would press them stated next to each — a queue that
 * requires a privileged operator is not a public register.
 */
export function WriteActions({
  determination: d,
  appeal,
}: {
  determination: Determination;
  appeal?: Appeal;
}) {
  const { getWriteClient, mode } = useWallet();
  const { track } = useTransactions();
  const { state, submit, reset } = useWrite();
  const router = useRouter();

  /** While a round runs we know only which files are irrelevant, so that is all
   *  the matrix claims. Every other row stays pending, named, and honest. */
  const sources = useMemo<SourceRow[]>(
    () =>
      PRIMARY_SOURCES.map((source) => ({
        file: source.file,
        url: source.url,
        list: source.list,
        state:
          source.list === "OFAC_ALT" && d.subject_kind === "ADDRESS"
            ? ("not-applicable" as const)
            : ("pending" as const),
        detail:
          source.list === "OFAC_ALT" && d.subject_kind === "ADDRESS"
            ? "alias file holds names only; an address cannot appear in it"
            : `${source.authority} — fetched by every validator independently`,
      })),
    [d.subject_kind],
  );

  const run = async (
    method: string,
    args: (string | number)[],
    label: string,
    phases: Parameters<typeof submit>[1]["phases"],
  ) => {
    const result = await submit(
      getWriteClient,
      { method, args, value: 0n, cost: "0", label, subjectId: d.id, phases },
      (hash) =>
        track({
          hash,
          label,
          functionName: method,
          createdAt: new Date().toISOString(),
          status: "PENDING",
          subjectId: d.id,
        }),
    );
    if (result.ok) router.refresh();
  };

  const expired = isExpiredUnfinalised(d);
  const remaining = countdown(d.appeal_deadline);
  const busy = state.kind !== "idle" && state.kind !== "success";

  return (
    <div className="rc-flow-tight">
      {/* ---- PENDING: nobody has screened this yet ---- */}
      {d.status === "PENDING" ? (
        <Action
          description="Fetch the published files inside consensus and write a determination. Anyone may run this; the reporter's bond is already posted."
          disabled={busy}
          label="Run screen()"
          onClick={() =>
            void run("screen", [d.id], `Screen ${d.id}`, [
              "fetching-sources",
              "scanning",
              "judging-identity",
            ])
          }
          tone="process"
        />
      ) : null}

      {/* ---- The appeal window is open ---- */}
      {d.status === "ASSERTED" && !d.appeal_id && !expired ? (
        <div className="rc-plate rc-plate-process">
          <span className="rc-plate-title">Appeal window open</span>
          <div className="rc-flow-tight">
            <p className="m-0">
              This determination rests on a judgment, and it can be contested until{" "}
              <span className="rc-tabular">{displayTime(d.appeal_deadline)}</span>
              {remaining ? (
                <>
                  {" "}
                  — <span className="font-semibold">{remaining} left</span>
                </>
              ) : null}
              .
            </p>
            <Link className="rc-btn rc-btn-filled" href={`/appeal/${d.id}`}>
              File an appeal
            </Link>
          </div>
        </div>
      ) : null}

      {/* ---- The window closed and nobody finalised it ---- */}
      {expired ? (
        <div className="rc-plate rc-plate-stamp">
          <span className="rc-plate-title">Needs closing</span>
          <div className="rc-flow-tight">
            <p className="m-0">
              The appeal window closed{" "}
              <span className="rc-tabular">{displayTime(d.appeal_deadline)}</span> and nobody has
              finalised the record. Until somebody calls{" "}
              <span className="rc-verbatim">expire_appeal_window()</span> the reporter&rsquo;s bond
              stays locked and the determination stays provisional.
            </p>
            <p className="text-13 m-0">
              There is no operator to do this. It is an open call, it costs one transaction, and it
              is the reason this record is still sitting here.
            </p>
            <Action
              description=""
              disabled={busy}
              label="Close the window"
              onClick={() =>
                void run("expire_appeal_window", [d.id], `Close window on ${d.id}`, [
                  "fetching-sources",
                ])
              }
              tone="stamp"
            />
          </div>
        </div>
      ) : null}

      {/* ---- An appeal is posted and waiting to be heard ---- */}
      {appeal && appeal.status === "OPEN" ? (
        <Action
          description="Run the adjudication round: validators read the appellant's evidence against the matched row and return UPHELD, OVERTURNED or UNCLEAR. Permissionless."
          disabled={busy}
          label="Run adjudicate_appeal()"
          onClick={() =>
            void run("adjudicate_appeal", [appeal.id], `Adjudicate ${appeal.id}`, [
              "fetching-sources",
              "judging-identity",
            ])
          }
          tone="process"
        />
      ) : null}

      {/* ---- Anything already screened can be screened again ---- */}
      {d.status === "INCONCLUSIVE" ? (
        <Action
          description="The determination could not be settled because the published file was cut short. If the authority has republished it since, a rescreen will read the repaired row."
          disabled={busy}
          label="Run rescreen()"
          onClick={() =>
            void run("rescreen", [d.id], `Rescreen ${d.id}`, ["fetching-sources", "scanning"])
          }
          tone="stamp"
        />
      ) : null}

      {mode === "none" ? (
        <p className="text-13 m-0">
          These calls need a wallet to sign them. Open <span className="font-semibold">Wallet</span>{" "}
          in the masthead — a throwaway key works.
        </p>
      ) : null}

      <WriteStatePanel sources={sources} state={state} />

      {state.kind !== "idle" ? (
        <button className="rc-btn" onClick={reset} type="button">
          Dismiss
        </button>
      ) : null}
    </div>
  );
}

function Action({
  label,
  description,
  onClick,
  disabled,
  tone,
}: {
  label: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
  tone: "ink" | "process" | "stamp";
}) {
  return (
    <div className="rc-flow-tight">
      <button
        className={`rc-btn ${tone === "process" ? "rc-btn-process" : tone === "stamp" ? "rc-btn-stamp" : ""}`}
        disabled={disabled}
        onClick={onClick}
        type="button"
      >
        {label}
      </button>
      {description ? <p className="text-13 m-0">{description}</p> : null}
    </div>
  );
}
