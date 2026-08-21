import type { Appeal, Determination, SourceRow } from "./contract-types";

/**
 * FIXTURES — real primary-source bytes, no contract.
 *
 * Every `matched_entry` below is a verbatim excerpt of an actual row from the
 * files the issuing authorities publish, taken from captures made 2026-08-20:
 *
 *   SDN.CSV            5,647,099 bytes   sha256 369c3ad9…b85c6b   19,249 rows
 *   ALT.CSV            1,063,617 bytes   sha256 c00af657…f422bc
 *   consolidated.xml   2,176,185 bytes   sha256 0f0ac1ea…ebbced   dateGenerated 2026-08-19
 *
 * The `source_digest` values are the real SHA-256 digests of those captures, so
 * the provenance rail under The Row is not decorative. Row numbers are the real
 * line numbers in the captured files.
 *
 * SDN.CSV column order is:
 *   ent_num, SDN_Name, SDN_Type, Program, Title, Call_Sign, Vess_type,
 *   Tonnage, GRT, Vess_flag, Vess_owner, Remarks
 * with `-0-` meaning empty. Crypto wallet addresses live inside Remarks as
 * `Digital Currency Address - ETH …` / `- XBT …` entries.
 *
 * ALT.CSV column order is:
 *   ent_num, alt_num, alt_type, alt_name, alt_remarks
 *
 * A `…` inside an excerpt is the boundary of the contract's extraction window,
 * not an edit to the bytes. Everything between the markers is byte-for-byte.
 */

export const SDN_DIGEST = "0x369c3ad9ceefed9ca82f4c45484b731c93687282c36ea3f512543d2c61b85c6b";
export const ALT_DIGEST = "0xc00af65765e4435ef759f9992291093e47ef5a938a145ed381c6dbf2b2f422bc";
export const UN_DIGEST = "0x0f0ac1ea30415bcd472aa92a4574eb3011c3c423ca6dfc5802ca4d5f25ebbced";

/** The date each file states for itself, parsed deterministically at screening. */
export const SDN_GENERATED = "2026-08-19";
export const UN_GENERATED = "2026-08-19";

const GEN = (whole: number) => `${whole}${"0".repeat(18)}`;

/* ------------------------------------------------------------------------- *
 * Determinations
 *
 * Declared without `inconclusive_reason` / `surviving_prefix_len` and widened
 * below, so the ordinary case does not have to restate "not damaged" nine times.
 * ------------------------------------------------------------------------- */

type Fixture = Omit<Determination, "inconclusive_reason" | "surviving_prefix_len"> &
  Partial<Pick<Determination, "inconclusive_reason" | "surviving_prefix_len">>;

