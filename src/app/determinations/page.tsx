"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchDeterminations } from "@/lib/data-source";
import {
  isExpiredUnfinalised,
  type DeterminationStatus,
  type DeterminationSummary,
} from "@/lib/contract-types";
import { countdown, displayTime, formatGen, shortenAddress, shortenName } from "@/lib/format";
import { StatusStamp } from "@/components/stamp";

/**
 * The register. Every determination the contract holds, in one list, with the
 * ones that need a hand at the top.
 *
 * There is no pagination and no infinite scroll: this is a public register, and a
 * register you cannot see the end of is not auditable. When the contract holds
 * more rows than a page can carry, the filter row below is how you narrow it —
 * client-side, over the whole set, so nothing is hidden behind a cursor.
 */

const FILTERS: (DeterminationStatus | "ALL" | "NEEDS_ACTION")[] = [
  "ALL",
  "NEEDS_ACTION",
  "LISTED",
  "ASSERTED",
  "INCONCLUSIVE",
  "CONTESTED",
  "OVERTURNED",
  "NOT_LISTED",
  "PENDING",
];

const FILTER_LABEL: Record<string, string> = {
  ALL: "All",
  NEEDS_ACTION: "Needs a hand",
};

export default function DeterminationsPage() {
  const [rows, setRows] = useState<DeterminationSummary[] | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [filter, setFilter] = useState<string>("ALL");

  useEffect(() => {
    let live = true;
    fetchDeterminations()
      .then((result) => {
        if (live) setRows(result);
      })
      .catch((caught: unknown) => {
        if (live) {
          setError(caught instanceof Error ? caught.message : "The register could not be read.");
        }
      });
    return () => {
      live = false;
    };
  }, []);

  const needsAction = useMemo(
    () => (rows ?? []).filter((row) => row.status === "PENDING" || isExpiredUnfinalised(row)),
    [rows],
  );

  const visible = useMemo(() => {
    const all = rows ?? [];
    if (filter === "ALL") return all;
    if (filter === "NEEDS_ACTION") return needsAction;
    return all.filter((row) => row.status === filter);
  }, [rows, filter, needsAction]);

  return (
    <div className="rc-flow">
      <header className="rc-flow-tight">
        <h1 className="font-display text-34 font-semibold m-0">Register</h1>
        <p className="m-0">
          Every determination this contract has written, and every one still waiting for somebody to
          advance it.
        </p>
      </header>

      {needsAction.length > 0 ? (
        <div className="rc-plate rc-plate-stamp">
          <span className="rc-plate-title">
            {needsAction.length} record{needsAction.length === 1 ? "" : "s"} waiting on somebody
          </span>
          <div className="rc-flow-tight">
            <p className="m-0 text-13">
              Nothing here has an operator. A reported subject stays unscreened, and a closed appeal
              window stays open, until any wallet pays for one transaction.
            </p>
            <ul className="m-0 list-none p-0">
              {needsAction.map((row) => (
                <li className="border-t border-rule py-2" key={row.id}>
                  <Link className="rc-link" href={`/determinations/${row.id}`}>
                    {row.id}
                  </Link>{" "}
                  <span className="text-13">
                    {row.status === "PENDING"
                      ? "— reported, never screened"
                      : "— appeal window closed, record not finalised"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <nav aria-label="Filter by status">
        <ul className="m-0 flex flex-wrap gap-x-6 gap-y-2 list-none p-0">
          {FILTERS.map((option) => (
            <li key={option}>
              <button
                aria-pressed={filter === option}
                className={`rc-label bg-transparent border-0 cursor-pointer p-0 ${
                  filter === option ? "text-stamp underline decoration-2 underline-offset-[6px]" : ""
                }`}
                onClick={() => setFilter(option)}
                type="button"
              >
                {FILTER_LABEL[option] ?? option.replace(/_/g, " ")}
              </button>
            </li>
          ))}
        </ul>
        <hr className="rc-rule mt-4" />
      </nav>

      {error ? (
        <div className="rc-plate rc-plate-unstamped">
          <span className="rc-plate-title">Register unavailable</span>
          <div className="rc-flow-tight">
            <span className="rc-void-stamp">Nothing was read</span>
            <p className="m-0 text-13">{error}</p>
          </div>
        </div>
      ) : null}

      {rows === undefined && !error ? (
        <p className="rc-label m-0">
          <span className="rc-pending-bar mr-3" />
          Reading the register from the contract
        </p>
      ) : null}

      {rows !== undefined && visible.length === 0 ? (
        <p className="m-0">
          Nothing under this filter.{" "}
          <Link className="rc-link" href="/report">
            Report a subject
          </Link>{" "}
          to start the register.
        </p>
      ) : null}

      <ul className="m-0 list-none border-t border-ink p-0">
        {visible.map((row) => (
          <li className="border-b border-rule py-6" key={row.id}>
            <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
              <div className="rc-flow-tight min-w-0">
                <p className="rc-label m-0">
                  <Link className="rc-link" href={`/determinations/${row.id}`}>
                    {row.id}
                  </Link>
                </p>
                <p className="m-0 break-all">
                  {row.subject_kind === "ADDRESS" ? (
                    <span className="rc-verbatim">{shortenAddress(row.subject, 16, 12)}</span>
                  ) : (
                    shortenName(row.subject)
                  )}
                </p>
                <p className="text-12 m-0 rc-tabular">
                  {row.screened_at ? displayTime(row.screened_at) : "not screened"} ·{" "}
                  {formatGen(row.bond)} GEN bonded
                  {row.appeal_id ? ` · appeal ${row.appeal_id}` : ""}
                </p>
              </div>
              <div className="shrink-0">
                <StatusStamp
                  note={
                    row.status === "ASSERTED" && !row.appeal_id
                      ? isExpiredUnfinalised(row)
                        ? "window closed"
                        : (countdown(row.appeal_deadline) ?? "") &&
                          `${countdown(row.appeal_deadline)} to appeal`
                      : undefined
                  }
                  status={row.status}
                />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
