"""Deterministic pre-filter over the OFAC SDN list. No network, no model, no contract imports.

This module is the arithmetic half of Recourse. It answers exactly one question — *does this
address appear on the list, and is the record intact?* — and it answers it without consulting a
model, because string equality is not a matter of opinion.

Everything here was written against the real 5,647,099-byte `SDN.CSV` published on 2026-08-21,
and every constant below is a measured property of that file rather than an assumption. See
FINDINGS.md for the measurements.

Three properties of the real file drive the whole design:

  1. `Remarks` is hard-truncated at exactly 1,000 characters, and 13 sanctioned crypto addresses
     are cut mid-value as a result. Hydra Market's Bitcoin address is present as `1B11Ezqg3AXj`
     — 12 of 34 characters. A naive exact-match screen therefore returns "not found" for an
     address that *is* designated. That is a false negative in a sanctions screen, and it is the
     single most important thing this module exists to prevent.

  2. A byte-level miss costs under a millisecond; a full structured parse of all 19,249 records
     costs 88 ms. So the structured parse is never run over the file. The scan is driven entirely
     by locating the 477 occurrences of one phrase and parsing only the ~94 records that contain
     them.

  3. 8,297 of 19,249 records have a comma inside a quoted field, so `line.split(",")` corrupts
     43% of the file. Field splitting is quote-aware, hand-rolled, and tested.
"""

# --------------------------------------------------------------------------- measured constants

DCA_PHRASE = "Digital Currency Address"

# OFAC's exporter caps the Remarks column at exactly 1000 characters. This is not documented
# anywhere by Treasury; it was found by measuring `max(len(remarks))` across the file and finding
# a hard ceiling with 33 records sitting precisely on it.
REMARKS_CAP = 1000

# A truncated address is only usable as evidence if enough of it survived to be discriminating.
# Chatex's Bitcoin address is present in the file as the single character "3", and SECONDEYE
# SOLUTION's as "1Gq" — a prefix that short matches an enormous share of all Bitcoin addresses
# and would generate constant false positives.
#
# 8 was chosen rather than a longer bound because base58 and bech32 both carry ~5.9 bits per
# character, so an 8-character prefix is ~47 bits of discrimination — enough that a collision
# against the ~10^9 addresses in existence is negligible, while still catching the SUEX entry
# (`1B64QRxf`, exactly 8) which a bound of 10 or 12 would have silently discarded.
#
# Records whose surviving prefix is shorter than this are not thrown away. They are reported as
# a named blind spot, which is the honest thing to do with a fact you cannot act on.
MIN_USABLE_PREFIX = 8

# `-0-` is OFAC's sentinel for an absent value. It is not a value.
EMPTY_SENTINEL = "-0-"

# The file ends with a bare 0x1A byte — the DOS end-of-file character — which parses as a
# spurious 13th "record" of one field. Skipping short records handles it without an error path.
SDN_FIELD_COUNT = 12
ALT_FIELD_COUNT = 5

SDN_COLUMNS = (
    "ent_num", "sdn_name", "sdn_type", "program", "title", "call_sign",
    "vess_type", "tonnage", "grt", "vess_flag", "vess_owner", "remarks",
)

# Outcome vocabulary. These strings cross the boundary into contract storage, so they are fixed.
MATCH_EXACT = "EXACT"
MATCH_TRUNCATED_PREFIX = "TRUNCATED_PREFIX"
MATCH_NONE = "NONE"
MATCH_PARSER_DISAGREEMENT = "PARSER_DISAGREEMENT"

SHAPE_EVM = "EVM"
SHAPE_BECH32 = "BECH32"
SHAPE_BASE58 = "BASE58"
SHAPE_TRON = "TRON"
SHAPE_HEX = "HEX"
SHAPE_UNKNOWN = "UNKNOWN"

_HEX_DIGITS = set("0123456789abcdef")
# Base58 omits 0, O, I and l precisely so they cannot be confused visually.
_BASE58 = set("123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz")
# Bech32 omits 1, b, i and o from its data part.
_BECH32 = set("023456789acdefghjklmnpqrstuvwxyz")


# --------------------------------------------------------------------------- normalisation

