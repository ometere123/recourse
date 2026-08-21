import type { SourceRow, SourceState } from "@/lib/contract-types";

/**
 * The source matrix. Three states, never two.
 *
 * A binary spinner would force the UI to lie in one direction or the other about
 * a file it could not reach: either it pretends the check happened or it reports
 * a failure that never occurred. So a source is `checked`, `unreachable`, or
 * `not applicable` — and while it is pending it still names itself. There is no
 * spinner anywhere in this app that is not sitting next to the name of the file
 * it is waiting on.
 */

const GLYPH: Record<Exclude<SourceState, "pending">, string> = {
  checked: "x", // a mark in the box, as on a form
  unreachable: "!",
  "not-applicable": "n/a",
};

const STATE_WORD: Record<SourceState, string> = {
  pending: "fetching",
  checked: "checked",
  unreachable: "unreachable",
  "not-applicable": "not applicable",
};

export function SourceMatrix({ rows, caption }: { rows: SourceRow[]; caption?: string }) {
  return (
    <div>
      {caption ? <p className="rc-label mb-3">{caption}</p> : null}
      <ul className="m-0 list-none border-t border-ink p-0">
        {rows.map((row) => (
          <li className="rc-source-row" key={row.file}>
            <span
              className={`rc-source-glyph ${row.state === "unreachable" ? "text-stamp" : ""}`}
              aria-hidden="true"
            >
              {row.state === "pending" ? <span className="rc-pending-bar" /> : GLYPH[row.state]}
            </span>
            <span className="rc-verbatim">
              <a className="rc-link" href={row.url} rel="noreferrer noopener">
                {row.file}
              </a>
            </span>
            <span className="text-13">
              <span className="rc-label mr-2">{STATE_WORD[row.state]}</span>
              {row.detail}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
