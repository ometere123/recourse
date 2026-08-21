"use client";

import { useState } from "react";
import { useWallet } from "./wallet-provider";
import { shortenAddress } from "@/lib/format";
import { CHAIN_NAME, explorerAddressUrl } from "@/lib/genlayer/config";

/**
 * Wallet connect. Two honest options and no marketing.
 *
 * A generated key is offered because the alternative — a wall in front of a
 * public record — would make the appeal surface unreadable to the people most
 * likely to need it. The tradeoff is stated in the copy rather than hidden
 * behind a tooltip: the key lives in this browser's localStorage, it is
 * disposable, and it must never hold value.
 */
export function WalletBar() {
  const {
    mode,
    address,
    acknowledged,
    hasInjected,
    connecting,
    error,
    connectInjected,
    useGenerated,
    importGenerated,
    acknowledge,
    disconnect,
  } = useWallet();
  const [importing, setImporting] = useState(false);
  const [key, setKey] = useState("");

  if (mode === "none") {
    return (
      <div className="rc-flow-tight">
        <div className="flex flex-wrap gap-3">
          <button
            className="rc-btn rc-btn-process"
            disabled={!hasInjected || connecting}
            onClick={() => void connectInjected()}
            type="button"
          >
            {connecting ? "Waiting for wallet" : "Connect wallet"}
          </button>
          <button className="rc-btn" onClick={useGenerated} type="button">
            Generate a throwaway key
          </button>
          <button className="rc-btn" onClick={() => setImporting((v) => !v)} type="button">
            Import a key
          </button>
        </div>
        {!hasInjected ? (
          <p className="text-12 m-0">
            No injected wallet was detected in this browser, so reads work and writes need a
            generated key.
          </p>
        ) : null}
        {importing ? (
          <form
            className="rc-flow-tight"
            onSubmit={(event) => {
              event.preventDefault();
              importGenerated(key);
            }}
          >
            <label className="rc-label block" htmlFor="wallet-key">
              Private key
            </label>
            <input
              autoComplete="off"
              className="rc-input rc-input-verbatim"
              id="wallet-key"
              onChange={(event) => setKey(event.target.value)}
              placeholder="0x…"
              spellCheck={false}
              value={key}
            />
            <button className="rc-btn" type="submit">
              Use this key
            </button>
          </form>
        ) : null}
        {error ? <p className="text-13 text-stamp m-0">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="rc-flow-tight">
      <div className="rc-field-row">
        <span className="rc-label">
          {mode === "injected" ? "Wallet" : "Throwaway key"}
        </span>
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
            "—"
          )}
          <span className="rc-label ml-3">{CHAIN_NAME}</span>
        </span>
      </div>

      {mode === "generated" && !acknowledged ? (
        <div className="rc-plate rc-plate-unstamped">
          <span className="rc-plate-title">Read this once</span>
          <div className="rc-flow-tight">
            <p className="m-0 text-13">
              This key was created in your browser and is stored in localStorage in plain text.
              Anything with access to this browser profile can spend from it. It exists so you can
              exercise the contract without installing anything. Do not fund it beyond test
              amounts, and do not reuse it anywhere.
            </p>
            <button className="rc-btn" onClick={acknowledge} type="button">
              Understood
            </button>
          </div>
        </div>
      ) : null}

      <button className="rc-btn" onClick={disconnect} type="button">
        {mode === "injected" ? "Disconnect" : "Forget this key"}
      </button>
      {error ? <p className="text-13 text-stamp m-0">{error}</p> : null}
    </div>
  );
}