const FIXTURES: Fixture[] = [
  {
    // Verbatim from SDN.CSV line 6,207. The subject address appears as the first
    // `Digital Currency Address - ETH` entry in the Remarks column.
    id: "R-1048",
    reporter: "0x4d1eA5b2C7f80934aB61d0cE7f1b53927c4A80f3",
    subject: "0x098b716b8aaf21512996dc57eb0615e2383e2f96",
    subject_kind: "ADDRESS",
    basis_kind: "PRIMARY_LIST",
    basis_url: "",
    bond: GEN(250),
    status: "LISTED",
    matched_entry:
      '27307,"LAZARUS GROUP",-0- ,"DPRK3",-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,"…\n…Digital Currency Address - ETH 0x098B716B8Aaf21512996dC57EB0615e2383E2f96; alt. Digital Currency…',
    matched_list: "OFAC_SDN",
    source_digest: SDN_DIGEST,
    source_generated: SDN_GENERATED,
    rationale:
      "Byte equality. The normalised subject matched an exact substring of SDN.CSV row 6,207 inside the Remarks column. The scan extracted one candidate window and the exact-hit branch returned before any prompt step. No validator was asked for a judgment about this subject.",
    appeal_deadline: "",
    appeal_id: "",
    screened_at: "2026-08-19T14:02:11",
  },
  {
    // Verbatim from SDN.CSV line 7,214.
    id: "R-1047",
    reporter: "0x2Fb9d7Aa1c40E5b83729dE60a1f4C8b57eD3902a",
    subject: "0x9f4cda013e354b8fc285bf4b9a60460cee7f7ea9",
    subject_kind: "ADDRESS",
    basis_kind: "PRIMARY_LIST",
    basis_url: "",
    bond: GEN(100),
    status: "LISTED",
    matched_entry:
      '31212,"SOUTHFRONT",-0- ,"NPWMD] [CYBER2] [ELECTION-EO13848",-0- ,-0- ,-0- ,-0- ,…\n…Digital Currency Address - ETH 0x9f4cda013e354b8fc285bf4b9a60460cee7f7ea9; alt. Digital…',
    matched_list: "OFAC_SDN",
    source_digest: SDN_DIGEST,
    source_generated: SDN_GENERATED,
    rationale:
      "Byte equality. The normalised subject matched an exact substring of SDN.CSV row 7,214 inside the Remarks column. Deterministic branch; no inference step ran.",
    appeal_deadline: "",
    appeal_id: "",
    screened_at: "2026-08-18T09:44:52",
  },
  {
    // Verbatim from ALT.CSV line 4,927 — an aka of ent_num 15953,
    // "NOURI PETROCHEMICAL COMPANY" in SDN.CSV line 2,633.
    id: "R-1049",
    reporter: "0x7C05a2E9bB3140dfa6E82C7301Bd4e59fA6c1082",
    subject: "NURI PETROCHEMICAL COMPANY LLP",
    subject_kind: "ENTITY",
    basis_kind: "PRIMARY_LIST",
    basis_url: "",
    bond: GEN(300),
    status: "ASSERTED",
    matched_entry: '15953,42388,"aka","NOURI PETROCHEMICAL COMPANY (LLP)",-0- ',
    matched_list: "OFAC_ALT",
    source_digest: ALT_DIGEST,
    source_generated: SDN_GENERATED,
    rationale:
      "No byte-exact hit. The deterministic scan extracted 4 candidate rows on a normalised-name window and the identity round was asked which, if any, denotes the same legal party. Validators agreed on ALT.CSV row 4,927: the romanisation differs (NURI / NOURI) but the legal form, the parenthesised LLP suffix and the industry term are the same, and the parent entry SDN.CSV row 2,633 records the same National ID No. 941 (Iran). Judgment: same party.",
    appeal_deadline: "2026-08-27T11:31:07",
    appeal_id: "A-201",
    screened_at: "2026-08-20T11:31:07",
  },
  {
    id: "R-1050",
    reporter: "0x91B7cE20D4a6F831075bA2e0c9D14fE8b7305Ac6",
    subject: "0x9f2b4c8e77a013d5c6be1f04a83729ed5b1c60fa",
    subject_kind: "ADDRESS",
    basis_kind: "PRIMARY_LIST",
    basis_url: "",
    bond: GEN(150),
    status: "NOT_LISTED",
    matched_entry: "",
    matched_list: "NONE",
    source_digest: SDN_DIGEST,
    source_generated: SDN_GENERATED,
    rationale:
      "Screened against 3 files. The deterministic scan extracted zero candidate windows for the normalised subject, so there was nothing for an identity round to judge and no prompt ran. The report bond was slashed to the public bounty pool: filing an unsupported determination costs the reporter, not the subject.",
    appeal_deadline: "",
    appeal_id: "",
    screened_at: "2026-08-20T08:17:40",
  },
  {
    // Verbatim from SDN.CSV line 17,991 — the romanisation collision the PRD
    // opens with, and the case where the appeal did its job.
    id: "R-1051",
    reporter: "0x2Fb9d7Aa1c40E5b83729dE60a1f4C8b57eD3902a",
    subject: "AL NOUR TRADING CO",
    subject_kind: "ENTITY",
    basis_kind: "PRIMARY_LIST",
    basis_url: "",
    bond: GEN(500),
    status: "OVERTURNED",
    matched_entry:
      '56269,"AL-NUR SOCIETY GAZA",-0- ,"SDGT",-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,"Secondary sanctions risk: section 1(b) of Executive Order 13224…',
    matched_list: "OFAC_SDN",
    source_digest: SDN_DIGEST,
    source_generated: SDN_GENERATED,
    rationale:
      "No byte-exact hit. The scan extracted 2 candidate rows on the AL-NUR / AL NOUR romanisation family and the identity round returned same-party against SDN.CSV row 17,991, giving status ASSERTED. That reading was contested and overturned in appeal A-202.",
    appeal_deadline: "2026-08-24T16:09:03",
    appeal_id: "A-202",
    screened_at: "2026-08-17T16:09:03",
  },
  {
    // Verbatim from ALT.CSV line 1,689 — an aka of ent_num 9611,
    // "AL NOUR RADIO" in SDN.CSV line 953.
    id: "R-1052",
    reporter: "0x91B7cE20D4a6F831075bA2e0c9D14fE8b7305Ac6",
    subject: "AL NOUR MEDIA SERVICES SAL",
    subject_kind: "ENTITY",
    basis_kind: "ASSERTED",
    basis_url: "https://www.treasury.gov/press-center/press-releases",
    bond: GEN(200),
    status: "CONTESTED",
    matched_entry: '9611,9100,"aka","AL NOUR BROADCASTING STATION",-0- ',
    matched_list: "OFAC_ALT",
    source_digest: ALT_DIGEST,
    source_generated: SDN_GENERATED,
    rationale:
      "The identity round returned same-party against ALT.CSV row 1,689 on a shared broadcast trade name. Appeal A-203 argued corporate succession: the appellant states the SAL entity was incorporated separately in 2019 and holds no interest in the listed broadcaster. Validators could not agree that the evidence established either reading, and returned UNCLEAR. Both bonds were returned and the record is CONTESTED.",
    appeal_deadline: "2026-08-22T10:02:33",
    appeal_id: "A-203",
    screened_at: "2026-08-15T10:02:33",
  },
  {
    // Verbatim from ALT.CSV line 1,242 — an aka of ent_num 8211,
    // "AL-BASHAIR TRADING COMPANY, LTD" in SDN.CSV line 677.
    id: "R-1054",
    reporter: "0x7C05a2E9bB3140dfa6E82C7301Bd4e59fA6c1082",
    subject: "AL BASHEER TRADING CO LLC",
    subject_kind: "ENTITY",
    basis_kind: "PRIMARY_LIST",
    basis_url: "",
    bond: GEN(75),
    status: "ASSERTED",
    matched_entry: '8211,6322,"aka","AL-BASHAER TRADING COMPANY, LTD",-0- ',
    matched_list: "OFAC_ALT",
    source_digest: ALT_DIGEST,
    source_generated: SDN_GENERATED,
    rationale:
      "No byte-exact hit. The scan extracted 5 candidate rows across the AL-BASHAIR / AL-BASHAAIR / AL-BASHAER / AL-BASHA'IR / AL-BASHIR alias cluster recorded under ent_num 8211. The identity round returned same-party against ALT.CSV row 1,242 on the shared trade name and matching legal form.",
    appeal_deadline: "2026-08-14T07:55:19",
    appeal_id: "",
    screened_at: "2026-08-07T07:55:19",
  },
  {
    // Reported but never screened. The screen() button is the next valid action
    // and anybody may press it.
    id: "R-1055",
    reporter: "0x4d1eA5b2C7f80934aB61d0cE7f1b53927c4A80f3",
    subject: "0xac4cc4b68ea24bbfaac8fd127b67ed445accce22",
    subject_kind: "ADDRESS",
    basis_kind: "PRIMARY_LIST",
    basis_url: "",
    bond: GEN(40),
    status: "PENDING",
    matched_entry: "",
    matched_list: "NONE",
    source_digest: "",
    source_generated: "",
    rationale: "",
    appeal_deadline: "",
    appeal_id: "",
    screened_at: "",
  },
  {
    // GARANTEX EUROPE OU, ent_num 36025, program RUSSIA-EO14024. Its Remarks
    // column carries a long list of digital-currency addresses and runs into
    // OFAC's own 1,000-character limit, which severs the final ETH value
    // mid-address. The queried subject matches every byte that survived, and
    // there is no byte after that to agree or disagree with.
    id: "R-1056",
    reporter: "0x91B7cE20D4a6F831075bA2e0c9D14fE8b7305Ac6",
    subject: "0x3AD9db589d201A5873850C4A1B1a5C1Bb7C4b0e2",
    subject_kind: "ADDRESS",
    basis_kind: "PRIMARY_LIST",
    basis_url: "",
    bond: GEN(120),
    status: "INCONCLUSIVE",
    inconclusive_reason: "SOURCE_TRUNCATED",
    surviving_prefix_len: 17,
    matched_entry:
      '36025,"GARANTEX EUROPE OU",-0- ,"RUSSIA-EO14024",-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,"…\n…alt. Digital Currency Address - ETH 0x3AD9db589d201A5',
    matched_list: "OFAC_SDN",
    source_digest: SDN_DIGEST,
    source_generated: SDN_GENERATED,
    rationale:
      "The published row is cut off. OFAC truncates the Remarks column at 1,000 characters and this record's address list exceeds it, so the last digital-currency value ends mid-address after 17 of 42 characters. The subject matches all 17 surviving characters exactly. The remaining 25 characters were never published, so no comparison can settle the question, and no identity round was run: asking a model to complete a sanctions address is precisely the guess this contract exists to refuse. Status INCONCLUSIVE, reason SOURCE_TRUNCATED. Rescreen when the authority republishes the file.",
    appeal_deadline: "",
    appeal_id: "",
    screened_at: "2026-08-20T15:48:26",
  },
];

