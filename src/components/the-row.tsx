import { displayDate, displayTime } from "@/lib/format";
import type { MatchedList } from "@/lib/contract-types";
import { PRIMARY_SOURCES } from "@/lib/genlayer/config";

/**
 * THE ROW.
 *
 * The determination is not a score and it is not a badge: it is a row of bytes
 * an authority published, with the matched span marked and a caret rule struck
 * directly beneath the matched characters, the way a proofreader marks a page.
 * Everything else on the screen is the app's own writing. This element is the
 * only place the primary source speaks for itself, which is why it is set in
 * Courier Prime — in this system that face means "fetched", never "code".
 *
 * `white-space: pre` plus horizontal scroll is deliberate. Wrapping would break
 * caret registration, and caret registration is the entire point: it proves the
 * match is a fact about specific bytes at a specific offset, not a similarity
 * score. A `…` at the edge of an excerpt is the boundary of the contract's
 * extraction window, not an edit.
 */

type RowProps = {
  /** The fetched bytes, verbatim. May contain newlines for a bounded window. */
  bytes: string;
  /** The span to mark. Defaults to the subject. */
  highlight: string;
  /** What the mark means. Printed beside the caret rule, never inferred. */
  matchLabel: string;
  /** Set when the authority's own field limit severed the value mid-way. */
  cut?: { survivingLen: number; totalLen: number };
  provenance: {
    list: MatchedList;
    digest: string;
    generated: string;
    fetchedAt: string;
  };
};

const LIST_LABEL: Record<MatchedList, string> = {
  OFAC_SDN: "SDN.CSV",
  OFAC_ALT: "ALT.CSV",
  UN_CONSOLIDATED: "consolidated.xml",
  NONE: "—",
};

const AUTHORITY: Record<MatchedList, string> = {
  OFAC_SDN: "US Treasury, Office of Foreign Assets Control",
  OFAC_ALT: "US Treasury, Office of Foreign Assets Control",
  UN_CONSOLIDATED: "United Nations Security Council",
  NONE: "—",
};

/** Case-insensitive, because the contract's scan normalises case before comparing. */
function findSpan(line: string, needle: string): [number, number] | undefined {
  if (!needle) return undefined;
  const at = line.toLowerCase().indexOf(needle.toLowerCase());
  return at === -1 ? undefined : [at, at + needle.length];
}

function caretRule(start: number, length: number, cut: boolean): string {
  const carets = "^".repeat(Math.max(1, length));
  // A caret can only claim bytes that exist. Where the authority cut the value,
  // the rule ends in a question mark rather than another caret.
  return `${" ".repeat(start)}${carets}${cut ? "?" : ""}`;
}

export function TheRow({ bytes, highlight, matchLabel, cut, provenance }: RowProps) {
  const lines = bytes.split("\n");
  const markedLine = lines.findIndex((line) => Boolean(findSpan(line, highlight)));

  return (
    <figure className="m-0">
      <div className="rc-row">
        <div className="rc-row-scroll">
          <pre className="rc-row-bytes">
            {lines.map((line, index) => {
              const span = index === markedLine ? findSpan(line, highlight) : undefined;
              if (!span) {
                return (
                  <span key={index}>
                    {line}
                    {index < lines.length - 1 ? "\n" : ""}
                  </span>
                );
              }
              const [start, end] = span;
              return (
                <span key={index}>
                  {line.slice(0, start)}
                  <mark className="rc-row-match bg-transparent">{line.slice(start, end)}</mark>
                  {line.slice(end)}
                  {"\n"}
                  <span className="rc-row-caret" aria-hidden="true">
                    {caretRule(start, end - start, Boolean(cut))}
                  </span>
                  {index < lines.length - 1 ? "\n" : ""}
                </span>
              );
            })}
          </pre>
        </div>

        {cut ? (
          <span className="rc-row-cut-note">
            Row ends here. The authority truncates this field at 1,000 characters;{" "}
            {cut.survivingLen} of {cut.totalLen} characters of the subject survived, and the
            remaining {cut.totalLen - cut.survivingLen} were never published.
          </span>
        ) : null}
      </div>

      <figcaption className="rc-flow-tight mt-4">
        <p className="text-13 m-0">
          {markedLine >= 0 ? (
            <>
              <span className="font-semibold">Marked span:</span> {matchLabel}
            </>
          ) : (
            <>
              <span className="font-semibold">No byte-exact span.</span> The subject does not
              appear verbatim in this row; the row is shown unmarked rather than marked
              approximately.
            </>
          )}
        </p>
        <ProvenanceRail provenance={provenance} />
      </figcaption>
    </figure>
  );
}

/**
 * Provenance rail. Fixture records include captured digest/publication facts;
 * the live contract currently stores the source identity and fetch time only.
 */
export function ProvenanceRail({ provenance }: Pick<RowProps, "provenance">) {
  const { list, digest, generated, fetchedAt } = provenance;
  const source = PRIMARY_SOURCES.find((entry) => entry.list === list);

  return (
    <dl className="rc-flow-tight m-0 border-t border-rule pt-4">
      <Fact term="Source file">
        {source ? (
          <a className="rc-link rc-verbatim" href={source.url} rel="noreferrer noopener">
            {LIST_LABEL[list]}
          </a>
        ) : (
          <span className="rc-verbatim">{LIST_LABEL[list]}</span>
        )}{" "}
        <span className="text-13">· {AUTHORITY[list]}</span>
      </Fact>
      <Fact term="Digest">
        <span className="rc-verbatim break-all">
          {digest || "not stored by this contract"}
        </span>
      </Fact>
      <Fact term="Published">
        <span className="rc-tabular">{generated ? displayDate(generated) : "not stored"}</span>
        {generated ? <span className="text-13"> — the date the file states for itself</span> : null}
      </Fact>
      <Fact term="Fetched">
        <span className="rc-tabular">{displayTime(fetchedAt)}</span>
        <span className="text-13"> — inside consensus, by every validator</span>
      </Fact>
    </dl>
  );
}

function Fact({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="rc-field-row">
      <dt className="rc-label">{term}</dt>
      <dd className="text-13 m-0">{children}</dd>
    </div>
  );
}

/**
 * The plate that only LISTED may wear. On a byte-equal hit the contract returns
 * before any prompt runs, so no model formed an opinion about this subject — and
 * that is a stronger claim than any confidence score, so it gets a box.
 */
export function NoInferencePlate() {
  return (
    <div className="rc-plate rc-plate-stamp">
      <span className="rc-plate-title">No inference used</span>
      <p className="text-13 m-0">
        This determination was reached by byte equality against the published file. The
        contract&rsquo;s exact-match branch returns before the identity round, so no prompt was
        constructed, no model was consulted, and no validator was asked for a judgment about this
        subject. Re-running the screen against the same file must produce the same row, the same
        offset and the same caret.
      </p>
    </div>
  );
}
