"use client";

import { useCallback, useRef, useState } from "react";
import type { CalldataEncodable } from "genlayer-js/types";
import type { TransactionHash } from "genlayer-js/types";
import { writeContract, waitAccepted } from "./genlayer/contract";
import { CONTRACT_ADDRESS } from "./genlayer/config";
import type { ConsensusPhase, TxStage, WriteState } from "./contract-types";

/**
 * One place where a write becomes a screen state.
 *
 * The classification below is the load-bearing part. A thrown Error from a
 * GenLayer write can mean four completely different things, and three of them
 * are not findings about the subject. Guessing wrongly here is how a UI ends up
 * telling someone their address was cleared when in truth OFAC's server was
 * down, so the default is the conservative one: unless the message positively
 * identifies a contract-level refusal, the failure is treated as "nothing was
 * written", never as an outcome.
 */

type Submit = {
  method: string;
  args: CalldataEncodable[];
  value: bigint;
  /** Human bond amount for the wallet-pending copy. */
  cost: string;
  label: string;
  subjectId?: string;
  /** Phases to walk while the round runs, for the named-source matrix. */
  phases?: ConsensusPhase[];
};

type UseWrite = {
  state: WriteState;
  phase: ConsensusPhase;
  submit: (
    getClient: () => Promise<unknown>,
    options: Submit,
    onTracked?: (hash: `0x${string}`) => void,
  ) => Promise<{ ok: boolean; stage?: TxStage }>;
  reset: () => void;
  expected: (message: string, field?: string) => void;
};

export function useWrite(): UseWrite {
  const [state, setState] = useState<WriteState>({ kind: "idle" });
  const [phase, setPhase] = useState<ConsensusPhase>("fetching-sources");
  const timers = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  }, []);

  const reset = useCallback(() => {
    clearTimers();
    setState({ kind: "idle" });
  }, [clearTimers]);

  const expected = useCallback((message: string, field?: string) => {
    setState({ kind: "EXPECTED", message, field });
  }, []);

  const submit = useCallback<UseWrite["submit"]>(
    async (getClient, options, onTracked) => {
      clearTimers();
      setState({ kind: "validating" });

      if (!CONTRACT_ADDRESS) {
        setState({
          kind: "EXPECTED",
          message:
            "No contract address is configured, so this build is reading the fixture set. Set NEXT_PUBLIC_RECOURSE_CONTRACT to write to a deployed contract.",
        });
        return { ok: false };
      }

      const client = (await getClient()) as Parameters<typeof writeContract>[0] | undefined;
      if (!client) {
        setState({
          kind: "EXPECTED",
          message: "Connect a wallet first. Writes are signed in your browser, never here.",
        });
        return { ok: false };
      }

      setState({ kind: "wallet-pending", method: options.method, cost: options.cost });

      let hash: `0x${string}`;
      try {
        hash = (await writeContract(
          client,
          options.method,
          options.args,
          options.value,
        )) as `0x${string}`;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (isRejection(message)) {
          setState({ kind: "idle" });
          return { ok: false };
        }
        setState(classify(message));
        return { ok: false };
      }

      onTracked?.(hash);
      setState({ kind: "submitted", hash, method: options.method });

      // Walk the named phases while the round runs. These are the legs the
      // contract actually performs in order, so the matrix beside them is a
      // description of the round rather than a progress-bar animation.
      const phases = options.phases ?? ["fetching-sources", "scanning"];
      setPhase(phases[0]);
      setState({ kind: "consensus-running", hash, method: options.method, phase: phases[0] });
      phases.slice(1).forEach((next, index) => {
        const id = window.setTimeout(() => {
          setPhase(next);
          setState((current) =>
            current.kind === "consensus-running" && current.hash === hash
              ? { ...current, phase: next }
              : current,
          );
        }, 6000 * (index + 1));
        timers.current.push(id);
      });

      try {
        await waitAccepted(client, hash as TransactionHash);
        clearTimers();
        setState({ kind: "success", hash, method: options.method, stage: "FINALIZED" });
        return { ok: true, stage: "FINALIZED" };
      } catch (error) {
        clearTimers();
        const message = error instanceof Error ? error.message : String(error);
        const stage = retryableStageIn(message);
        if (stage) {
          // A rotated-out or timed-out round is not a determination. It prints as
          // a stopped ruler, not as a red failure.
          setState({ kind: "success", hash, method: options.method, stage });
          return { ok: false, stage };
        }
        setState(classify(message, hash));
        return { ok: false };
      }
    },
    [clearTimers],
  );

  return { state, phase, submit, reset, expected };
}

/* ------------------------------------------------------------------------- *
 * Classification
 * ------------------------------------------------------------------------- */

function isRejection(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("user rejected") ||
    lower.includes("user denied") ||
    lower.includes("request rejected") ||
    lower.includes("4001")
  );
}

function retryableStageIn(message: string): TxStage | undefined {
  if (message.includes("VALIDATORS_TIMEOUT")) return "VALIDATORS_TIMEOUT";
  if (message.includes("LEADER_TIMEOUT")) return "LEADER_TIMEOUT";
  if (message.includes("UNDETERMINED")) return "UNDETERMINED";
  return undefined;
}

/**
 * `EXPECTED` requires positive evidence that the CONTRACT refused the call. The
 * contract's own guards raise with these words, and nothing else in the stack
 * does.
 */
const CONTRACT_REFUSALS = [
  "already",
  "not appealable",
  "no determination",
  "unknown determination",
  "bond",
  "insufficient",
  "deadline",
  "window has closed",
  "window is still open",
  "not the reporter",
  "invalid subject",
  "invalid grounds",
  "must be",
  "requires",
];

const EXTERNAL_SIGNS = [
  "web.request",
  "sanctionslistservice",
  "scsanctions",
  "http 4",
  "http 5",
  "status 5",
  "status 4",
  "could not fetch",
  "unreachable",
  "dns",
  "certificate",
  "ssl",
];

const TRANSIENT_SIGNS = [
  "rate limit",
  "queuepool",
  "429",
  "econnreset",
  "etimedout",
  "socket",
  "failed to fetch",
  "network error",
  "gateway",
  "503",
  "timeout",
];

const LLM_SIGNS = [
  "unexpected token",
  "json",
  "could not parse",
  "unparseable",
  "eq_principle",
  "non-deterministic block",
  "leader receipt",
  "no consensus",
];

function classify(message: string, hash?: `0x${string}`): WriteState {
  const lower = message.toLowerCase();
  const suffix = hash ? ` Transaction: ${hash}` : "";

  if (EXTERNAL_SIGNS.some((sign) => lower.includes(sign))) {
    const source = lower.includes("scsanctions")
      ? "consolidated.xml (UN Security Council)"
      : "sanctionslistservice.ofac.treas.gov";
    return { kind: "EXTERNAL", message: message + suffix, source };
  }
  if (LLM_SIGNS.some((sign) => lower.includes(sign))) {
    return { kind: "LLM_ERROR", message: message + suffix };
  }
  if (TRANSIENT_SIGNS.some((sign) => lower.includes(sign))) {
    return { kind: "TRANSIENT", message: message + suffix };
  }
  if (
    lower.includes("execution failed") &&
    CONTRACT_REFUSALS.some((sign) => lower.includes(sign))
  ) {
    return { kind: "EXPECTED", message: message + suffix };
  }
  // Unclassified. Print it as "nothing was written", because the alternative —
  // dressing an unknown fault as a determination — is the one unacceptable
  // outcome in this product.
  return { kind: "TRANSIENT", message: message + suffix };
}
