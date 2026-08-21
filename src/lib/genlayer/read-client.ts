import { createAccount, createClient } from "genlayer-js";
import { chain, GENLAYER_ENDPOINT } from "./config";

/**
 * A throwaway-account client for `view` calls. Reads need no signer, and
 * `check()` in particular must work for a visitor with no wallet at all —
 * it is the public integration surface.
 */
export function createReadClient() {
  return createClient({ chain, endpoint: GENLAYER_ENDPOINT, account: createAccount() });
}
