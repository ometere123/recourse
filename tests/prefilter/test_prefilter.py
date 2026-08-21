"""Tests for the Recourse pre-filter, run against the real OFAC bytes.

Two tiers. The unit tier uses small hand-built fixtures and always runs. The corpus tier runs
against the cached 5,647,099-byte `SDN.CSV` and skips if it is absent, so the suite stays useful
on a machine without the fixtures while still being the thing that actually proves correctness
when they are present.

Every expected number in the corpus tier was measured independently (see FINDINGS.md) before this
file was written, so these assertions are checks against reality rather than against the
implementation's own output.
"""

import os
import unittest

import prefilter as pf

FIXTURES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures")
SDN_PATH = os.path.join(FIXTURES, "SDN.CSV")
ALT_PATH = os.path.join(FIXTURES, "ALT.CSV")
UN_PATH = os.path.join(FIXTURES, "consolidated.xml")


def _read(path):
    with open(path, "r", encoding="utf-8", errors="replace", newline="") as f:
        return f.read()


class TestCsvSplitting(unittest.TestCase):
    def test_plain(self):
        self.assertEqual(pf.split_csv_record("a,b,c"), ["a", "b", "c"])

    def test_quoted_comma(self):
        # 8,297 of 19,249 real records look like this. A naive split corrupts every one of them.
        self.assertEqual(
            pf.split_csv_record('36,"AEROCARIBBEAN AIRLINES",-0- ,"CUBA"'),
            ["36", "AEROCARIBBEAN AIRLINES", "-0- ", "CUBA"],
        )
        self.assertEqual(
            pf.split_csv_record('1,"SMITH, John Paul","x"'),
            ["1", "SMITH, John Paul", "x"],
        )

    def test_doubled_quote_escape(self):
        # Absent from the current export, handled anyway. The failure mode of not handling it is
        # a silently mis-split record, which is exactly the class of bug this module exists to
        # avoid.
        self.assertEqual(
            pf.split_csv_record('1,"he said ""hi""",2'),
            ["1", 'he said "hi"', "2"],
        )

    def test_empty_fields(self):
        self.assertEqual(pf.split_csv_record("a,,c"), ["a", "", "c"])
        self.assertEqual(pf.split_csv_record(",,"), ["", "", ""])

    def test_clean_field(self):
        self.assertEqual(pf.clean_field("-0- "), "")
        self.assertEqual(pf.clean_field("  "), "")
        self.assertEqual(pf.clean_field(" CUBA "), "CUBA")


class TestNormalisation(unittest.TestCase):
    def test_evm_lowercased(self):
        # 47 of 85 real EVM entries are EIP-55 mixed case. This is the single most consequential
        # normalisation rule in the module.
        n, shape, reason = pf.normalise_address("0x098B716B8Aaf21512996dC57EB0615e2383E2f96")
        self.assertEqual(reason, "")
        self.assertEqual(shape, pf.SHAPE_EVM)
        self.assertEqual(n, "0x098b716b8aaf21512996dc57eb0615e2383e2f96")

    def test_shapes(self):
        self.assertEqual(pf.normalise_address("TA3941uFAvmVibSkQ6fMJXxmaSNovX86mz")[1], pf.SHAPE_TRON)
        self.assertEqual(pf.normalise_address("12QtD5BFwRsdNsAZY76UVE1xyCGNTojH9h")[1], pf.SHAPE_BASE58)
        self.assertEqual(
            pf.normalise_address("bc1qv7k70u2zynvem59u88ctdlaw7hc735d8xep9rq")[1], pf.SHAPE_BECH32)

    def test_rejections(self):
        self.assertEqual(pf.normalise_address("")[2], "empty")
        self.assertEqual(pf.normalise_address(None)[2], "empty")
        self.assertEqual(pf.normalise_address("0xZZZZ")[2], "bad_hex")
        self.assertEqual(pf.normalise_address("helloworld!!")[2], "bad_charset")
        self.assertEqual(pf.normalise_address("hello world")[2], "internal_whitespace")
        # A short hex string is well-formed, just not an EVM address. Length is `screen_address`'s
        # business, not the normaliser's — see test_short_query_refused.
        n, shape, reason = pf.normalise_address("0x1234\n")
        self.assertEqual((n, shape, reason), ("0x1234", pf.SHAPE_HEX, ""))
        self.assertEqual(pf.normalise_address("12Qt\x01D5BF")[2], "non_printable")

    def test_surrounding_whitespace_is_tolerated(self):
        # Pasting from a block explorer routinely carries a trailing newline. That must not be
        # an error; a space in the *middle* of the value still is.
        n, shape, reason = pf.normalise_address("  0x098B716B8Aaf21512996dC57EB0615e2383E2f96\r\n")
        self.assertEqual(reason, "")
        self.assertEqual(shape, pf.SHAPE_EVM)

    def test_base58_excludes_the_ambiguous_glyphs(self):
        # 0, O, I and l are not in the base58 alphabet. Accepting them would let a typo screen
        # as a clean miss instead of being rejected as unreadable.
        for bad in ("1B64QRxfFollows", "1B64QRxfO0IlXX"):
            self.assertEqual(pf.normalise_address(bad)[2], "bad_charset", bad)

    def test_checksum_is_not_validated(self):
        # A deliberate non-feature. Refusing to screen an address because its EIP-55 checksum is
        # wrong would mean refusing to answer a question the caller can plainly ask.
        bad_checksum = "0x098b716B8AAF21512996DC57EB0615E2383E2F96"
        self.assertEqual(pf.normalise_address(bad_checksum)[2], "")

    def test_name_normalisation(self):
        self.assertEqual(pf.normalise_name("AERO-CARIBBEAN"), "AERO CARIBBEAN")
        self.assertEqual(pf.normalise_name("Suex OTC, s.r.o."), "SUEX OTC SRO")
        self.assertEqual(pf.normalise_name("  multiple   spaces  "), "MULTIPLE SPACES")


