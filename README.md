# Recourse

Recourse is an appealable sanctions-screening register built around a GenLayer Intelligent Contract. A reporter posts a subject and a bond. Anyone can run the screen. The contract fetches the published OFAC and UN exports inside validator consensus, performs deterministic byte and bounded-candidate checks first, and asks validators for an identity judgment only when arithmetic cannot settle the question.

The result is a public determination rather than an opaque score:

- `LISTED`: an exact address match in the published export; no model is consulted and the result is not appealable.
- `NOT_LISTED`: the subject is absent from the readable portion of the export. This is scoped clearance, not a claim that the subject is unsanctioned everywhere.
- `INCONCLUSIVE`: the source is unavailable, internally inconsistent, truncated, or the identity round cannot be used. The contract refuses to guess.
- `ASSERTED`: validators judged a named subject to be the same party as a bounded candidate record. This finding can be appealed.
- `UNDER_APPEAL`, `UPHELD`, `OVERTURNED`, and `CONTESTED`: the appeal lifecycle is recorded on-chain.

## Why GenLayer is essential

The raw question “does this exact address occur in this file?” is deterministic and is settled without an LLM. The hard cases are different: validators must independently retrieve volatile public files and reconcile whether a name refers to the same legal party. GenLayer supplies the independent fetches and comparative consensus; the contract re-checks the selected candidate and controls bond settlement deterministically.

## Contract surface

StudioNet contract: `0xA73d81f1f7Cf772AC5976317eE12D259a67D48F7`  
Deployment transaction: `0xe10234c3fe7c27bafb971c06cdf450af3397c9c8cf91a9bf9fd4ba26ad550173`
Contract SHA-256: `d21cbe18a55c51385c0b68c56d0b4127c8ba0fbbf7618ec07bba47e9a15f60a1`

The contract is [`contracts/Recourse.py`](./contracts/Recourse.py). Public methods are:

`report`, `screen`, `corroborate`, `rescreen`, `appeal`, `adjudicate_appeal`, `expire_appeal_window`, `refresh_source_health`, `check`, `get_determination`, `get_appeal`, `list_determinations`, `list_appeals`, `get_source_health`, `stats`, and `prefilter_fingerprint`.

`check(subject)` returns `UNKNOWN` when no determination exists. It never silently turns “not screened” into `CLEAR`.

## Proven on StudioNet

One bonded NAME determination, `d1`, screened against the live OFAC SDN export. Full hashes, every stored field, and an explicit list of what was *not* proven are in [`evidence/studionet.json`](./evidence/studionet.json).

| Step | Transaction | Result |
| --- | --- | --- |
| `report` (payable, 0.001 GEN bond) | `0xfcd3f63cd188fb9697c78b5751e259c7464db82bee04a7a2a0f896423e452aad` | FINALIZED + GenVM `SUCCESS`; leader returned `d1`; 4 validator executions SUCCESS, 2 non-fatal ERROR; votes 3 AGREE / 2 IDLE |
| `screen("d1")` | `0x2ed5c3d24bc8755aa8ef79a925f23311b65627432b768a5c4b7c53c2512a1523` | FINALIZED + GenVM `SUCCESS` |
| `refresh_source_health()` | `0xb93fcf39310baf4e16be5798c59f67a02eb169f239cc597804b73caddb9442ab` | FINALIZED + GenVM `SUCCESS` |

Subject `AMNOKGANG TECHNOLOGY DEVELOPMENT COMPANY`, kind `NAME`, basis `https://sanctionslistservice.ofac.treas.gov/api/download/sdn.csv`. Stored result: `status: ASSERTED`, `entry_ent_num: 57056`, `alias_count: 4`, `damaged_total: 13`, `appealable: true`, appeal window open until `2026-08-28T14:03:52Z`, `bond: 1000000000000000` wei still escrowed (`bond_settled: false`, which is correct — an asserted finding rests on judgment and the bond is held until the subject has had the window to respond). `check(...)` returns `FLAGGED` / `d1` / shape `NAME`.

**The large-source question is answered.** The contract fetched and scanned **5,647,099 bytes** of `SDN.CSV` inside consensus — byte-exact against the vendored fixture, and reported identically by all three finalized transactions above. `get_source_health` independently confirms `source_len: 5647099` with `unreadable_records: 13`, observed `2026-08-21T14:11:19.481662Z`. No size, runtime, fetch-limit or validator constraint was hit.