export const MOCK_DETERMINATIONS: Determination[] = FIXTURES.map((fixture) => ({
  inconclusive_reason: "" as const,
  surviving_prefix_len: 0,
  ...fixture,
}));

/* ------------------------------------------------------------------------- *
 * Appeals
 * ------------------------------------------------------------------------- */

export const MOCK_APPEALS: Appeal[] = [
  {
    id: "A-201",
    determination_id: "R-1049",
    appellant: "0xE3a70Cb4915dF2870bB16cA9e0347fD8b1c02546",
    evidence_url: "https://nuri-petrochemical.example/corporate/registration",
    grounds: "DIFFERENT_PARTY",
    bond: GEN(300),
    status: "OPEN",
    verdict_rationale: "",
    evidence_digest: "",
    settled_at: "",
  },
  {
    id: "A-202",
    determination_id: "R-1051",
    appellant: "0xB47c1F09a3Ee5D2814cB60739eA0f5C82d16b304",
    evidence_url: "https://alnourtrading.example/about/registration",
    grounds: "DIFFERENT_PARTY",
    bond: GEN(500),
    status: "OVERTURNED",
    verdict_rationale:
      "Taken at its strongest, the appellant's evidence defeats the stated ground. The listed entry SDN.CSV row 17,991 is a charity or nonprofit organisation, Organization Type recorded as other human health activities, Linked To HAMAS, established 2001, located in Gaza. The appellant is a commodity trading company registered in Beirut in 2014 with a distinct commercial registry number, and the romanisation AL-NUR / AL NOUR is shared across many unrelated parties. Nothing in the primary source connects the two. Verdict: different party. The reporter's bond transfers to the appellant.",
    evidence_digest: "0x8c17be44f5ad2b70e91c3d5806fa47b2d3e91c0a5b6f7284ad3901cf6e2b4471",
    settled_at: "2026-08-18T13:20:44",
  },
  {
    id: "A-203",
    determination_id: "R-1052",
    appellant: "0x5A8fD1c73B02e694A1cf58D0b7326eE41f9c8073",
    evidence_url: "https://alnourmedia.example/legal/corporate-history",
    grounds: "INVALID_ASSOCIATION",
    bond: GEN(200),
    status: "UNCLEAR",
    verdict_rationale:
      "Validators did not reach agreement. The appellant's page asserts separate incorporation in 2019 and no shareholding overlap with the listed broadcaster, but publishes no registry document, and the primary source records only a trade name and two web addresses. On this record the round could not establish either that the association is invalid or that it holds. Refusing to choose is the correct output: both bonds are returned and the determination is written CONTESTED so an integrator applies its own risk tolerance rather than inheriting a coin flip.",
    evidence_digest: "0x41d9a7350c2be86147fa09d5b7e3c412806af5931dc2e7480b6a15fe93c0d287",
    settled_at: "2026-08-16T21:47:10",
  },
];

