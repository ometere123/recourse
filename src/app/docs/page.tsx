import Link from "next/link";
import { DAMAGED_RECORD_COUNT } from "@/lib/contract-types";
import { PRIMARY_SOURCES } from "@/lib/genlayer/config";

export const metadata = { title: "Docs" };

/**
 * The reference page. Written as documentation rather than marketing: the state
 * machine, the calls, who may make them, and — at the end — what this contract
 * cannot do, because a screening tool that does not state its limits is worse
 * than no screening tool.
 */
export default function DocsPage() {
  return (
    <div className="rc-flow">
      <header className="rc-flow-tight">
        <h1 className="font-display text-34 font-semibold m-0">How it works</h1>
        <p className="m-0">
          Recourse is one Intelligent Contract on GenLayer. It fetches published sanctions files
          inside consensus, writes determinations with the matched record fields, and lets a determination
          that rests on a judgment be appealed by anyone who bonds a claim.
        </p>
      </header>

      <section className="rc-flow-tight">
        <h2 className="rc-label rc-section m-0">The determination states</h2>
        <Table
          head={["State", "Reached by", "Appealable"]}
          rows={[
            ["PENDING", "report() — bonded, not yet screened", "n/a"],
            ["LISTED", "byte equality with a published row", "No — nothing to overturn"],
            [
              "NOT_LISTED",
              "the deterministic scan extracted zero candidates",
              "No — no adverse finding",
            ],
            [
              "INCONCLUSIVE",
              "prefix equality with a row the authority truncated",
              "No — rescreen instead",
            ],
            ["ASSERTED", "validators judged the subject to be the same party", "Yes"],
            ["UNDER_APPEAL", "a bonded appeal is awaiting adjudication", "In progress"],
            ["UPHELD", "the appeal failed against the stated basis", "No — terminal"],
            ["CONTESTED", "the appeal round could not agree", "No — terminal"],
            ["OVERTURNED", "the appeal succeeded", "No — terminal"],
          ]}
        />
      </section>

      <section className="rc-flow-tight">
        <h2 className="rc-label rc-section m-0">Two vocabularies</h2>
        <p className="m-0 text-13">
          A determination record carries the seven states above. Integrators calling{" "}
          <span className="rc-verbatim">check()</span> get four words, because a calling contract
          needs to branch, not to read. The mapping is fixed:
        </p>
        <Table
          head={["check()", "from status", "how to read it"]}
          rows={[
            ["FLAGGED", "LISTED · ASSERTED", "an adverse determination exists on the record"],
            [
              "CLEAR",
              "NOT_LISTED · OVERTURNED",
              "does not appear in the untruncated portion of the list that was read",
            ],
            [
              "INCONCLUSIVE",
              "INCONCLUSIVE",
              "the source is damaged where the answer would be; escalate by hand",
            ],
            ["CONTESTED", "CONTESTED", "heard and unresolved; apply your own risk tolerance"],
          ]}
        />
        <p className="text-13 m-0">
          A subject nobody has reported has no determination at all. That is not CLEAR, and{" "}
          <span className="rc-verbatim">check()</span> does not pretend otherwise — the read returns
          no record and this site says so in those words.
        </p>
      </section>

      <section className="rc-flow-tight">
        <h2 className="rc-label rc-section m-0">The calls</h2>
        <Table
          head={["Call", "Who", "Cost"]}
          rows={[
            ["report(subject, kind, basis, url)", "anyone", "report bond"],
            ["screen(id)", "anyone — permissionless", "gas only"],
            ["rescreen(id)", "anyone — permissionless", "gas only"],
            ["appeal(id, evidence_url, grounds)", "anyone", "appeal bond"],
            ["adjudicate_appeal(appeal_id)", "anyone — permissionless", "gas only"],
            ["expire_appeal_window(id)", "anyone — permissionless", "gas only"],
            ["check(subject) · get_determination(id) · get_appeal(id)", "anyone", "free read"],
            ["list_determinations(offset, limit) · get_source_health()", "anyone", "free read"],
          ]}
        />
        <p className="text-13 m-0">
          There is no admin, no pause and no operator queue. Four of the calls above are
          permissionless on purpose: a register that only advances when a privileged service is
          running is not a public register. The consequence is visible on the{" "}
          <Link className="rc-link" href="/determinations">
            register
          </Link>{" "}
          — records sit there waiting until somebody presses the button.
        </p>
      </section>

      <section className="rc-flow-tight">
        <h2 className="rc-label rc-section m-0">Where the bonds go</h2>
        <Table
          head={["Outcome", "Reporter's bond", "Appellant's bond"]}
          rows={[
            ["LISTED · ASSERTED stands", "returned", "to the reporter"],
            ["NOT_LISTED", "slashed to the bounty pool", "—"],
            ["OVERTURNED", "to the appellant", "returned"],
            ["CONTESTED", "returned", "returned"],
            ["INCONCLUSIVE", "returned", "—"],
          ]}
        />
        <p className="text-13 m-0">
          Reporting costs something because the harm this product exists to address is a false
          positive, and a register where accusations are free would manufacture them. Refusing to
          decide costs nothing, because a contract that charged for honesty would buy fewer honest
          answers.
        </p>
      </section>

      <section className="rc-flow-tight">
        <h2 className="rc-label rc-section m-0">The determinism boundary</h2>
        <p className="m-0">
          Everything a computer can settle is settled before any model is consulted, and the order is
          part of the contract rather than a convention:
        </p>
        <ol className="m-0 text-13 pl-6">
          <li className="mb-2">
            Fetch the published files. Every validator does this independently and they must agree on
            the bytes.
          </li>
          <li className="mb-2">
            Normalise the subject — lowercase hex for addresses, case-folded and whitespace-collapsed
            for names.
          </li>
          <li className="mb-2">
            Look for byte equality. If it is there, write LISTED and return.{" "}
            <span className="font-semibold">No prompt is ever built on this path.</span>
          </li>
          <li className="mb-2">
            Otherwise extract candidate rows deterministically. Zero candidates means NOT_LISTED, and
            again no prompt runs.
          </li>
          <li className="mb-2">
            Only with candidates in hand is the identity question asked: do these two records denote
            the same legal party? That answer is a judgment, it is recorded as ASSERTED, and it is
            appealable.
          </li>
        </ol>
        <p className="text-13 m-0">
          This is why determinations carry a{" "}
          <span className="rc-label">no inference used</span> plate where it applies. It is a
          stronger statement than a confidence score: not &ldquo;the model was sure&rdquo; but
          &ldquo;no model was asked&rdquo;.
        </p>
      </section>

      <section className="rc-flow-tight">
        <h2 className="rc-label rc-section m-0">Sources read</h2>
        <ul className="m-0 list-none border-t border-ink p-0">
          {PRIMARY_SOURCES.map((source) => (
            <li className="rc-source-row" key={source.file}>
              <span aria-hidden="true" className="rc-source-glyph">
                x
              </span>
              <span className="rc-verbatim">
                <a className="rc-link" href={source.url} rel="noreferrer noopener">
                  {source.file}
                </a>
              </span>
              <span className="text-13">{source.authority}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rc-flow-tight">
        <h2 className="rc-label rc-section m-0">What this cannot do</h2>
        <div className="rc-plate rc-plate-truncated">
          <span className="rc-plate-title">Known blind spot</span>
          <p className="m-0 text-13">
            OFAC hard-truncates the Remarks column of SDN.CSV at 1,000 characters. Digital-currency
            addresses are published inside that column, so on records with long address lists the
            final value is cut mid-address.{" "}
            <span className="rc-tabular font-semibold">
              {DAMAGED_RECORD_COUNT} records in the current file
            </span>{" "}
            are damaged this way. Nobody — not this contract, not a commercial screening service
            reading the same file — can match those addresses in full from this source. Where a
            subject matches only the surviving prefix, the determination is INCONCLUSIVE and says so.
          </p>
        </div>
        <ul className="m-0 text-13 pl-6">
          <li className="mb-2">
            It reads the files named above and nothing else. Other jurisdictions&rsquo; lists, and
            everything unpublished, are outside it.
          </li>
          <li className="mb-2">
            It matches records, not people. It has no view on beneficial ownership, on transaction
            flows, or on whether a counterparty is sanctioned by proximity.
          </li>
          <li className="mb-2">
            It is not legal advice and not a compliance programme. A determination here is a public,
            contestable record — not a licence to transact.
          </li>
          <li className="mb-2">
            A determination is true of the file on the date that file states. Lists change; that is
            what <span className="rc-verbatim">rescreen()</span> is for.
          </li>
        </ul>
      </section>
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-13">
        <thead>
          <tr>
            {head.map((cell) => (
              <th
                className="rc-label border-t border-b border-ink py-2 pr-6 text-left align-bottom"
                key={cell}
                scope="col"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[0]}>
              {row.map((cell, index) => (
                <td
                  className={`border-b border-rule py-2 pr-6 align-top ${
                    index === 0 ? "rc-verbatim whitespace-nowrap" : ""
                  }`}
                  key={index}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