**Not proven live, and not claimed anywhere:** the ADDRESS path and the appeal lifecycle. See [Honest limits](#honest-limits).

## Local development

```bash
npm install
copy .env.example .env.local
npm run dev
```

Without `NEXT_PUBLIC_RECOURSE_CONTRACT`, the frontend intentionally runs in fixture mode. Fixtures are real captured source excerpts, but they are not contract writes and no bond was posted. Configure a deployed address to enable live reads and wallet writes:

```dotenv
NEXT_PUBLIC_RECOURSE_CONTRACT=0xA73d81f1f7Cf772AC5976317eE12D259a67D48F7
NEXT_PUBLIC_GENLAYER_ENDPOINT=https://studio.genlayer.com/api
NEXT_PUBLIC_GENLAYER_CHAIN=studionet
```

## Verification

### Offline and reproducible

```bash
npm install
python -m pip install -r requirements-dev.txt
npm run verify
```

This single command verifies the committed fixture bytes, textual prefilter parity, the behavioral corpus suite against the copy extracted from the contract, fail-closed frontend regressions, deployment-record drift, TypeScript, ESLint, and the production build.

The repository contains the tested scanner, suite, and pinned authority fixtures under `tests/prefilter/`. The current verification pass ran all 52 tests against the copy extracted from `contracts/Recourse.py`: 0 failures, 0 errors, 0 skipped. `manifest.json` pins binary sizes and SHA-256 values, while `.gitattributes` prevents Git from converting the authority captures' line endings. GitHub Actions re-runs the full release suite on Linux and independently verifies the fixture bytes on Windows.

### Live StudioNet

```bash
npm run verify:schema
node scripts/exercise-studionet.mjs \
  <report-tx-hash> <screen-tx-hash> <determination-id> <subject> <reporter-address>
```

The live proof verifier never handles signer material. Payable writes must be submitted separately through an already-unlocked wallet or CLI account. Given the returned report and screen hashes plus the exact determination identity, the verifier waits for `FINALIZED`, requires explicit GenVM `SUCCESS`, validates subject, reporter, bond, determination id and final non-pending state, then reads `check`, source health and stats. It exits on rollback/error and prints machine-readable evidence. To re-verify the captured run:

```bash
node scripts/exercise-studionet.mjs \
  0xfcd3f63cd188fb9697c78b5751e259c7464db82bee04a7a2a0f896423e452aad \
  0x2ed5c3d24bc8755aa8ef79a925f23311b65627432b768a5c4b7c53c2512a1523 \
  d1 "AMNOKGANG TECHNOLOGY DEVELOPMENT COMPANY" \
  0xB5EcD6dDa36B370aca4af5E2005d8E2Ae89c6db2
```

#### How the payable write was submitted

GenLayer CLI 0.39.2 `genlayer write` hardcodes `value: 0n` and exposes no option for `gl.message.value`. `--fee-value` is not that option: `parseTransactionFees` assigns it to the nested `fees.feeValue`, while application value is the top-level `value` parameter of `writeContract`, which `genlayer-js` already supports.

The bonded `report` above was therefore sent from a separate local clone of `genlayer-cli` at tag `v0.39.2` carrying a one-field addition that forwards `--value-wei` to that parameter. That clone is not part of this repository and no contract change was required. Signing was untouched: the patched clone uses the same `BaseAction`/`getClient` path and the same OS-keychain cache populated by `genlayer account unlock`. No key was exported, no wallet or keystore was created, and no password was supplied on a command line or written to a file.

Current local release checks:

```text
npm run verify             PASS
npm run build              PASS (Next.js 16 production build; 7 routes generated)
python -m py_compile       PASS for contracts/Recourse.py
genvm-lint check           PASS: 16 methods (8 view, 8 write), 0 constructor args
embedded prefilter suite   PASS: 52 run, 0 failures, 0 errors, 0 skipped
direct contract tests      PASS: 32 tests
frontend fail-closed tests PASS: 12 tests
StudioNet schema           PASS: 16 required methods present; prefilter fingerprint and stats read successfully
npm audit --omit=dev       PASS: 0 vulnerabilities
```

`DEPLOYMENT.json` binds the current source SHA to the deployment record, and `deployedSourceVerified` is now `true`: the deployed source was retrieved with `genlayer code 0xA73d81f1f7Cf772AC5976317eE12D259a67D48F7` on 2026-08-21 and compared byte-for-byte against `contracts/Recourse.py` — 101,872 bytes on both sides, SHA-256 equal. This is a claim about the contract source, not an independent audit of validator bytecode.

### Dependency audit

Both CI installs reported 3 high-severity findings. They were real and they were in the production tree, not dev-only: `postcss <=8.5.22` (GHSA-qx2v-qp2m-jg93, GHSA-6g55-p6wh-862q, GHSA-fxqj-rqcc-2cmp, GHSA-r28c-9q8g-f849) nested under `next`, `sharp <0.35.0` (GHSA-f88m-g3jw-g9cj, inherited libvips CVEs) as an optional dependency of `next`, and `next` itself flagged for depending on both. All three were transitive through one direct dependency, `next 16.2.12`.

npm's own recommended remedy was `next@16.3.2`. It was applied deliberately — `npm install next@16.3.2 --save-exact`, reviewed — rather than through `npm audit fix --force`, which is documented to install outside the stated dependency range and would have been an unreviewed framework change in a submission build. `postcss` now resolves to `8.5.23` and `sharp` to `0.35.3`, both outside their advisory ranges; `npm audit` and `npm audit --omit=dev` both report 0 vulnerabilities. This app does not import `next/image`, so the `sharp` path was never reachable at runtime, but it is on a fixed version regardless rather than argued away.

## Authority sources

The validator fetch endpoints are exactly:

- OFAC SDN: `https://sanctionslistservice.ofac.treas.gov/api/download/sdn.csv`
- OFAC alternatives: `https://sanctionslistservice.ofac.treas.gov/api/download/alt.csv`
- UN consolidated list: `https://scsanctions.un.org/resources/xml/en/consolidated.xml`

The `basis_url` supplied to `report()` is the reporter's cited context for why the subject should be screened. It is stored for accountability; it is not a sanctions list and is not used to decide the primary-list result. Validators fetch the authority endpoints above independently.

## Main user flow

1. Connect a wallet and submit a public source URL, subject, subject kind, and report bond.
2. Anyone presses `screen()`; validators fetch the named public sources independently.
3. Read the determination, stored designation fields, source-health facts, and settlement record.
4. If the result is a judgment-based `ASSERTED` finding, anyone may file a bonded appeal with evidence.
5. Anyone may run `adjudicate_appeal()` or close an expired appeal window.

All writes show wallet, transaction, consensus, expected-rejection, external-source, and retryable-timeout states separately. The app never renders an unclassified write failure as a sanctions result.

## Honest limits

Recourse covers the public exports named in the contract; it is not a universal sanctions or KYC service and is not legal advice. `NOT_LISTED` means only that a subject was not found in the successfully readable scope of the specific exports checked by that determination. OFAC truncates some long `Remarks` fields, so an address cut at the source is explicitly `INCONCLUSIVE`. Public files can change, disappear, or be republished; `rescreen()` and `refresh_source_health()` make that visible rather than hiding it. StudioNet GEN is simulated network value.

What is proven live is one NAME determination, recorded above. What is not:

- **The ADDRESS path has no live determination.** The one attempt, transaction `0xdbcc1664ecae30c06f3f9f9e5f9b3db49f6c325ff233388c8b7ea4d5c5ae98a0`, reached FINALIZED with a GenVM `contract_error` at exit code 1 and stored nothing. The cause is in the CLI, not the contract: GenLayer CLI 0.39.2 `parseScalar` coerces any argument matching `^0x[0-9a-fA-F]{40}$` into a `CalldataAddress`, so `report`'s `subject: str` parameter received an `Address` object and `subject.strip()` raised `AttributeError`. There is no escape hatch — `parseArg`'s JSON branch routes through `coerceValue` → `parseScalar` too. The contract's validation behaved correctly; it rejected a malformed subject. The frontend is unaffected, because `genlayer-js` passes typed JavaScript values straight through.
- **That failed attempt stranded 0.001 GEN in the contract.** StudioNet does not roll back `gl.message.value` when the GenVM reverts — `raise gl.vm.UserError` is not an EVM revert, so the bond had already moved and stayed. It is verifiable arithmetic rather than a footnote: `stats.balance` is `2000000000000000` wei while the only determination holds a `1000000000000000` wei escrowed bond, and the 0.001 GEN difference is exactly this transfer. It is unrecoverable, because the contract has no sweep or admin-withdraw path. That absence is deliberate — an owner who can move escrowed bonds is a worse problem than 0.001 GEN of simulated value — so the amount is recorded here instead of being quietly written off.
- **The appeal lifecycle has no live proof.** `d1` is appealable and its window is open until `2026-08-28T14:03:52Z`, but no appeal was filed and no live adjudication ran. All three appeal dispositions, settlement latches, expiry and no-double-settlement are covered by direct tests against the production code paths only.

Direct tests execute the production address and name screen paths, source failure/truncation handling, bounded-candidate enforcement, all three appeal dispositions, settlement latches, pagination and rescreen rules. Live validator consensus and large-source runtime are no longer pending: both are established by the NAME run above, including the full 5,647,099-byte fetch inside consensus.

## Submission notes

See [`REVIEW_RESPONSE.md`](./REVIEW_RESPONSE.md) for the reviewer-facing product explanation, verification evidence, and release limitations.