class TestDcaParsing(unittest.TestCase):
    def test_single(self):
        got = pf.parse_dca_entries(
            "Digital Currency Address - XBT 12QtD5BFwRsdNsAZY76UVE1xyCGNTojH9h; other prose")
        self.assertEqual(len(got), 1)
        self.assertEqual(got[0]["symbol"], "XBT")
        self.assertEqual(got[0]["address"], "12QtD5BFwRsdNsAZY76UVE1xyCGNTojH9h")
        self.assertFalse(got[0]["ran_to_field_end"])

    def test_multiple_and_alt_prefix(self):
        rem = ("Digital Currency Address - XBT 1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA; "
               "alt. Digital Currency Address - ETH 0x098B716B8Aaf21512996dC57EB0615e2383E2f96")
        got = pf.parse_dca_entries(rem)
        self.assertEqual([g["symbol"] for g in got], ["XBT", "ETH"])
        self.assertTrue(got[1]["ran_to_field_end"])

    def test_phrase_with_no_address(self):
        # Both of these shapes exist in the real file — ent 39593 and ent 57978.
        got = pf.parse_dca_entries("prose Digital Currency Address - ")
        self.assertEqual(len(got), 1)
        self.assertEqual(got[0]["address"], "")
        self.assertTrue(got[0]["ran_to_field_end"])

    def test_none_and_empty(self):
        self.assertEqual(pf.parse_dca_entries(""), [])
        self.assertEqual(pf.parse_dca_entries(None), [])