def normalise_address(raw):
    """Return `(normalised, shape, reason)`. `reason` is empty on success.

    Normalisation is lowercasing and nothing else. That is a deliberate limit:

    - 47 of the 85 EVM addresses in the real file are EIP-55 mixed case, so a case-sensitive
      compare misses over half of them. Lowercasing both sides is mandatory, not cosmetic.
    - Base58 and bech32 are *not* case-insensitive encodings in general, and lowercasing a
      base58 string can in principle map two distinct addresses together. In practice OFAC
      publishes base58 in its canonical mixed case and we compare against the same source, so
      the collision cannot arise between file and query — but it means the normalised form is
      only ever used for *comparison against this same file*, never re-published as an address.
    - No checksum validation. Rejecting an address for a bad EIP-55 checksum would mean refusing
      to screen an address the caller can plainly see on a block explorer. Checksum failure is
      the caller's problem; presence on a sanctions list is ours.
    """
    if raw is None:
        return "", SHAPE_UNKNOWN, "empty"
    s = str(raw).strip()
    if not s:
        return "", SHAPE_UNKNOWN, "empty"
    # Whitespace and control bytes are separated because the frontend renders `reason` verbatim.
    # "there is a space inside what you pasted" is an actionable message a user can fix;
    # "there is a control byte in it" is a different problem with a different remedy. Collapsing
    # both into one label costs nothing here and costs the user a confusing error there.
    if any(c.isspace() for c in s):
        return "", SHAPE_UNKNOWN, "internal_whitespace"
    if any(ord(c) < 33 or ord(c) > 126 for c in s):
        return "", SHAPE_UNKNOWN, "non_printable"

    low = s.lower()

    if low.startswith("0x"):
        body = low[2:]
        if not body or any(c not in _HEX_DIGITS for c in body):
            return "", SHAPE_UNKNOWN, "bad_hex"
        if len(body) == 40:
            return low, SHAPE_EVM, ""
        return low, SHAPE_HEX, ""

    if low.startswith("bc1") or low.startswith("tb1"):
        if any(c not in _BECH32 for c in low[3:]):
            return "", SHAPE_UNKNOWN, "bad_bech32"
        return low, SHAPE_BECH32, ""

    if any(c not in _BASE58 for c in s):
        return "", SHAPE_UNKNOWN, "bad_charset"

    # TRON addresses are base58 beginning with T and 34 characters long. Distinguishing them
    # matters only for display; the comparison path is identical.
    if s[0] == "T" and len(s) == 34:
        return low, SHAPE_TRON, ""
    return low, SHAPE_BASE58, ""


def normalise_name(raw):
    """Uppercase, drop `.` and apostrophes, collapse whitespace, keep alphanumerics only.

    Used for the name-screening path, where the question is which *candidate* rows a model should
    be shown. It is deliberately lossy — `AERO-CARIBBEAN` and `AERO CARIBBEAN` must collide,
    because deciding whether they denote the same party is exactly the judgment the model is for.
    Normalisation's job here is recall, not precision.
    """
    if raw is None:
        return ""
    out = []
    prev_space = True
    for ch in str(raw).upper():
        if ch.isalnum():
            out.append(ch)
            prev_space = False
        elif ch in ".'’":
            continue
        else:
            if not prev_space:
                out.append(" ")
                prev_space = True
    while out and out[-1] == " ":
        out.pop()
    return "".join(out)


# --------------------------------------------------------------------------- CSV primitives

def split_csv_record(line):
    """Quote-aware split of one CSV record into fields.

    Hand-rolled rather than delegated to the `csv` module for two reasons. First, this code is
    pasted into a contract, and a reviewer auditing a sanctions screen should be able to read the
    parsing rules rather than trust a module's dialect defaults. Second, the real file's dialect
    was measured and is narrow: CRLF only, zero embedded newlines, zero doubled-quote escapes.
    Quote doubling is still handled — a future OFAC export could introduce it, and the failure
    mode of not handling it is a silently mis-split record.
    """
    fields = []
    buf = []
    in_quotes = False
    i = 0
    n = len(line)
    while i < n:
        ch = line[i]
        if in_quotes:
            if ch == '"':
                if i + 1 < n and line[i + 1] == '"':
                    buf.append('"')
                    i += 2
                    continue
                in_quotes = False
                i += 1
                continue
            buf.append(ch)
            i += 1
            continue
        if ch == '"':
            in_quotes = True
            i += 1
            continue
        if ch == ",":
            fields.append("".join(buf))
            buf = []
            i += 1
            continue
        buf.append(ch)
        i += 1
    fields.append("".join(buf))
    return fields


def clean_field(value):
    """`-0-` and whitespace-only both mean absent."""
    v = (value or "").strip()
    if v == EMPTY_SENTINEL or v == "":
        return ""
    return v


