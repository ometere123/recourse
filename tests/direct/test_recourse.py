MIN_REPORT_BOND_WEI = 1_000_000_000_000_000
MIN_APPEAL_BOND_WEI = 1_000_000_000_000_000
SUBJECT = "0x1111111111111111111111111111111111111111"
BASIS = "https://example.com/reporter-context"
LISTED_ETH_ADDRESS = "0x098b716b8aaf21512996dc57eb0615e2383e2f96"
TRUNCATED_BTC_ADDRESS = "1B11Ezqg3AXjqPeVxwqmnpump4nsFvVvW3"


def test_unseen_subject_is_unknown(contract):
    result = contract.check(SUBJECT)
    assert result["result"] == "UNKNOWN"
    assert result["determination_id"] == ""
    assert "not a clean screen" in result["note"].lower()


def test_report_requires_minimum_bond(direct_vm, contract, direct_alice):
    direct_vm.sender = direct_alice
    direct_vm.value = MIN_REPORT_BOND_WEI - 1
    with direct_vm.expect_revert("Report bond below the minimum"):
        contract.report(SUBJECT, "ADDRESS", BASIS)
    assert contract.check(SUBJECT)["result"] == "UNKNOWN"


def test_valid_report_is_pending_and_bound_to_reporter(direct_vm, contract, direct_alice):
    direct_vm.sender = direct_alice
    direct_vm.value = MIN_REPORT_BOND_WEI
    determination_id = contract.report(SUBJECT, "ADDRESS", BASIS)
    determination = contract.get_determination(determination_id)
    assert determination["subject_norm"] == SUBJECT
    assert str(determination["reporter"]).lower() == str(direct_alice).lower()
    assert int(determination["bond"]) == MIN_REPORT_BOND_WEI
    assert determination["status"] == "PENDING"
    check = contract.check(SUBJECT)
    assert check["result"] == "UNKNOWN"
    assert check["determination_id"] == determination_id


def test_listed_exact_match_is_not_appealable(direct_vm, contract, direct_alice, direct_bob):
    direct_vm.sender = direct_alice
    direct_vm.value = MIN_REPORT_BOND_WEI
    determination_id = contract.report(SUBJECT, "ADDRESS", BASIS)
    stored = contract.determinations.get(determination_id)
    stored.status = "LISTED"
    contract.determinations[determination_id] = stored

    direct_vm.sender = direct_bob
    direct_vm.value = MIN_APPEAL_BOND_WEI
    with direct_vm.expect_revert("not appealable here"):
        contract.appeal(
            determination_id,
            "https://example.com/evidence",
            "This address belongs to a different party and the exact record is mistaken.",
        )
    assert contract.get_determination(determination_id)["status"] == "LISTED"


def _create_report(direct_vm, contract, sender, subject=SUBJECT, kind="ADDRESS", value=MIN_REPORT_BOND_WEI):
    direct_vm.sender = sender
    direct_vm.value = value
    return contract.report(subject, kind, BASIS)


def _make_asserted(direct_vm, contract, reporter, subject="Example Organization"):
    determination_id = _create_report(
        direct_vm, contract, reporter, subject=subject, kind="NAME"
    )
    stored = contract.determinations.get(determination_id)
    stored.status = "ASSERTED"
    stored.entry_ent_num = "123"
    stored.entry_name = subject
    stored.verdict = "The bounded candidate record denotes the reported subject."
    stored.appeal_deadline = "2099-01-08T00:00:00Z"
    contract.determinations[determination_id] = stored
    return determination_id


def test_report_rejects_unknown_subject_kind(direct_vm, contract, direct_alice):
    direct_vm.sender = direct_alice
    direct_vm.value = MIN_REPORT_BOND_WEI
    with direct_vm.expect_revert("subject_kind must be one"):
        contract.report(SUBJECT, "PASSPORT", BASIS)


def test_report_rejects_malformed_address(direct_vm, contract, direct_alice):
    direct_vm.sender = direct_alice
    direct_vm.value = MIN_REPORT_BOND_WEI
    with direct_vm.expect_revert("Unreadable address"):
        contract.report("0xnot-an-address", "ADDRESS", BASIS)


def test_report_rejects_invalid_basis_url(direct_vm, contract, direct_alice):
    direct_vm.sender = direct_alice
    direct_vm.value = MIN_REPORT_BOND_WEI
    with direct_vm.expect_revert("basis_url must be an http(s) URL"):
        contract.report(SUBJECT, "ADDRESS", "not-a-url")


