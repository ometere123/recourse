#!/usr/bin/env python3
"""Behavioural drift guard: run the pre-filter's own test suite against the copy that is
actually inside the contract.

`verify-prefilter.mjs` proves the two files are textually identical, which is cheap and
catches every realistic accident. This proves something stronger and slower: it lifts the
spliced region out of `contracts/Recourse.py`, execs it as a standalone module, and points
the 52-test suite at *that* instead of at the file the tests were written against.

    python scripts/verify_embedded_prefilter.py

Exits non-zero on any failure. Requires the SDN.CSV fixture to be present for the corpus
tier; without it those tests skip and the run still passes, so check the skip count.
"""

import io
import os
import sys
import types
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CONTRACT = os.path.join(ROOT, "contracts", "Recourse.py")
TESTDIR = os.path.join(os.path.dirname(ROOT), "_build", "recourse-prefilter")

BEGIN = "# BEGIN embedded deterministic pre-filter"
END = "# END embedded deterministic pre-filter"
RULE = "# ===="


def extract(path):
    """Everything between the BEGIN banner's closing rule and the END banner."""
    lines = io.open(path, encoding="utf-8").read().split("\n")
    begin = next((i for i, l in enumerate(lines) if l.startswith(BEGIN)), -1)
    end = next((i for i, l in enumerate(lines) if l.startswith(END)), -1)
    if begin < 0 or end < 0 or end < begin:
        sys.exit("FAIL: the contract's BEGIN/END banners are missing or out of order")
    rule = next(
        (i for i in range(begin + 1, end) if lines[i].startswith(RULE)), -1
    )
    if rule < 0:
        sys.exit("FAIL: the BEGIN banner has no closing rule line")
    # The END banner opens with its own rule line, which falls inside the slice. Back over
    # any trailing rule or bare-comment lines so the region is code and nothing else.
    stop = end
    while stop > rule + 1 and lines[stop - 1].lstrip("#").strip(" =") == "":
        stop -= 1
    return "\n".join(lines[rule + 1 : stop]).strip("\n"), rule + 2


def main():
    region, first_line = extract(CONTRACT)
    n = len(region.split("\n"))

    # Exec into a bare module named `prefilter`, then install it under that name so the
    # test suite's `import prefilter as pf` resolves to the embedded copy rather than to
    # the file on disk. This is the whole trick, and it is why the check is meaningful:
    # the tests cannot tell which copy they are running against.
    mod = types.ModuleType("prefilter")
    mod.__file__ = "<embedded in contracts/Recourse.py:%d>" % first_line
    try:
        exec(compile(region, mod.__file__, "exec"), mod.__dict__)
    except SyntaxError as exc:
        sys.exit("FAIL: the embedded region does not compile: %s" % exc)
    sys.modules["prefilter"] = mod

    fns = sorted(
        k
        for k, v in mod.__dict__.items()
        if isinstance(v, types.FunctionType) and not k.startswith("_")
    )

    print("Embedded region : contracts/Recourse.py line %d, %d lines" % (first_line, n))
    print("Public functions: %d - %s" % (len(fns), ", ".join(fns)))
    print()

    if not os.path.isdir(TESTDIR):
        sys.exit("FAIL: cannot find the test suite at %s" % TESTDIR)
    os.chdir(TESTDIR)
    sys.path.insert(0, os.getcwd())

    suite = unittest.TestLoader().loadTestsFromName("test_prefilter")
    result = unittest.TextTestRunner(verbosity=2).run(suite)

    print()
    print(
        "Embedded copy: %d run, %d failures, %d errors, %d skipped"
        % (
            result.testsRun,
            len(result.failures),
            len(result.errors),
            len(result.skipped),
        )
    )
    if result.skipped:
        # Worth shouting about. The corpus tier is the part that found the truncation
        # defect, and a green run that silently skipped it proves much less.
        print(
            "NOTE: %d tests skipped — the SDN.CSV fixture is absent, so the corpus tier "
            "did not run." % len(result.skipped)
        )
    sys.exit(0 if result.wasSuccessful() else 1)


if __name__ == "__main__":
    main()