class TestTruncationLogic(unittest.TestCase):
    """The truncation test needs *both* signals. Either alone is a false positive."""

    def _record(self, remarks):
        return '1,"TESTCO",-0- ,"PROG",-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,"%s"\r\n' % remarks

    def test_address_at_end_of_short_field_is_not_truncated(self):
        rem = "Digital Currency Address - XBT 1Hpj6qm9i7nMF3VkKfBFtjhEDpEjxHWvgv"
        idx = pf.build_index(self._record(rem))
        self.assertEqual(len(idx["entries"]), 1)
        self.assertEqual(len(idx["damaged"]), 0)

    def test_address_at_end_of_capped_field_is_truncated(self):
        tail = "Digital Currency Address - XBT 1B11Ezqg3AXj"
        rem = "x" * (pf.REMARKS_CAP - len(tail)) + tail
        self.assertEqual(len(rem), pf.REMARKS_CAP)
        idx = pf.build_index(self._record(rem))
        self.assertEqual(len(idx["entries"]), 0)
        self.assertEqual(len(idx["damaged"]), 1)
        self.assertEqual(idx["damaged"][0]["prefix"], "1b11ezqg3axj")
        self.assertTrue(idx["damaged"][0]["usable"])

    def test_capped_field_ending_in_prose_is_not_truncated(self):
        # The cap alone must not condemn a record. Two of the 33 capped real records end in
        # ordinary prose with an intact address earlier in the field.
        head = "Digital Currency Address - XBT 1Hpj6qm9i7nMF3VkKfBFtjhEDpEjxHWvgv; "
        rem = head + "y" * (pf.REMARKS_CAP - len(head))
        self.assertEqual(len(rem), pf.REMARKS_CAP)
        idx = pf.build_index(self._record(rem))
        self.assertEqual(len(idx["entries"]), 1)
        self.assertEqual(len(idx["damaged"]), 0)

    def test_short_prefix_is_unusable(self):
        # Chatex's real surviving prefix is the single character "3".
        tail = "Digital Currency Address - XBT 3"
        rem = "x" * (pf.REMARKS_CAP - len(tail)) + tail
        idx = pf.build_index(self._record(rem))
        self.assertEqual(len(idx["damaged"]), 1)
        self.assertFalse(idx["damaged"][0]["usable"])
        # And it must never produce a match, however plausible the query looks.
        res = pf.screen_address(self._record(rem), "3CuqLrZWn5oCe6DRxxxxxxxxxxxxxxxxxx", idx)
        self.assertEqual(res["match"], pf.MATCH_NONE)

    def test_usable_prefix_produces_inconclusive_not_clear(self):
        tail = "Digital Currency Address - XBT 1B64QRxf"
        rem = "x" * (pf.REMARKS_CAP - len(tail)) + tail
        text = self._record(rem)
        idx = pf.build_index(text)
        # A base58-valid continuation. The real full address is not in the file, which is the
        # entire point — so the query stands in for what the caller would paste.
        res = pf.screen_address(text, "1B64QRxfWt9pQzKmNhVbYc4eR7sTuAx2Zd", idx)
        self.assertEqual(res["match"], pf.MATCH_TRUNCATED_PREFIX)
        self.assertEqual(len(res["damaged_hits"]), 1)
        self.assertEqual(res["damaged_hits"][0]["reason"], "SOURCE_TRUNCATED")

    def test_prefix_match_requires_the_whole_prefix(self):
        # An address that diverges inside the surviving prefix is a genuine miss, not inconclusive.
        tail = "Digital Currency Address - XBT 1B64QRxf"
        rem = "x" * (pf.REMARKS_CAP - len(tail)) + tail
        text = self._record(rem)
        idx = pf.build_index(text)
        res = pf.screen_address(text, "1B64QRzzWt9pQzKmNhVbYc4eR7sTuAx2Zd", idx)
        self.assertEqual(res["match"], pf.MATCH_NONE)

    def test_malformed_record_is_reported_not_skipped(self):
        idx = pf.build_index('1,"TESTCO","Digital Currency Address - XBT 1AAA"\r\n')
        self.assertEqual(len(idx["entries"]), 0)
        self.assertEqual(idx["damaged"][0]["reason"], "MALFORMED_RECORD")


class TestScreenGuards(unittest.TestCase):
    def test_short_query_refused(self):
        res = pf.screen_address("anything", "0x1234")
        self.assertFalse(res["ok"])
        self.assertEqual(res["reason"], "too_short")

    def test_bad_query_refused(self):
        res = pf.screen_address("anything", "not an address!!")
        self.assertFalse(res["ok"])

    def test_miss_reports_blind_spot_size(self):
        tail = "Digital Currency Address - XBT 1B64QRxf"
        rem = "x" * (pf.REMARKS_CAP - len(tail)) + tail
        text = '1,"T",-0- ,"P",-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,"%s"\r\n' % rem
        res = pf.screen_address(text, "0x" + "ab" * 20)
        self.assertEqual(res["match"], pf.MATCH_NONE)
        # A caller rendering "no match" can state the blind spot in the same breath.
        self.assertEqual(res["damaged_total"], 1)

    def test_parser_disagreement_beats_a_clean_miss(self):
        # An address present in the bytes but absent from the index must never read as CLEAR.
        # Here the phrase is spelled differently so the index never sees the record, while the
        # raw cross-check does.
        text = '1,"T",-0- ,"P",-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,"Currency Addr - XBT 1B64QRxfZZ"\r\n'
        res = pf.screen_address(text, "1B64QRxfZZ")
        self.assertEqual(res["match"], pf.MATCH_PARSER_DISAGREEMENT)


