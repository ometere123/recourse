"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { fetchAppeal, fetchDamagedRecordCount, fetchDetermination } from "@/lib/data-source";
import { type Appeal, type Determination } from "@/lib/contract-types";
import { DeterminationView } from "./determination-view";
import { WriteActions } from "./write-actions";

/**
 * Reads one determination from the contract and prints it. Mounted by a thin
 * server wrapper that awaits `params`, because in Next 16 route params are a
 * Promise and this component needs to be a client component to hold the write
 * state.
 */
export function DeterminationDetail({ id }: { id: string }) {
  const [determination, setDetermination] = useState<Determination | undefined>();
  const [appeal, setAppeal] = useState<Appeal | undefined>();
  const [damaged, setDamaged] = useState<number | undefined>();
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [error, setError] = useState<string | undefined>();

  const load = useCallback(async () => {
    try {
      const record = await fetchDetermination(id);
      if (!record) {
        setState("missing");
        return;
      }
      setDetermination(record);
      setState("ready");
      const [linked, count] = await Promise.all([
        record.appeal_id ? fetchAppeal(record.appeal_id) : Promise.resolve(undefined),
        fetchDamagedRecordCount(),
      ]);
      setAppeal(linked);
      setDamaged(count);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The contract could not be reached.");
      setState("error");
    }
  }, [id]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void load());
    return () => window.cancelAnimationFrame(frame);
  }, [load]);

  if (state === "loading") {
    return (
      <p className="rc-label m-0">
        <span className="rc-pending-bar mr-3" />
        Reading determination {id}
      </p>
    );
  }

  if (state === "missing") {
    return (
      <div className="rc-flow">
        <h1 className="font-display text-34 font-semibold m-0">No such determination</h1>
        <p className="m-0">
          The contract holds no record under <span className="rc-verbatim">{id}</span>. That is a
          fact about the identifier, not a fault:{" "}
          <Link className="rc-link" href="/determinations">
            the register
          </Link>{" "}
          lists everything that exists.
        </p>
      </div>
    );
  }

  if (state === "error" || !determination) {
    return (
      <div className="rc-plate rc-plate-unstamped">
        <span className="rc-plate-title">Contract unreachable</span>
        <div className="rc-flow-tight">
          <span className="rc-void-stamp">Nothing was read</span>
          <p className="m-0 text-13">{error}</p>
          <p className="m-0 text-13">
            This says nothing about the subject. No determination was read, so none is shown.
          </p>
          <button className="rc-btn" onClick={() => void load()} type="button">
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <DeterminationView
      actions={<WriteActions appeal={appeal} determination={determination} />}
      appeal={appeal}
      damagedRecords={damaged}
      determination={determination}
    />
  );
}