def record_bounds(text, pos):
    """Return `(start, end)` of the physical record containing `pos`.

    This is what makes the fast path fast. Given a byte offset produced by a whole-buffer
    `find`, the containing record is recovered by walking outward to the nearest newlines
    instead of parsing the file. Bounded by construction: the longest record in the real file is
    well under 4 KB, so each walk is short.

    Safe because the measured file has zero newlines inside quoted fields. If a future export
    introduces one, a record could be split mid-field — which would produce a *malformed* field
    count, caught by the `SDN_FIELD_COUNT` check at the call site, rather than a wrong answer.
    """
    start = text.rfind("\n", 0, pos)
    start = 0 if start < 0 else start + 1
    end = text.find("\n", pos)
    if end < 0:
        end = len(text)
    while end > start and text[end - 1] in "\r\n":
        end -= 1
    return start, end


# --------------------------------------------------------------------------- DCA extraction

def parse_dca_entries(remarks):
    """Extract `(symbol, address)` pairs from one Remarks field.

    The real formatting, measured across all 477 occurrences, is:

        Digital Currency Address - XBT 12QtD5BFwRsdNsAZY76UVE1xyCGNTojH9h; alt. …

    Terminators are `"; "` (421), the end of the field (13), and a bare `";"` (1). One record
    carries 14 addresses. Two occurrences have no address at all because the field ended first.

    Written as a hand-rolled scan rather than a regex. A regex over a 1,000-character field is
    fine, but the two-space and missing-address variants above needed enough special-casing that
    the explicit scanner is shorter to read and easier to assert against.

    Returns a list of dicts with `symbol`, `address`, and `ran_to_field_end` — the last being the
    truncation signal, and the reason this function returns position information at all.
    """
    out = []
    if not remarks:
        return out
    n = len(remarks)
    plen = len(DCA_PHRASE)
    pos = 0
    while True:
        at = remarks.find(DCA_PHRASE, pos)
        if at < 0:
            break
        i = at + plen
        pos = i
        # skip whitespace, then the separating hyphen, then whitespace
        while i < n and remarks[i] == " ":
            i += 1
        if i < n and remarks[i] == "-":
            i += 1
        while i < n and remarks[i] == " ":
            i += 1
        # symbol
        sym_start = i
        while i < n and remarks[i].isalnum():
            i += 1
        symbol = remarks[sym_start:i]
        if not symbol:
            # The phrase appeared but the field ended before the symbol. Recorded, not skipped:
            # this is one of the two occurrences that exist in the real file.
            out.append({"symbol": "", "address": "", "ran_to_field_end": True})
            continue
        while i < n and remarks[i] == " ":
            i += 1
        addr_start = i
        while i < n and (remarks[i].isalnum() or remarks[i] in "._:-"):
            i += 1
        address = remarks[addr_start:i]
        out.append({
            "symbol": symbol,
            "address": address,
            # The address ran to the very end of the field. Combined with a field length of
            # exactly REMARKS_CAP at the call site, this is the truncation test — and it is the
            # only sound one available.
            #
            # The obvious alternative, `len(address) != CANONICAL_LENGTH[symbol]`, was tried and
            # rejected: `XBT` labels both legacy base58 (34 chars) and bech32 (42 and 62 chars)
            # addresses in the real file, so 74 of 475 addresses fail a symbol-length check while
            # being perfectly intact. Length tells you nothing here. The field boundary does.
            "ran_to_field_end": i >= n,
        })
        pos = i
    return out


def build_index(sdn_text):
    """Build the address index and the damaged-record list in one pass over the DCA occurrences.

    Deliberately *not* a full parse. The phrase occurs 477 times across ~94 records, so the work
    is 477 `find` calls plus ~94 record splits — around half a millisecond, against 88 ms for a
    structured parse of all 19,249 records. The 100× saving is the whole reason the contract can
    afford to do this inside a consensus block on a 5.65 MB payload.

    Returns a dict with:
      `entries`  — every intact address, lowercased, with its record
      `damaged`  — every address the source truncated, with the surviving prefix
      `records`  — count of distinct records carrying at least one address
      `mentions` — count of phrase occurrences, so a caller can assert nothing was dropped
    """
    entries = []
    damaged = []
    seen_records = set()
    mentions = 0

    pos = 0
    while True:
        at = sdn_text.find(DCA_PHRASE, pos)
        if at < 0:
            break
        mentions += 1
        start, end = record_bounds(sdn_text, at)
        pos = at + len(DCA_PHRASE)
        if start in seen_records:
            continue
        seen_records.add(start)

        fields = split_csv_record(sdn_text[start:end])
        if len(fields) != SDN_FIELD_COUNT:
            # A malformed record is reported, never silently skipped: in a sanctions screen an
            # unparseable record is a blind spot, and a blind spot the caller does not know about
            # is worse than one it does.
            damaged.append({
                "ent_num": "", "name": "", "program": "", "sdn_type": "",
                "symbol": "", "prefix": "", "reason": "MALFORMED_RECORD",
                "field_count": len(fields),
            })
            continue

        remarks = fields[11]
        truncated_field = len(remarks) >= REMARKS_CAP
        base = {
            "ent_num": clean_field(fields[0]),
            "name": clean_field(fields[1]),
            "sdn_type": clean_field(fields[2]) or "entity",
            "program": clean_field(fields[3]),
            "title": clean_field(fields[4]),
        }

        for item in parse_dca_entries(remarks):
            addr = item["address"]
            # Truncation requires both signals: the address ran to the end of the field AND the
            # field is at the cap. Either alone is not evidence. An address can legitimately be
            # the last thing in a short remarks field, and a field can hit the cap while ending
            # in ordinary prose.
            is_cut = truncated_field and item["ran_to_field_end"]
            row = dict(base)
            row["symbol"] = item["symbol"]
            if is_cut or not addr:
                row["prefix"] = addr.lower()
                row["prefix_len"] = len(addr)
                row["usable"] = len(addr) >= MIN_USABLE_PREFIX
                row["reason"] = "SOURCE_TRUNCATED"
                damaged.append(row)
            else:
                row["address"] = addr
                row["address_lc"] = addr.lower()
                entries.append(row)

    return {
        "entries": entries,
        "damaged": damaged,
        "records": len(seen_records),
        "mentions": mentions,
        "source_len": len(sdn_text),
    }


