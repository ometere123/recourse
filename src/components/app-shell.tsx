"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { WalletBar } from "./wallet-bar";
import { TransactionRail } from "./transaction-rail";
import { DATA_MODE } from "@/lib/data-source";
import { CONTRACT_ADDRESS, explorerAddressUrl } from "@/lib/genlayer/config";
import { shortenAddress } from "@/lib/format";

/**
 * The shell is a printed form's masthead and footer: a heavy rule, a title, a
 * register of the sections, and — because this product's whole claim is that its
 * findings are auditable — the address of the contract it is reading, in the
 * masthead, where a bank's logo would be.
 */

const NAV = [
  { href: "/check", label: "Check" },
  { href: "/determinations", label: "Determinations" },
  { href: "/report", label: "Report" },
  { href: "/docs", label: "Docs" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [walletOpen, setWalletOpen] = useState(false);

  return (
    <>
      <a className="rc-skip" href="#main">
        Skip to content
      </a>

      <header>
        <div className="rc-sheet pt-8">
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
            <div>
              <Link className="no-underline" href="/">
                <span className="font-display text-34 font-semibold block leading-none">
                  Recourse
                </span>
              </Link>
              <p className="rc-label mt-2 mb-0">
                Address screening with a determination you can appeal
              </p>
            </div>
            <button
              aria-expanded={walletOpen}
              className="rc-btn"
              onClick={() => setWalletOpen((value) => !value)}
              type="button"
            >
              Wallet
            </button>
          </div>

          {walletOpen ? (
            <div className="mt-6">
              <WalletBar />
            </div>
          ) : null}
        </div>

        <div className="rc-sheet mt-6">
          <div className="rc-registration" />
        </div>

        <nav aria-label="Sections" className="rc-sheet">
          <ul className="m-0 flex flex-wrap gap-x-8 gap-y-2 list-none p-0 py-4">
            {NAV.map((item) => {
              const current = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    aria-current={current ? "page" : undefined}
                    className={`rc-label no-underline ${
                      current ? "text-stamp underline decoration-2 underline-offset-[6px]" : ""
                    }`}
                    href={item.href}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
          <hr className="rc-rule" />
        </nav>
      </header>

      <main className="rc-sheet py-8" id="main">
        {DATA_MODE === "fixture" ? <FixtureNotice /> : null}
        {children}
      </main>

      <footer className="mt-16">
        <div className="rc-sheet">
          <div className="rc-registration" />
          <div className="rc-flow-tight py-6">
            <p className="text-13 m-0">
              Every determination on this site is a record written by an Intelligent Contract on
              GenLayer, quoting a file published by a sanctions authority. This site holds no
              database and no copy of any list: it reads the contract and prints what it says.
            </p>
            <p className="text-12 m-0">
              {CONTRACT_ADDRESS ? (
                <>
                  Contract{" "}
                  <a
                    className="rc-link rc-verbatim"
                    href={explorerAddressUrl(CONTRACT_ADDRESS)}
                    rel="noreferrer noopener"
                    target="_blank"
                  >
                    {shortenAddress(CONTRACT_ADDRESS, 12, 10)}
                  </a>
                </>
              ) : (
                "No contract configured — fixture mode."
              )}
            </p>
            <p className="text-12 m-0">
              Not legal advice and not a compliance product. A determination here is a public,
              contestable record, not a licence to transact.
            </p>
          </div>
        </div>
      </footer>

      <TransactionRail />
    </>
  );
}

/**
 * Fixture mode is stated plainly at the top of every page. A screening product
 * that let a viewer mistake sample data for a live determination would be
 * dishonest in exactly the way this design exists to prevent.
 */
function FixtureNotice() {
  return (
    <div className="rc-plate rc-plate-unstamped mb-8">
      <span className="rc-plate-title">Fixture mode</span>
      <p className="m-0 text-13">
        <span className="rc-void-stamp mr-3">Not live</span>
        No contract address is configured, so these determinations are fixtures. The rows quoted in
        them are real bytes from real published files, but the determinations themselves were not
        written by a contract and no bond was ever posted. Set{" "}
        <span className="rc-verbatim">NEXT_PUBLIC_RECOURSE_CONTRACT</span> to read a deployment.
      </p>
    </div>
  );
}