def test_open_duplicate_report_is_rejected(direct_vm, contract, direct_alice):
    _create_report(direct_vm, contract, direct_alice)
    direct_vm.value = MIN_REPORT_BOND_WEI
    with direct_vm.expect_revert("already has an open determination"):
        contract.report(SUBJECT, "ADDRESS", BASIS)


def test_name_report_normalises_and_stores_subject_kind(direct_vm, contract, direct_alice):
    determination_id = _create_report(
        direct_vm, contract, direct_alice, subject="  Example Organization  ", kind="NAME"
    )
    determination = contract.get_determination(determination_id)
    assert determination["subject"] == "Example Organization"
    assert determination["subject_norm"] == "EXAMPLE ORGANIZATION"
    assert determination["subject_kind"] == "NAME"


def test_check_maps_terminal_statuses_without_guessing(direct_vm, contract, direct_alice):
    determination_id = _create_report(direct_vm, contract, direct_alice)
    stored = contract.determinations.get(determination_id)
    for status, expected in (
        ("LISTED", "FLAGGED"),
        ("ASSERTED", "FLAGGED"),
        ("UPHELD", "FLAGGED"),
        ("NOT_LISTED", "CLEAR"),
        ("OVERTURNED", "CLEAR"),
        ("INCONCLUSIVE", "INCONCLUSIVE"),
        ("UNDER_APPEAL", "CONTESTED"),
        ("CONTESTED", "CONTESTED"),
        ("BOGUS", "UNKNOWN"),
    ):
        stored.status = status
        contract.determinations[determination_id] = stored
        assert contract.check(SUBJECT)["result"] == expected


def test_list_determinations_is_bounded_and_paginated(direct_vm, contract, direct_alice):
    first = _create_report(direct_vm, contract, direct_alice)
    stored = contract.determinations.get(first)
    stored.status = "NOT_LISTED"
    contract.determinations[first] = stored
    second_subject = "0x2222222222222222222222222222222222222222"
    second = _create_report(direct_vm, contract, direct_alice, subject=second_subject)
    page = contract.list_determinations(0, 1)
    assert len(page) == 1
    assert page[0]["id"] == first
    assert contract.list_determinations(1, 50)[0]["id"] == second
    assert contract.list_determinations(0, 500)[-1]["id"] == second


def test_appeal_validates_bond_and_evidence_before_state_change(
    direct_vm, contract, direct_alice, direct_bob
):
    determination_id = _create_report(direct_vm, contract, direct_alice)
    stored = contract.determinations.get(determination_id)
    stored.status = "ASSERTED"
    stored.appeal_deadline = "2099-01-01T00:00:00Z"
    stored.entry_ent_num = "123"
    stored.verdict = "same entity basis"
    contract.determinations[determination_id] = stored

    direct_vm.sender = direct_bob
    direct_vm.value = MIN_APPEAL_BOND_WEI - 1
    with direct_vm.expect_revert("Appeal bond below the minimum"):
        contract.appeal(determination_id, "https://example.com/evidence", "A" * 20)
    assert contract.get_determination(determination_id)["status"] == "ASSERTED"

    direct_vm.value = MIN_APPEAL_BOND_WEI
    with direct_vm.expect_revert("evidence_url must be an http(s) URL"):
        contract.appeal(determination_id, "evidence", "A" * 20)
    assert contract.get_determination(determination_id)["status"] == "ASSERTED"


def test_valid_appeal_stores_appellant_evidence_and_escrow(
    direct_vm, contract, direct_alice, direct_bob
):
    determination_id = _make_asserted(direct_vm, contract, direct_alice)
    direct_vm.sender = direct_bob
    direct_vm.value = MIN_APPEAL_BOND_WEI
    appeal_id = contract.appeal(
        determination_id,
        "https://example.com/evidence",
        "The incorporated entity has a different registration number.",
    )
    appeal = contract.get_appeal(appeal_id)
    determination = contract.get_determination(determination_id)
    assert appeal["determination_id"] == determination_id
    assert str(appeal["appellant"]).lower() == str(direct_bob).lower()
    assert appeal["bond"] == str(MIN_APPEAL_BOND_WEI)
    assert appeal["status"] == "PENDING"
    assert determination["status"] == "UNDER_APPEAL"
    assert determination["appeal_id"] == appeal_id


def test_duplicate_appeal_is_rejected(direct_vm, contract, direct_alice, direct_bob):
    determination_id = _make_asserted(direct_vm, contract, direct_alice)
    direct_vm.sender = direct_bob
    direct_vm.value = MIN_APPEAL_BOND_WEI
    contract.appeal(
        determination_id,
        "https://example.com/evidence",
        "The incorporated entity has a different registration number.",
    )
    direct_vm.value = MIN_APPEAL_BOND_WEI
    with direct_vm.expect_revert("Only an ASSERTED"):
        contract.appeal(
            determination_id,
            "https://example.com/evidence-2",
            "A second filing must not replace the first pending appeal.",
        )