/* ------------------------------------------------------------------------- *
 * The source matrix, as it stands after the fixture screenings.
 * Three states, never two: checked / unreachable / not applicable.
 * ------------------------------------------------------------------------- */

export function mockSourceRows(subjectKind: "ADDRESS" | "ENTITY"): SourceRow[] {
  return [
    {
      file: "SDN.CSV",
      url: "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.CSV",
      list: "OFAC_SDN",
      state: "checked",
      detail: `19,249 rows · 5,647,099 bytes · sha256 ${SDN_DIGEST.slice(0, 10)}…`,
    },
    {
      file: "ALT.CSV",
      url: "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/ALT.CSV",
      list: "OFAC_ALT",
      state: subjectKind === "ENTITY" ? "checked" : "not-applicable",
      detail:
        subjectKind === "ENTITY"
          ? `alias file · 1,063,617 bytes · sha256 ${ALT_DIGEST.slice(0, 10)}…`
          : "alias file holds names only; an address subject cannot appear in it",
    },
    {
      file: "consolidated.xml",
      url: "https://scsanctions.un.org/resources/xml/en/consolidated.xml",
      list: "UN_CONSOLIDATED",
      state: "checked",
      detail: `dateGenerated 2026-08-19 · 2,176,185 bytes · sha256 ${UN_DIGEST.slice(0, 10)}…`,
    },
  ];
}

/** Counter for the masthead. Derived, never hand-written. */
export const MOCK_REPORTER_COUNT = new Set(MOCK_DETERMINATIONS.map((d) => d.reporter)).size;
