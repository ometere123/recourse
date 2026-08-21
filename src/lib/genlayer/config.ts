import { localnet, studionet, testnetAsimov, testnetBradbury } from "genlayer-js/chains";

/**
 * The deployed Recourse Intelligent Contract. When this is unset the app runs
 * against the on-disk fixture set instead (see `lib/data-source.ts`) — the
 * single gate between explorable-now and wired-later.
 */
export const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_RECOURSE_CONTRACT as
  | `0x${string}`
  | undefined;

export const GENLAYER_ENDPOINT =
  process.env.NEXT_PUBLIC_GENLAYER_ENDPOINT ?? "https://studio.genlayer.com/api";

export const CHAIN_NAME = (process.env.NEXT_PUBLIC_GENLAYER_CHAIN ?? "studionet") as
  | "studionet"
  | "localnet"
  | "testnetAsimov"
  | "testnetBradbury";

const CHAINS = { studionet, localnet, testnetAsimov, testnetBradbury } as const;

export const chain = CHAINS[CHAIN_NAME];

// genlayer-js's bundled chain metadata for studionet still points at
// genlayer-explorer.vercel.app; the live StudioNet explorer is
// explorer-studio.genlayer.com. Override explicitly rather than trusting
// chain.blockExplorers.
export const EXPLORER_BASE = "https://explorer-studio.genlayer.com";
export const explorerTxUrl = (hash: string) => `${EXPLORER_BASE}/tx/${hash}`;
export const explorerAddressUrl = (address: string) => `${EXPLORER_BASE}/address/${address}`;

/** Every method the frontend calls. Checked against the deployed schema. */
export const REQUIRED_METHODS = [
  "report",
  "screen",
  "corroborate",
  "rescreen",
  "appeal",
  "adjudicate_appeal",
  "expire_appeal_window",
  "refresh_source_health",
  "check",
  "get_determination",
  "get_appeal",
  "list_determinations",
  "list_appeals",
  "get_source_health",
  "stats",
  "prefilter_fingerprint",
];

/**
 * The primary sources the contract fetches inside consensus. Named here so the
 * UI can print the file it is waiting on — a loading row without a source name
 * is forbidden by the design system, and these are the names it uses.
 */
export const PRIMARY_SOURCES = [
  {
    file: "SDN.CSV",
    list: "OFAC_SDN" as const,
    url: "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.CSV",
    authority: "US Department of the Treasury, Office of Foreign Assets Control",
  },
  {
    file: "ALT.CSV",
    list: "OFAC_ALT" as const,
    url: "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/ALT.CSV",
    authority: "US Department of the Treasury, Office of Foreign Assets Control",
  },
  {
    file: "consolidated.xml",
    list: "UN_CONSOLIDATED" as const,
    url: "https://scsanctions.un.org/resources/xml/en/consolidated.xml",
    authority: "United Nations Security Council",
  },
];