def test_expire_appeal_window_refuses_early_or_repeated_settlement(
    direct_vm, contract, direct_alice
):
    determination_id = _make_asserted(direct_vm, contract, direct_alice)
    with direct_vm.expect_revert("appeal window"):
        contract.expire_appeal_window(determination_id)
    stored = contract.determinations.get(determination_id)
    stored.appeal_deadline = "2000-01-01T00:00:00Z"
    contract.determinations[determination_id] = stored
    contract.expire_appeal_window(determination_id)
    determination = contract.get_determination(determination_id)
    assert determination["status"] == "ASSERTED"
    assert determination["bond_settled"] is True
    with direct_vm.expect_revert("already settled"):
        contract.expire_appeal_window(determination_id)


def test_rescreen_after_cooldown_preserves_no_double_pay_latch(
    direct_vm, contract, direct_alice
):
    determination_id = _create_report(direct_vm, contract, direct_alice)
    stored = contract.determinations.get(determination_id)
    stored.status = "INCONCLUSIVE"
    stored.reason = "SOURCE_UNAVAILABLE"
    stored.screened_at = "2000-01-01T00:00:00Z"
    stored.bond_settled = True
    contract.determinations[determination_id] = stored
    contract.rescreen(determination_id)
    determination = contract.get_determination(determination_id)
    assert determination["status"] == "PENDING"
    assert determination["bond"] == "0"
    assert determination["bond_settled"] is True
    assert determination["screened_at"] == ""


def test_corroborate_rejects_non_adverse_state(direct_vm, contract, direct_alice):
    determination_id = _create_report(direct_vm, contract, direct_alice)
    with direct_vm.expect_revert("Only an adverse finding"):
        contract.corroborate(determination_id)


def test_source_health_and_stats_have_safe_initial_values(contract):
    health = contract.get_source_health()
    assert health["source_len"] == "0"
    assert health["unreadable_records"] == "0"
    stats = contract.stats()
    assert stats["determinations"] == "0"
    assert stats["appeals"] == "0"
    assert int(stats["min_report_bond_wei"]) == MIN_REPORT_BOND_WEI


def test_rescreen_requires_inconclusive_and_cooldown(direct_vm, contract, direct_alice):
    determination_id = _create_report(direct_vm, contract, direct_alice)
    with direct_vm.expect_revert("Only an INCONCLUSIVE"):
        contract.rescreen(determination_id)
    stored = contract.determinations.get(determination_id)
    stored.status = "INCONCLUSIVE"
    stored.screened_at = "2099-01-01T00:00:00Z"
    contract.determinations[determination_id] = stored
    with direct_vm.expect_revert("cooldown"):
        contract.rescreen(determination_id)


def _mock_sdn_fixture(direct_vm):
    with open("tests/prefilter/fixtures/SDN.CSV", "rb") as fixture:
        direct_vm.mock_web(
            r".*sanctionslistservice\.ofac\.treas\.gov/api/download/sdn\.csv.*",
            {"status": 200, "body": fixture.read()},
        )


def _mock_name_authorities(direct_vm):
    for filename, pattern in (
        ("SDN.CSV", r".*sanctionslistservice\.ofac\.treas\.gov/api/download/sdn\.csv.*"),
        ("ALT.CSV", r".*sanctionslistservice\.ofac\.treas\.gov/api/download/alt\.csv.*"),
        ("consolidated.xml", r".*scsanctions\.un\.org/resources/xml/en/consolidated\.xml.*"),
    ):
        with open(f"tests/prefilter/fixtures/{filename}", "rb") as fixture:
            direct_vm.mock_web(pattern, {"status": 200, "body": fixture.read()})


def test_screen_executes_exact_address_path_without_llm(
    direct_vm, contract, direct_alice
):
    _mock_sdn_fixture(direct_vm)
    determination_id = _create_report(
        direct_vm, contract, direct_alice, subject=LISTED_ETH_ADDRESS
    )
    direct_vm.mock_llm(r".*", "this response must never be consulted")
    contract.screen(determination_id)
    determination = contract.get_determination(determination_id)
    assert determination["status"] == "LISTED"
    assert determination["match_kind"] == "EXACT"
    assert determination["entry_ent_num"] != ""
    assert determination["bond_settled"] is True
    assert contract.check(LISTED_ETH_ADDRESS)["result"] == "FLAGGED"