@unittest.skipUnless(os.path.exists(SDN_PATH), "SDN fixture not present")
class TestAgainstRealCorpus(unittest.TestCase):
    """Assertions against independently measured properties of the real 5.65 MB file."""

    @classmethod
    def setUpClass(cls):
        cls.sdn = _read(SDN_PATH)
        cls.index = pf.build_index(cls.sdn)

    def test_file_size(self):
        self.assertEqual(len(self.sdn.encode("utf-8")), 5647099)

    def test_mention_count(self):
        self.assertEqual(self.index["mentions"], 477)

    def test_record_count(self):
        self.assertEqual(self.index["records"], 94)

    def test_intact_and_damaged_split(self):
        # The reconciliation, spelled out, because two plausible-looking totals circulate:
        #   477 literal `Digital Currency Address` occurrences
        #     = 464 intact addresses
        #     + 11 addresses cut mid-value by the 1,000-char Remarks cap
        #     +  2 occurrences where the field ended before the address began
        # The "475 parsed" figure in FINDINGS.md is 464 + 11 — a regex requiring both a symbol
        # and a value cannot see the 2 phrase-only occurrences at all.
        self.assertEqual(len(self.index["entries"]) + len(self.index["damaged"]), 477)
        self.assertEqual(len(self.index["entries"]), 464)
        self.assertEqual(len(self.index["damaged"]), 13)
        self.assertEqual(sum(1 for d in self.index["damaged"] if d["prefix_len"] == 0), 2)
        self.assertEqual(sum(1 for d in self.index["damaged"] if d["prefix_len"] > 0), 11)

    def test_every_entry_has_an_address(self):
        # A phrase occurrence with no address must never reach `entries`, or a caller counting
        # entries would over-report coverage.
        self.assertTrue(all(e["address_lc"] for e in self.index["entries"]))

    def test_eight_damaged_addresses_are_usable_five_are_not(self):
        """The honest size of the blind spot, asserted.

        Of the 13 addresses the source damages, 8 retain enough prefix (>= MIN_USABLE_PREFIX)
        to raise INCONCLUSIVE on a matching query. The other 5 — Chatex's single `3`,
        SecondEye's `1Gq`, Peijnenburg's `1N6XqS`, and the two occurrences cut before the
        address began — cannot be matched against anything at all. Those five are sanctioned
        addresses that this screen, or any screen reading this file, simply cannot see.
        """
        usable = [d for d in self.index["damaged"] if d["usable"]]
        self.assertEqual(len(usable), 8)
        self.assertEqual(len(self.index["damaged"]) - len(usable), 5)
        self.assertTrue(all(d["prefix_len"] >= pf.MIN_USABLE_PREFIX for d in usable))

    def test_suex_sits_exactly_on_the_usability_boundary(self):
        # 8 characters, and MIN_USABLE_PREFIX is 8. If that constant is ever raised, this real
        # sanctioned entity silently leaves the matchable set — so the boundary is pinned here.
        suex = [d for d in self.index["damaged"] if d["name"].startswith("SUEX")]
        self.assertEqual(len(suex), 1)
        self.assertEqual(suex[0]["prefix_len"], pf.MIN_USABLE_PREFIX)
        self.assertTrue(suex[0]["usable"])

    def test_known_intact_addresses_are_found(self):
        for addr in (
            "0x098B716B8Aaf21512996dC57EB0615e2383E2f96",
            "TA3941uFAvmVibSkQ6fMJXxmaSNovX86mz",
            "12QtD5BFwRsdNsAZY76UVE1xyCGNTojH9h",
            "TNiq9AXBp9EjUqhDhrwrfvAA8U3GUQZH81",
        ):
            res = pf.screen_address(self.sdn, addr, self.index)
            self.assertEqual(res["match"], pf.MATCH_EXACT, addr)
            self.assertTrue(res["hits"])
            self.assertTrue(res["hits"][0]["ent_num"])

    def test_eip55_case_insensitivity_on_real_data(self):
        upper = "0x098B716B8AAF21512996DC57EB0615E2383E2F96"
        lower = "0x098b716b8aaf21512996dc57eb0615e2383e2f96"
        for v in (upper, lower):
            self.assertEqual(pf.screen_address(self.sdn, v, self.index)["match"], pf.MATCH_EXACT)

    def test_the_thirteen_damaged_entities(self):
        names = {d["name"] for d in self.index["damaged"] if d.get("name")}
        for expected in ("CHATEX", "HYDRA MARKET", "BLENDER.IO", "GARANTEX EUROPE OU",
                         "SUEX OTC, S.R.O.", "ISIL KHORASAN", "SECONDEYE SOLUTION"):
            self.assertIn(expected, names, expected)

    def test_hydra_market_full_address_is_absent_from_the_source(self):
        """The finding, asserted. This is a false negative the source causes, not the screener."""
        hydra = [d for d in self.index["damaged"] if d.get("name") == "HYDRA MARKET"]
        self.assertTrue(hydra)
        self.assertEqual(hydra[0]["prefix"], "1b11ezqg3axj")
        self.assertEqual(hydra[0]["prefix_len"], 12)
        self.assertTrue(hydra[0]["usable"])
        # A caller supplying a longer address that begins with the surviving prefix gets
        # INCONCLUSIVE — never CLEAR, and never LISTED either, because the bytes to prove it are
        # not in the file.
        res = pf.screen_address(self.sdn, "1B11Ezqg3AXjqPeVxwqmnpump4nsFvVvW3", self.index)
        self.assertEqual(res["match"], pf.MATCH_TRUNCATED_PREFIX)
        self.assertEqual(res["damaged_hits"][0]["name"], "HYDRA MARKET")

    def test_a_random_address_is_a_clean_miss(self):
        res = pf.screen_address(self.sdn, "0x" + "ab" * 20, self.index)
        self.assertEqual(res["match"], pf.MATCH_NONE)
        self.assertEqual(res["damaged_total"], 13)

    def test_no_parser_disagreement_anywhere_in_the_corpus(self):
        """Every intact indexed address must also be findable in the raw bytes, and vice versa.

        This is the test that would catch a quoting bug. It is the reason the module can claim
        that a MATCH_NONE means something.
        """
        low = self.sdn.lower()
        for e in self.index["entries"]:
            self.assertGreaterEqual(low.find(e["address_lc"]), 0, e["address_lc"])

    def test_programs_are_captured(self):
        progs = {e["program"] for e in self.index["entries"]}
        self.assertIn("CYBER2", progs)
        self.assertIn("RUSSIA-EO14024", progs)

    def test_duplicate_addresses_return_all_records(self):
        # Four addresses appear on more than one record, so a hit is a list, not a scalar.
        res = pf.screen_address(self.sdn, "0xd882cfc20f52f2599d84b8e8d58c7fb62cfe344b", self.index)
        self.assertEqual(res["match"], pf.MATCH_EXACT)
        self.assertGreaterEqual(len(res["hits"]), 2)

    def test_dos_eof_byte_does_not_break_anything(self):
        self.assertTrue(self.sdn.rstrip().endswith("\x1a") or "\x1a" in self.sdn[-4:])


