import { normaliseIsoZ } from "./contract-types";
import type { U256String } from "./contract-types";

/* ------------------------------------------------------------------------- *
 * GEN amounts
 *
 * u256 values arrive from the contract as 18-decimal decimal STRINGS. Parsing
 * one into a JS number loses precision above ~9 GEN, so every conversion here
 * goes through BigInt and string surgery, never Number().
 * ------------------------------------------------------------------------- */

const DECIMALS = 18n;
const ONE = 10n ** DECIMALS;

/** `"250000000000000000000"` → `"250"`. Trailing zeros trimmed, up to 4 places. */
export function formatGen(wei: U256String | bigint | undefined, places = 4): string {
  if (wei === undefined || wei === "") return "n/a";
  let value: bigint;
  try {
    value = typeof wei === "bigint" ? wei : BigInt(wei);
  } catch {
    return "n/a";
  }
  const negative = value < 0n;
  if (negative) value = -value;
  const whole = value / ONE;
  const fraction = value % ONE;
  let out = groupDigits(whole.toString());
  if (fraction > 0n && places > 0) {
    const padded = fraction.toString().padStart(Number(DECIMALS), "0").slice(0, places);
    const trimmed = padded.replace(/0+$/, "");
    if (trimmed) out = `${out}.${trimmed}`;
  }
  return negative ? `-${out}` : out;
}

/** Human input (`"250"`, `"0.5"`) → wei string. Returns undefined if unparseable. */
export function parseGen(input: string): bigint | undefined {
  const trimmed = input.trim();
  if (!trimmed || !/^\d*\.?\d*$/.test(trimmed) || trimmed === ".") return undefined;
  const [whole = "0", fraction = ""] = trimmed.split(".");
  if (fraction.length > Number(DECIMALS)) return undefined;
  const padded = fraction.padEnd(Number(DECIMALS), "0");
  try {
    return BigInt(whole || "0") * ONE + BigInt(padded || "0");
  } catch {
    return undefined;
  }
}

function groupDigits(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/* ------------------------------------------------------------------------- *
 * Addresses
 * ------------------------------------------------------------------------- */

export const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export function isAddress(value: string): boolean {
  return ADDRESS_RE.test(value.trim());
}

/**
 * Shorten for a table cell. Case is preserved exactly as given: EVM addresses
 * are published in EIP-55 mixed case and the checksum lives in that casing, so
 * the UI never re-cases an address it was handed.
 */
export function shortenAddress(value: string, lead = 10, tail = 8): string {
  const trimmed = value.trim();
  if (trimmed.length <= lead + tail + 1) return trimmed;
  return `${trimmed.slice(0, lead)}…${trimmed.slice(-tail)}`;
}

/** Entity names get elided at a word boundary rather than mid-word. */
export function shortenName(value: string, max = 38): string {
  if (value.length <= max) return value;
  const cut = value.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/* ------------------------------------------------------------------------- *
 * Time
 *
 * The contract writes ISO strings without a zone. They are UTC, and they are
 * displayed as UTC: a sanctions record dated by the viewer's local clock would
 * be a different fact from the one on chain.
 * ------------------------------------------------------------------------- */

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** `2026-08-19T14:02:11` → `19 Aug 2026 · 14:02 UTC`. */
export function displayTime(value: string): string {
  if (!value) return "not recorded";
  const ms = Date.parse(normaliseIsoZ(value));
  if (Number.isNaN(ms)) return value;
  const d = new Date(ms);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} · ${hh}:${mm} UTC`;
}

/** `2026-08-19` → `19 Aug 2026`. Accepts a full timestamp too. */
export function displayDate(value: string): string {
  if (!value) return "not recorded";
  const ms = Date.parse(normaliseIsoZ(value.length === 10 ? `${value}T00:00:00` : value));
  if (Number.isNaN(ms)) return value;
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * Time remaining, in words a clerk would use. Returns `null` once elapsed, so
 * callers must decide what an expired window looks like rather than being
 * handed a misleading "0 hours".
 */
export function countdown(deadline: string, now = Date.now()): string | null {
  if (!deadline) return null;
  const ms = Date.parse(normaliseIsoZ(deadline)) - now;
  if (Number.isNaN(ms) || ms <= 0) return null;
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} hr`;
  return `${Math.floor(hours / 24)} days`;
}

/** How long ago, for the transaction rail. */
export function timeAgo(iso: string, now = Date.now()): string {
  const ms = now - Date.parse(normaliseIsoZ(iso));
  if (Number.isNaN(ms)) return "";
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** `0x369c3ad9…b85c6b`. Digests are long and the head and tail are what matter. */
export function shortenDigest(digest: string): string {
  if (!digest) return "not stored";
  const body = digest.startsWith("0x") ? digest.slice(2) : digest;
  if (body.length <= 20) return digest;
  return `${body.slice(0, 12)}…${body.slice(-6)}`;
}

/** Uppercase enum → sentence case for prose contexts. `NOT_LISTED` → `Not listed`. */
export function humaniseEnum(value: string): string {
  if (!value) return "";
  const words = value.toLowerCase().split("_").join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