def test_screen_executes_not_listed_path_and_slashes_once(
    direct_vm, contract, direct_alice
):
    _mock_sdn_fixture(direct_vm)
    determination_id = _create_report(direct_vm, contract, direct_alice)
    contract.screen(determination_id)
    determination = contract.get_determination(determination_id)
    assert determination["status"] == "NOT_LISTED"
    assert determination["match_kind"] == "NONE"
    assert determination["bond_settled"] is True
    assert int(contract.stats()["bounty_pool"]) == MIN_REPORT_BOND_WEI
    assert contract.check(SUBJECT)["result"] == "CLEAR"
    with direct_vm.expect_revert("not PENDING"):
        contract.screen(determination_id)
    assert int(contract.stats()["bounty_pool"]) == MIN_REPORT_BOND_WEI


def test_screen_source_unavailable_is_inconclusive_and_refunds(
    direct_vm, contract, direct_alice
):
    direct_vm.mock_web(
        r".*sanctionslistservice\.ofac\.treas\.gov/api/download/sdn\.csv.*",
        {"status": 503, "body": b"unavailable"},
    )
    determination_id = _create_report(direct_vm, contract, direct_alice)
    contract.screen(determination_id)
    determination = contract.get_determination(determination_id)
    assert determination["status"] == "INCONCLUSIVE"
    assert determination["reason"] == "SOURCE_UNAVAILABLE"
    assert determination["bond_settled"] is True
    assert int(contract.stats()["bounty_pool"]) == 0
    assert contract.check(SUBJECT)["result"] == "INCONCLUSIVE"


def test_screen_truncated_authority_record_never_becomes_clear(
    direct_vm, contract, direct_alice
):
    _mock_sdn_fixture(direct_vm)
    determination_id = _create_report(
        direct_vm, contract, direct_alice, subject=TRUNCATED_BTC_ADDRESS
    )
    contract.screen(determination_id)
    determination = contract.get_determination(determination_id)
    assert determination["status"] == "INCONCLUSIVE"
    assert determination["reason"] == "SOURCE_TRUNCATED"
    assert determination["match_kind"] == "TRUNCATED_PREFIX"
    assert determination["entry_name"] == "HYDRA MARKET"
    assert contract.check(TRUNCATED_BTC_ADDRESS)["result"] == "INCONCLUSIVE"


def test_refresh_source_health_records_canonical_source_facts(
    direct_vm, contract
):
    _mock_sdn_fixture(direct_vm)
    contract.refresh_source_health()
    health = contract.get_source_health()
    assert int(health["source_len"]) == 5_647_099
    assert int(health["unreadable_records"]) == 13


def test_refresh_source_health_fails_closed_when_source_is_unavailable(
    direct_vm, contract
):
    direct_vm.mock_web(
        r".*sanctionslistservice\.ofac\.treas\.gov/api/download/sdn\.csv.*",
        {"status": 503, "body": b"unavailable"},
    )
    with direct_vm.expect_revert("could not be retrieved as a complete export"):
        contract.refresh_source_health()
    assert contract.get_source_health()["source_len"] == "0"


def test_name_screen_accepts_only_a_bounded_candidate(
    direct_vm, contract, direct_alice
):
    _mock_name_authorities(direct_vm)
    direct_vm.mock_llm(
        r".*primary-source sanctions records.*",
        '{"verdict":"SAME_ENTITY","ent_num":"33854",'
        '"basis":"The exact CHATEX record denotes the reported entity.",'
        '"rationale":"Exact normalized name and published record."}',
    )
    determination_id = _create_report(
        direct_vm, contract, direct_alice, subject="Chatex", kind="NAME"
    )
    contract.screen(determination_id)
    determination = contract.get_determination(determination_id)
    assert determination["status"] == "ASSERTED"
    assert determination["entry_ent_num"] == "33854"
    assert determination["bond_settled"] is False
    assert determination["appeal_deadline"] != ""


def test_name_screen_discards_model_invented_candidate(
    direct_vm, contract, direct_alice
):
    _mock_name_authorities(direct_vm)
    direct_vm.mock_llm(
        r".*primary-source sanctions records.*",
        '{"verdict":"SAME_ENTITY","ent_num":"999999999",'
        '"basis":"Invented record.","rationale":"Not in bounded evidence."}',
    )
    determination_id = _create_report(
        direct_vm, contract, direct_alice, subject="Chatex", kind="NAME"
    )
    contract.screen(determination_id)
    determination = contract.get_determination(determination_id)
    assert determination["status"] == "INCONCLUSIVE"
    assert determination["reason"] == "MODEL_UNUSABLE"
    assert determination["entry_ent_num"] == ""
    assert determination["bond_settled"] is True