# --------------------------------------------------------------------------- the screen

def screen_address(sdn_text, raw_address, index=None):
    """Screen one address against the list. Pure arithmetic — no model is consulted.

    The result dict is the deterministic input to everything the contract does next, so it is
    flat, JSON-safe, and contains no validator-specific values (no URLs, no timings, no
    iteration order that depends on anything but file order).
    """
    normalised, shape, reason = normalise_address(raw_address)
    if reason:
        return {
            "ok": False, "reason": reason, "match": MATCH_NONE,
            "query": "", "shape": shape, "hits": [], "damaged_hits": [],
        }
    if len(normalised) < MIN_USABLE_PREFIX:
        # Screening a 4-character string against 5.65 MB of text is not a screen, it is a
        # substring search that will match constantly. Refused up front.
        return {
            "ok": False, "reason": "too_short", "match": MATCH_NONE,
            "query": normalised, "shape": shape, "hits": [], "damaged_hits": [],
        }

    if index is None:
        index = build_index(sdn_text)

    hits = [e for e in index["entries"] if e["address_lc"] == normalised]

    # Cross-check against the raw bytes. If the address is present in the file but the structured
    # index did not find it, the parser is wrong — and a parser bug in a sanctions screen must
    # never be able to express itself as a clean result. It reports disagreement instead, which
    # the contract turns into a refusal rather than a CLEAR.
    raw_present = sdn_text.lower().find(normalised) >= 0

    if hits:
        return {
            "ok": True, "reason": "", "match": MATCH_EXACT,
            "query": normalised, "shape": shape,
            "hits": hits, "damaged_hits": [],
            "damaged_total": len(index["damaged"]),
            "records_scanned": index["records"],
        }

    # No exact hit. Before concluding anything, check the addresses the source itself destroyed.
    damaged_hits = []
    for d in index["damaged"]:
        pfx = d.get("prefix", "")
        if not pfx or len(pfx) < MIN_USABLE_PREFIX:
            continue
        if normalised.startswith(pfx):
            damaged_hits.append(d)

    if damaged_hits:
        return {
            "ok": True, "reason": "", "match": MATCH_TRUNCATED_PREFIX,
            "query": normalised, "shape": shape,
            "hits": [], "damaged_hits": damaged_hits,
            "damaged_total": len(index["damaged"]),
            "records_scanned": index["records"],
        }

    if raw_present:
        return {
            "ok": True, "reason": "index_missed_raw_hit", "match": MATCH_PARSER_DISAGREEMENT,
            "query": normalised, "shape": shape,
            "hits": [], "damaged_hits": [],
            "damaged_total": len(index["damaged"]),
            "records_scanned": index["records"],
        }

    return {
        "ok": True, "reason": "", "match": MATCH_NONE,
        "query": normalised, "shape": shape,
        "hits": [], "damaged_hits": [],
        # Returned on the miss path on purpose. A caller rendering "no match" needs to be able to
        # say how large the known blind spot is, in the same breath, from the same call.
        "damaged_total": len(index["damaged"]),
        "records_scanned": index["records"],
    }


# --------------------------------------------------------------------------- name candidates

