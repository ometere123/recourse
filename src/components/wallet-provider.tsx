"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { generatePrivateKey } from "genlayer-js";
import type { GenLayerClient } from "genlayer-js/types";
import { createGeneratedClient, createInjectedClient } from "@/lib/genlayer/client";
import type { chain } from "@/lib/genlayer/config";
import {
  clearGeneratedKey,
  loadAck,
  loadGeneratedKey,
  saveAck,
  saveGeneratedKey,
} from "@/lib/storage";

type Client = GenLayerClient<typeof chain>;

export type WalletMode = "none" | "injected" | "generated";

type WalletValue = {
  mode: WalletMode;
  address?: `0x${string}`;
  /** True once the person has been told the generated key is disposable. */
  acknowledged: boolean;
  hasInjected: boolean;
  connecting: boolean;
  error?: string;
  connectInjected: () => Promise<void>;
  useGenerated: () => void;
  importGenerated: (key: string) => void;
  acknowledge: () => void;
  disconnect: () => void;
  /** Undefined when no wallet is available; callers must handle that, not assume. */
  getWriteClient: () => Promise<Client | undefined>;
};

const WalletContext = createContext<WalletValue | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<WalletMode>("none");
  const [address, setAddress] = useState<`0x${string}` | undefined>();
  const [privateKey, setPrivateKey] = useState<`0x${string}` | undefined>();
  const [acknowledged, setAcknowledged] = useState(false);
  const [hasInjected, setHasInjected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | undefined>();

  // Restore a generated key on mount. Never auto-connect an injected wallet:
  // a page load is not consent to reveal an address.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setHasInjected(Boolean(window.ethereum));
      const stored = loadGeneratedKey();
      if (!stored) return;
      try {
        const client = createGeneratedClient(stored);
        setPrivateKey(stored);
        setAddress(client.account?.address as `0x${string}` | undefined);
        setMode("generated");
        setAcknowledged(loadAck());
      } catch {
        clearGeneratedKey();
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const connectInjected = useCallback(async () => {
    setError(undefined);
    const provider = typeof window !== "undefined" ? window.ethereum : undefined;
    if (!provider) {
      setError("No injected wallet was found in this browser.");
      return;
    }
    setConnecting(true);
    try {
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      const next = accounts?.[0];
      if (!next) {
        setError("The wallet returned no account.");
        return;
      }
      setAddress(next as `0x${string}`);
      setPrivateKey(undefined);
      setMode("injected");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The wallet request was rejected.");
    } finally {
      setConnecting(false);
    }
  }, []);

  const useGenerated = useCallback(() => {
    setError(undefined);
    const key = generatePrivateKey() as `0x${string}`;
    try {
      const client = createGeneratedClient(key);
      saveGeneratedKey(key);
      setPrivateKey(key);
      setAddress(client.account?.address as `0x${string}` | undefined);
      setMode("generated");
      setAcknowledged(loadAck());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The key could not be created.");
    }
  }, []);

  const importGenerated = useCallback((raw: string) => {
    setError(undefined);
    const key = raw.trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
      setError("A private key is 0x followed by 64 hex characters.");
      return;
    }
    try {
      const client = createGeneratedClient(key as `0x${string}`);
      saveGeneratedKey(key as `0x${string}`);
      setPrivateKey(key as `0x${string}`);
      setAddress(client.account?.address as `0x${string}` | undefined);
      setMode("generated");
      setAcknowledged(loadAck());
    } catch {
      setError("That key could not be read.");
    }
  }, []);

  const acknowledge = useCallback(() => {
    saveAck(true);
    setAcknowledged(true);
  }, []);

  const disconnect = useCallback(() => {
    clearGeneratedKey();
    setPrivateKey(undefined);
    setAddress(undefined);
    setAcknowledged(false);
    setMode("none");
    setError(undefined);
  }, []);

  const getWriteClient = useCallback(async () => {
    if (mode === "generated" && privateKey) return createGeneratedClient(privateKey);
    if (mode === "injected" && address) return createInjectedClient(address);
    return undefined;
  }, [mode, privateKey, address]);

  const value = useMemo<WalletValue>(
    () => ({
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
      getWriteClient,
    }),
    [
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
      getWriteClient,
    ],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletValue {
  const value = useContext(WalletContext);
  if (!value) throw new Error("useWallet must be used inside WalletProvider.");
  return value;
}
