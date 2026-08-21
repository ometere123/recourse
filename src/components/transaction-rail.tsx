"use client";

import { useState } from "react";
import Link from "next/link";
import { useTransactions } from "./transaction-provider";
import { Ruler } from "./write-state-panel";
import { explorerTxUrl } from "@/lib/genlayer/config";
import { RETRYABLE_STAGES } from "@/lib/contract-types";
import { timeAgo } from "@/lib/format";

/**
 * The transaction rail: every write this browser submitted, and where each one
 * got to. It is a docket stub, not a notification centre — a submitted write
 * survives a page reload, a closed tab, and being forgotten about, because the
 * round keeps running on the network whatever this page does.
 *
 * It reads localStorage only. Nothing here is authoritative; the determination
 * pages re-read the contract.
 */
export function TransactionRail() {
  const { transactions, active, clear } = useTransactions();
  const [open, setOpen] = useState(false);

  if (transactions.length === 0) return null;

  return (
    <aside className="rc-rail" aria-label="Transaction rail">
      <div className="rc-sheet">
        <div className="flex flex-wrap items-center justify-between gap-4 py-3">
          <p className="rc-label m-0">
            Docket · {transactions.length} write{transactions.length === 1 ? "" : "s"} from this
            browser
            {active.length > 0 ? (
              <span className="text-process"> · {active.length} in consensus</span>
            ) : null}
          </p>
          <span className="flex gap-3">
            <button className="rc-btn" onClick={() => setOpen((value) => !value)} type="button">
              {open ? "Collapse" : "Open"}
            </button>
            <button className="rc-btn" onClick={clear} type="button">
              Clear
            </button>
          </span>
        </div>

        {open ? (
          <div className="rc-rail-scroll pb-4">
            {transactions.map((tx) => (
              <div className="rc-rail-row" key={tx.hash}>
                <div className="rc-flow-tight">
                  <p className="m-0 text-13">
                    <span className="rc-verbatim">{tx.functionName}()</span> — {tx.label}
                    {tx.subjectId ? (
                      <>
                        {" · "}
                        <Link className="rc-link" href={`/determinations/${tx.subjectId}`}>
                          {tx.subjectId}
                        </Link>
                      </>
                    ) : null}
                  </p>
                  <p className="m-0 text-12">
                    <a
                      className="rc-link rc-verbatim break-all"
                      href={explorerTxUrl(tx.hash)}
                      rel="noreferrer noopener"
                      target="_blank"
                    >
                      {tx.hash}
                    </a>
                    <span className="rc-tabular"> · {timeAgo(tx.createdAt)}</span>
                  </p>
                  {RETRYABLE_STAGES.has(tx.status) ? (
                    <p className="m-0 text-12">
                      Ended {tx.status}. The round stopped; no determination was recorded, and the
                      call can be submitted again.
                    </p>
                  ) : null}
                  {tx.status === "FINALIZED" && tx.executionResult !== "SUCCESS" ? (
                    <p className="m-0 text-12 text-stamp">
                      Finalized rollback: GenVM {tx.executionResult ?? "result unavailable"}
                      {tx.executionError ? ` — ${tx.executionError}` : ""}. No successful state
                      transition is claimed.
                    </p>
                  ) : null}
                  {tx.status === "FINALIZED" && tx.executionResult === "SUCCESS" ? (
                    <p className="m-0 text-12">Finalized · GenVM SUCCESS</p>
                  ) : null}
                </div>
                <div className="min-w-[9rem]">
                  <Ruler stage={tx.status} />
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