def find_name_candidates(sdn_text, raw_name, limit=12):
    """Return bounded candidate rows for a name query. Recall-oriented; the model decides identity.

    This is the one place a full scan is unavoidable — there is no phrase to anchor on, because
    every record has a name. It costs the 88 ms structured parse, which is why the address path
    is kept separate and never pays it.

    The model is shown candidate rows and never the file. `limit` exists so a query like "AL"
    cannot expand into a prompt containing thousands of rows: the count of suppressed candidates
    is returned so the caller can report that the query was too broad rather than silently
    judging a truncated slice.
    """
    target = normalise_name(raw_name)
    out = []
    suppressed = 0
    if len(target) < 3:
        return {"ok": False, "reason": "too_short", "candidates": [], "suppressed": 0}

    pos = 0
    n = len(sdn_text)
    while pos < n:
        end = sdn_text.find("\n", pos)
        if end < 0:
            end = n
        line = sdn_text[pos:end].rstrip("\r")
        pos = end + 1
        if len(line) < 4:
            continue
        fields = split_csv_record(line)
        if len(fields) != SDN_FIELD_COUNT:
            continue
        name = clean_field(fields[1])
        norm = normalise_name(name)
        if not norm:
            continue
        if target == norm:
            kind = "EXACT"
        elif target in norm or norm in target:
            kind = "SUBSTRING"
        else:
            continue
        if len(out) >= limit:
            suppressed += 1
            continue
        out.append({
            "ent_num": clean_field(fields[0]),
            "name": name,
            "sdn_type": clean_field(fields[2]) or "entity",
            "program": clean_field(fields[3]),
            "title": clean_field(fields[4]),
            "match_kind": kind,
        })

    # Exact matches first, then substring, each group in file order. Sorting by anything
    # value-dependent would risk a validator-dependent order; file order is identical for every
    # validator that fetched the same bytes.
    out.sort(key=lambda r: 0 if r["match_kind"] == "EXACT" else 1)
    return {"ok": True, "reason": "", "candidates": out, "suppressed": suppressed}


def parse_alt_aliases(alt_text, ent_nums, limit=40):
    """Aliases for a set of `ent_num`s, from ALT.CSV.

    ALT.CSV carries **no digital-currency addresses at all** — verified with four independent
    address-shape searches over the whole file, not a phrase search. It is a 20,194-row alias
    table keyed on `ent_num`, with `alt_type` in `aka` / `fka` / `nka`.

    So its role is precise and limited: once the *address* path has produced an `ent_num`
    arithmetically, ALT supplies that entity's other names. It corroborates the **entity**, never
    the address. Claiming otherwise would have been a claim a reviewer could falsify with one grep.
    """
    wanted = set(str(e) for e in ent_nums if str(e))
    out = []
    if not wanted:
        return out
    pos = 0
    n = len(alt_text)
    while pos < n and len(out) < limit:
        end = alt_text.find("\n", pos)
        if end < 0:
            end = n
        line = alt_text[pos:end].rstrip("\r")
        pos = end + 1
        if len(line) < 4:
            continue
        fields = split_csv_record(line)
        if len(fields) != ALT_FIELD_COUNT:
            continue
        if clean_field(fields[0]) not in wanted:
            continue
        out.append({
            "ent_num": clean_field(fields[0]),
            "alt_type": clean_field(fields[2]),
            "alt_name": clean_field(fields[3]),
        })
    return out


def un_entity_corroboration(un_text, name, limit=4):
    """Does the UN consolidated list independently name this entity?

    The UN file contains **zero** crypto addresses — again verified by address shape, not phrase.
    Its only contribution is independent confirmation that a designated entity is designated by a
    second authority. That is worth having: it is corroboration across governments rather than
    one government repeated.

    Matching is a normalised substring test over the XML text, deliberately crude. A hit means
    "this name appears in the UN list" and nothing more; whether it denotes the same party is a
    question for the model, with the candidate excerpt as its evidence.
    """
    target = normalise_name(name)
    if len(target) < 4:
        return {"present": False, "excerpts": []}
    upper = normalise_name(un_text)
    if target not in upper:
        return {"present": False, "excerpts": []}
    # Locate up to `limit` excerpts in the *original* text for display. The normalised buffer
    # cannot be used for offsets because normalisation is not length-preserving.
    excerpts = []
    needle = target.split()[0]
    pos = 0
    while len(excerpts) < limit:
        at = un_text.upper().find(needle, pos)
        if at < 0:
            break
        lo = max(0, at - 60)
        hi = min(len(un_text), at + 140)
        excerpts.append(un_text[lo:hi].replace("\n", " ").replace("\r", " "))
        pos = at + len(needle)
    return {"present": True, "excerpts": excerpts}
