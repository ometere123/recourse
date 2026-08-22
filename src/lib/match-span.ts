import type { Determination } from "./contract-types";

/**
 * Which span of the fetched row The Row should mark.
 *
 * For LISTED and INCONCLUSIVE this is arithmetic: the subject, or the part of the
 * subject that survived the authority's field limit, appears literally in the
 * bytes. For an ASSERTED-family determination it cannot be arithmetic, because
 * the whole point of that state is that the subject does NOT appear literally —
 * a name was romanised differently, or abbreviated, and validators judged the two
 * to denote the same party.
 *
 * So the marker picks the quoted field in the row that is closest to the subject
 * and says exactly that in the label. It never claims byte equality it does not
 * have, and if nothing is close enough the row prints unmarked rather than
 * marked approximately. Guessing a caret position would be a small lie in the
 * one element of this product that exists to be checkable.
 */

export type MarkedSpan = {
  highlight: string;
  matchLabel: string;
  cut?: { survivingLen: number; totalLen: number };
};

export function markedSpanFor(d: Determination): MarkedSpan | undefined {
  if (!d.matched_entry) return undefined;

  if (d.status === "LISTED") {
    return {
      highlight: d.subject,
      matchLabel:
        "exact match. The subject appears byte-for-byte at this offset in the published row",
    };
  }

  if (d.status === "INCONCLUSIVE" && d.surviving_prefix_len > 0) {
    return {
      highlight: d.subject.slice(0, d.surviving_prefix_len),
      matchLabel: `surviving prefix. All ${d.surviving_prefix_len} published characters match, and the rest of the value was cut off by the authority, not by this contract`,
      cut: { survivingLen: d.surviving_prefix_len, totalLen: d.subject.length },
    };
  }

  const candidate = closestQuotedField(d.matched_entry, d.subject);
  if (!candidate) return { highlight: "", matchLabel: "no byte-exact span" };

  return {
    highlight: candidate,
    matchLabel:
      "candidate field. Not byte-equal to the subject. Validators judged this field to denote the same party, and that judgment is what an appeal contests",
  };
}

/** Every `"…"` field in a CSV row, plus bare `<tag>` values from the UN XML. */
function quotedFields(bytes: string): string[] {
  const fields = [...bytes.matchAll(/"([^"]{3,})"/g)].map((match) => match[1]);
  const xml = [...bytes.matchAll(/>([^<>\n]{3,})</g)].map((match) => match[1].trim());
  return [...fields, ...xml].filter((value) => value && value !== "-0-");
}

export function closestQuotedField(bytes: string, subject: string): string | undefined {
  const target = normalise(subject);
  if (!target) return undefined;
  let best: { value: string; score: number } | undefined;
  for (const field of quotedFields(bytes)) {
    const score = dice(target, normalise(field));
    if (!best || score > best.score) best = { value: field, score };
  }
  // Below this the "closest" field is not close to anything. Print no caret.
  return best && best.score >= 0.34 ? best.value : undefined;
}

function normalise(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

/** Sørensen–Dice over character bigrams. Cheap, and stable across romanisations. */
function dice(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const grams = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i += 1) {
    const gram = a.slice(i, i + 2);
    grams.set(gram, (grams.get(gram) ?? 0) + 1);
  }
  let hits = 0;
  for (let i = 0; i < b.length - 1; i += 1) {
    const gram = b.slice(i, i + 2);
    const count = grams.get(gram) ?? 0;
    if (count > 0) {
      grams.set(gram, count - 1);
      hits += 1;
    }
  }
  return (2 * hits) / (a.length - 1 + b.length - 1);
}
