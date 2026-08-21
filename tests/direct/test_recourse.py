MIN_REPORT_BOND_WEI = 1_000_000_000_000_000
MIN_APPEAL_BOND_WEI = 1_000_000_000_000_000
SUBJECT = "0x1111111111111111111111111111111111111111"
BASIS = "https://example.com/reporter-context"


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