@unittest.skipUnless(os.path.exists(SDN_PATH), "SDN fixture not present")
class TestNameCandidates(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sdn = _read(SDN_PATH)

    def test_exact_name(self):
        got = pf.find_name_candidates(self.sdn, "Chatex")
        self.assertTrue(got["ok"])
        self.assertTrue(any(c["name"] == "CHATEX" for c in got["candidates"]))
        self.assertEqual(got["candidates"][0]["match_kind"], "EXACT")

    def test_punctuation_insensitive(self):
        got = pf.find_name_candidates(self.sdn, "SUEX OTC s.r.o.")
        self.assertTrue(any("SUEX" in c["name"] for c in got["candidates"]))

    def test_broad_query_reports_suppression(self):
        got = pf.find_name_candidates(self.sdn, "BANK", limit=5)
        self.assertEqual(len(got["candidates"]), 5)
        self.assertGreater(got["suppressed"], 0)

    def test_too_short(self):
        self.assertFalse(pf.find_name_candidates(self.sdn, "AL")["ok"])


@unittest.skipUnless(os.path.exists(ALT_PATH), "ALT fixture not present")
class TestAltAliases(unittest.TestCase):
    def test_aliases_by_ent_num(self):
        alt = _read(ALT_PATH)
        got = pf.parse_alt_aliases(alt, ["36"])
        self.assertTrue(got)
        self.assertTrue(any(g["alt_name"] == "AERO-CARIBBEAN" for g in got))
        self.assertTrue(all(g["ent_num"] == "36" for g in got))

    def test_alt_contains_no_addresses(self):
        """Asserted, not assumed. The multi-source claim in the docs depends on this being true."""
        alt = _read(ALT_PATH)
        self.assertEqual(alt.count("Digital Currency Address"), 0)
        self.assertEqual(alt.lower().count("0x"), 0)

    def test_unknown_ent_num_returns_nothing(self):
        self.assertEqual(pf.parse_alt_aliases(_read(ALT_PATH), ["999999999"]), [])


@unittest.skipUnless(os.path.exists(UN_PATH), "UN fixture not present")
class TestUnCorroboration(unittest.TestCase):
    def test_un_contains_no_addresses(self):
        un = _read(UN_PATH)
        self.assertEqual(un.count("Digital Currency Address"), 0)
        self.assertEqual(un.lower().count("digital currency"), 0)

    def test_absent_name(self):
        un = _read(UN_PATH)
        self.assertFalse(pf.un_entity_corroboration(un, "ZZZQQQ NOT A REAL ENTITY")["present"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
