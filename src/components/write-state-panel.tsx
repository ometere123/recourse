"use client";

import { explorerTxUrl } from "@/lib/genlayer/config";
import {
  RETRYABLE_STAGES,
  TX_STAGE_ORDER,
  type ConsensusPhase,
  type SourceRow,
  type TxStage,
  type WriteState,
} from "@/lib/contract-types";
import { SourceMatrix } from "./source-matrix";

/**
 * The ten-state write lifecycle, printed.
 *
 * The distinction this component exists to protect: three of these states are
 * NOT findings. If a source was unreachable, if the node was busy, or if the
 * validators could not produce a usable output, then nothing was written about
 * the subject — and the screen must not look like a determination. Those three
 * print on a DASHED panel with a VOID where the impression would be. A stamp is
 * reserved for a determination that actually exists.
 *
 * The fourth failure, [EXPECTED], is different in kind: the contract examined the
 * request and refused it for a stated reason. That is a fact about the request,
 * so it is printed as a ruled notice against the field it concerns, not as a
 * void.
 */

const PHASE_WORD: Record<ConsensusPhase, string> = {
  "fetching-sources": "Fetching primary sources",
  scanning: "Scanning for candidate rows",
  "judging-identity": "Identity round: is this the same party?",
};

const PHASE_STAGE: Record<ConsensusPhase, TxStage> = {
  "fetching-sources": "PROPOSING",
  scanning: "COMMITTING",
  "judging-identity": "REVEALING",
};

export function WriteStatePanel({
  state,
  sources,
}: {
  state: WriteState;
  sources?: SourceRow[];
}) {
  switch (state.kind) {
    case "idle":
      return null;

    case "validating":
      return (
        <Notice title="Checking the form">
          Validating locally before anything is signed. No transaction has been created.
        </Notice>
      );

    case "wallet-pending":
      return (
        <Notice title="Waiting for your wallet">
          <p className="m-0">
            Confirm <Method name={state.method} /> in your wallet. The bond is{" "}
            <span className="rc-tabular font-semibold">{state.cost} GEN</span> and it is
            transferred by the contract, not by this page.
          </p>
          <p className="text-13 m-0">
            Nothing has been submitted yet. Rejecting costs nothing.
          </p>
        </Notice>
      );

    case "submitted":
      return (
        <Notice title="Submitted to consensus">
          <Ruler stage="PENDING" />
          <p className="m-0">
            <Method name={state.method} /> is in the mempool. Validators have not begun.
          </p>
          <TxLink hash={state.hash} />
        </Notice>
      );

    case "consensus-running":
      return (
        <Notice title="Consensus running">
          <Ruler stage={PHASE_STAGE[state.phase]} />
          <p className="m-0">{PHASE_WORD[state.phase]}</p>
          {sources && sources.length > 0 ? (
            <SourceMatrix rows={sources} caption="Sources this round" />
          ) : null}
          <p className="text-13 m-0">
            Every validator fetches the files independently and must agree on what they contain.
            A round takes tens of seconds. Leaving this page does not cancel it.
          </p>
          <TxLink hash={state.hash} />
        </Notice>
      );

    case "success":
      return (
        <Notice title={RETRYABLE_STAGES.has(state.stage) ? "Round did not settle" : "Written"}>
          <Ruler stage={state.stage} />
          {RETRYABLE_STAGES.has(state.stage) ? (
            <p className="m-0">
              The round ended <span className="font-semibold">{state.stage}</span>. That is a
              statement about the validator set, not about the subject: no determination was
              recorded. The same call can be submitted again.
            </p>
          ) : (
            <p className="m-0">
              <Method name={state.method} /> was accepted and the record is on chain.
            </p>
          )}
          <TxLink hash={state.hash} />
        </Notice>
      );

    /* ----------------------------------------------------------------- *
     * A fact about the request.
     * ----------------------------------------------------------------- */
    case "EXPECTED":
      return (
        <div className="rc-plate rc-plate-stamp">
          <span className="rc-plate-title">Not accepted</span>
          <div className="rc-flow-tight">
            {state.field ? <p className="rc-label m-0">Field: {state.field}</p> : null}
            <p className="m-0">{state.message}</p>
            <p className="text-13 m-0">
              The contract examined this request and refused it. Nothing was spent and no
              determination was recorded.
            </p>
          </div>
        </div>
      );

    /* ----------------------------------------------------------------- *
     * NOT findings. Dashed panel, void impression.
     * ----------------------------------------------------------------- */
    case "EXTERNAL":
      return (
        <Unstamped title="Source unavailable">
          <p className="m-0">{state.message}</p>
          <p className="text-13 m-0">
            <span className="rc-verbatim">{state.source}</span> could not be read, so the round
            could not compare anything to it.{" "}
            <span className="font-semibold">
              This is not a clearance and it is not a listing.
            </span>{" "}
            The subject is exactly as undetermined as it was before.
          </p>
        </Unstamped>
      );

    case "TRANSIENT":
      return (
        <Unstamped title="Network, not finding">
          <p className="m-0">{state.message}</p>
          <p className="text-13 m-0">
            The request did not reach consensus. Nothing was written. Try again.
          </p>
        </Unstamped>
      );

    case "LLM_ERROR":
      return (
        <Unstamped title="No usable output">
          <p className="m-0">{state.message}</p>
          <p className="text-13 m-0">
            The validators returned something the contract could not read as a verdict, so it
            refused to record one.{" "}
            <span className="font-semibold">An unreadable answer is not an answer</span>, and
            writing a guess in its place is the failure mode this contract is built to avoid.
          </p>
        </Unstamped>
      );
  }
}

/* ------------------------------------------------------------------------- *
 * Parts
 * ------------------------------------------------------------------------- */

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rc-plate">
      <span className="rc-plate-title">{title}</span>
      <div className="rc-flow-tight">{children}</div>
    </div>
  );
}

function Unstamped({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rc-plate rc-plate-unstamped">
      <span className="rc-plate-title">{title}</span>
      <div className="rc-flow-tight">
        <span className="rc-void-stamp">No determination recorded</span>
        {children}
      </div>
    </div>
  );
}

function Method({ name }: { name: string }) {
  return <span className="rc-verbatim">{name}()</span>;
}

function TxLink({ hash }: { hash: string }) {
  return (
    <p className="text-13 m-0">
      <a className="rc-link rc-verbatim break-all" href={explorerTxUrl(hash)} rel="noreferrer noopener" target="_blank">
        {hash}
      </a>
    </p>
  );
}

/**
 * The six healthy stages as ticks on a ruler. A retryable end state prints the
 * remaining ticks dashed rather than filled: the round stopped, it did not fail.
 */
export function Ruler({ stage }: { stage: TxStage }) {
  const retryable = RETRYABLE_STAGES.has(stage);
  const reached = TX_STAGE_ORDER.indexOf(stage);
  return (
    <div>
      <div className="rc-ruler" role="presentation">
        {TX_STAGE_ORDER.map((name, index) => (
          <span
            key={name}
            className={`rc-tick ${
              retryable ? "rc-tick-retry" : index <= reached ? "rc-tick-done" : ""
            }`}
          />
        ))}
      </div>
      <p className="rc-label mt-2">
        {retryable ? `${stage} · retryable` : stage}
      </p>
    </div>
  );
}