def test_name_screen_with_no_candidates_never_invokes_llm(
    direct_vm, contract, direct_alice
):
    _mock_name_authorities(direct_vm)
    direct_vm.mock_llm(r".*", "this response must never be consulted")
    determination_id = _create_report(
        direct_vm,
        contract,
        direct_alice,
        subject="ZZZ ABSENT AUTHORITY SUBJECT ZZZ",
        kind="NAME",
    )
    contract.screen(determination_id)
    determination = contract.get_determination(determination_id)
    assert determination["status"] == "NOT_LISTED"
    assert determination["entry_ent_num"] == ""
    assert determination["bond_settled"] is True


def test_name_screen_malformed_model_output_is_inconclusive(
    direct_vm, contract, direct_alice
):
    _mock_name_authorities(direct_vm)
    direct_vm.mock_llm(
        r".*primary-source sanctions records.*",
        '{"verdict":"NOT_AN_ALLOWED_VERDICT","ent_num":"33854"}',
    )
    determination_id = _create_report(
        direct_vm, contract, direct_alice, subject="Chatex", kind="NAME"
    )
    contract.screen(determination_id)
    determination = contract.get_determination(determination_id)
    assert determination["status"] == "INCONCLUSIVE"
    assert determination["reason"] == "IDENTITY_UNCLEAR"
    assert determination["bond_settled"] is True


def _create_pending_appeal(direct_vm, contract, reporter, appellant):
    determination_id = _make_asserted(direct_vm, contract, reporter)
    direct_vm.sender = appellant
    direct_vm.value = MIN_APPEAL_BOND_WEI
    appeal_id = contract.appeal(
        determination_id,
        "https://example.com/evidence",
        "The corporate registration number identifies a different legal party.",
    )
    return determination_id, appeal_id


def _mock_appeal_sources(direct_vm, disposition):
    _mock_sdn_fixture(direct_vm)
    direct_vm.mock_web(
        r".*example\.com/evidence.*",
        {"status": 200, "body": b"Registry number 999 belongs to another company."},
    )
    direct_vm.mock_llm(
        r".*Does the submitted evidence defeat the stated basis above.*",
        '{"disposition":"' + disposition + '",'
        '"basis_addressed":"same entity basis",'
        '"rationale":"The submitted registry evidence was weighed against that basis."}',
    )


def test_appeal_adjudication_overturned_settles_both_bonds_once(
    direct_vm, contract, direct_alice, direct_bob
):
    determination_id, appeal_id = _create_pending_appeal(
        direct_vm, contract, direct_alice, direct_bob
    )
    _mock_appeal_sources(direct_vm, "OVERTURNED")
    contract.adjudicate_appeal(appeal_id)
    assert contract.get_determination(determination_id)["status"] == "OVERTURNED"
    appeal = contract.get_appeal(appeal_id)
    assert appeal["status"] == "OVERTURNED"
    assert appeal["bond_settled"] is True
    assert contract.get_determination(determination_id)["bond_settled"] is True
    with direct_vm.expect_revert("not PENDING"):
        contract.adjudicate_appeal(appeal_id)


def test_appeal_adjudication_upheld_slashes_appeal_bond(
    direct_vm, contract, direct_alice, direct_bob
):
    determination_id, appeal_id = _create_pending_appeal(
        direct_vm, contract, direct_alice, direct_bob
    )
    _mock_appeal_sources(direct_vm, "UPHELD")
    contract.adjudicate_appeal(appeal_id)
    assert contract.get_determination(determination_id)["status"] == "UPHELD"
    assert contract.get_appeal(appeal_id)["status"] == "UPHELD"
    assert int(contract.stats()["bounty_pool"]) == MIN_APPEAL_BOND_WEI


def test_appeal_adjudication_unclear_returns_bonds_as_contested(
    direct_vm, contract, direct_alice, direct_bob
):
    determination_id, appeal_id = _create_pending_appeal(
        direct_vm, contract, direct_alice, direct_bob
    )
    _mock_appeal_sources(direct_vm, "UNCLEAR")
    contract.adjudicate_appeal(appeal_id)
    assert contract.get_determination(determination_id)["status"] == "CONTESTED"
    appeal = contract.get_appeal(appeal_id)
    assert appeal["status"] == "CONTESTED"
    assert appeal["bond_settled"] is True
    assert contract.get_determination(determination_id)["bond_settled"] is True
    assert int(contract.stats()["bounty_pool"]) == 0
