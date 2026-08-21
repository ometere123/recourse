"use client";

import type { ReactNode } from "react";
import { WalletProvider } from "@/components/wallet-provider";
import { TransactionProvider } from "@/components/transaction-provider";

/**
 * Two providers, both client-side, both holding only local state. There is no
 * query cache and no store: pages read the contract when they mount and say when
 * they last did so.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <WalletProvider>
      <TransactionProvider>{children}</TransactionProvider>
    </WalletProvider>
  );
}
