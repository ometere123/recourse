"use client";

import { useWallet } from "./wallet-provider";
import { shortenAddress } from "@/lib/format";
import { CHAIN_NAME, explorerAddressUrl } from "@/lib/genlayer/config";

/**
 * Wallet connect, in the masthead. An injected wallet is the only signer, so
 * there is nothing to choose between and no panel to open: the button asks the
 * wallet directly, and once a session is open the same spot offers to end it.
 *
 * Reading the register never needs any of this.
 */
export function WalletBar() {
  const { mode, address, hasInjected, connecting, error, connectInjected, disconnect } = useWallet();

  if (mode === "none") {
    return (
      <div className="flex flex-col items-start gap-1">
        <button
          className="rc-btn rc-btn-process"
          disabled={connecting}
          onClick={() => void connectInjected()}
          type="button"
        >
          {connecting ? "Waiting for wallet" : "Connect wallet"}
        </button>
        {!hasInjected ? (
          <span className="text-12 max-w-[24ch]">
            No wallet extension detected. Reading the register does not need one.
          </span>
        ) : null}
        {error ? <span className="text-13 text-stamp max-w-[32ch]">{error}</span> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-13">
        {address ? (
          <a
            className="rc-link rc-verbatim"
            href={explorerAddressUrl(address)}
            rel="noreferrer noopener"
            target="_blank"
          >
            {shortenAddress(address)}
          </a>
        ) : (
          "address unavailable"
        )}
        <span className="rc-label ml-3">{CHAIN_NAME}</span>
      </span>
      <button className="rc-btn" onClick={disconnect} type="button">
        Disconnect wallet
      </button>
      {error ? <span className="text-13 text-stamp max-w-[32ch]">{error}</span> : null}
    </div>
  );
}
