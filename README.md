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

Live app: **https://recourse-genlayer.vercel.app** — wired to the StudioNet contract below, so it reads the same determinations recorded here. There is no backend: no API route, database, indexer, worker or cron. Reads and writes go from the browser straight to the GenLayer RPC, and every time transition is a button anyone can press.

StudioNet contract: `0xA73d81f1f7Cf772AC5976317eE12D259a67D48F7`  
Deployment transaction: `0xe10234c3fe7c27bafb971c06cdf450af3397c9c8cf91a9bf9fd4ba26ad550173`
Contract SHA-256: `d21cbe18a55c51385c0b68c56d0b4127c8ba0fbbf7618ec07bba47e9a15f60a1`

The contract is [`contracts/Recourse.py`](./contracts/Recourse.py). Public methods are:

`report`, `screen`, `corroborate`, `rescreen`, `appeal`, `adjudicate_appeal`, `expire_appeal_window`, `refresh_source_health`, `check`, `get_determination`, `get_appeal`, `list_determinations`, `list_appeals`, `get_source_health`, `stats`, and `prefilter_fingerprint`.

`check(subject)` returns `UNKNOWN` when no determination exists. It never silently turns “not screened” into `CLEAR`.

## Proven on StudioNet

Two bonded determinations, one per subject kind, screened against the live OFAC SDN export. Full hashes, every stored field, and an explicit list of what was *not* proven are in [`evidence/studionet.json`](./evidence/studionet.json).

### `d1` — the NAME path, judgment-based and appealable

| Step | Transaction | Result |
| --- | --- | --- |
| `report` (payable, 0.001 GEN bond) | `0xfcd3f63cd188fb9697c78b5751e259c7464db82bee04a7a2a0f896423e452aad` | FINALIZED + GenVM `SUCCESS`; leader returned `d1`; 4 validator executions SUCCESS, 2 non-fatal ERROR; votes 3 AGREE / 2 IDLE |
| `screen("d1")` | `0x2ed5c3d24bc8755aa8ef79a925f23311b65627432b768a5c4b7c53c2512a1523` | FINALIZED + GenVM `SUCCESS` |
| `refresh_source_health()` | `0xb93fcf39310baf4e16be5798c59f67a02eb169f239cc597804b73caddb9442ab` | FINALIZED + GenVM `SUCCESS` |

Subject `AMNOKGANG TECHNOLOGY DEVELOPMENT COMPANY`, kind `NAME`, basis `https://sanctionslistservice.ofac.treas.gov/api/download/sdn.csv`. Stored result: `status: ASSERTED`, `entry_ent_num: 57056`, `alias_count: 4`, `damaged_total: 13`, `appealable: true`, appeal window open until `2026-08-28T14:03:52Z`, `bond: 1000000000000000` wei still escrowed (`bond_settled: false`, which is correct — an asserted finding rests on judgment and the bond is held until the subject has had the window to respond). `check(...)` returns `FLAGGED` / `d1` / shape `NAME`.

### `d2` — the ADDRESS path, deterministic and terminal

| Step | Transaction | Result |
| --- | --- | --- |
| `report` (payable, 0.001 GEN bond) | `0x2bd4cf38c16eac159eec0fca9bf7cbed6dab03f22a245fe5757d3a5326b224ab` | FINALIZED + GenVM `SUCCESS`; `value_credited: true`; leader returned `d2`; 4 validator executions SUCCESS, 2 non-fatal ERROR; votes 3 AGREE / 2 IDLE |
| `screen("d2")` | `0x97019eb388279483cd47ddc8f9fc9a07293ed0420d3911f76dc4d11774e0e245` | FINALIZED + GenVM `SUCCESS`; 4 SUCCESS, 2 non-fatal ERROR; votes 3 AGREE / 2 IDLE |
| bond returned to reporter | `0x37c061a5edc7d50b4920223225310d6f14fa344fa06cf7c64795862e648da5b0` | FINALIZED type-0 transfer of `1000000000000000` wei from the contract to `0xB5EcD6dDa36B370aca4af5E2005d8E2Ae89c6db2` |

Subject `0x0330070FD38Ec3bB94F58FA55D40368271E9e54A`, kind `ADDRESS`. The address is not invented: it is published in the same SDN record `ent_num 57056` that `d1` reached by name, so both paths converge on one real entity. Stored result: `status: LISTED`, `match_kind: EXACT`, `entry_program: DPRK4`, `entry_symbol: ETH`, `alias_count: 0`, `appealable: false`, `bond_settled: true`, verdict "Address appears verbatim on the SDN list.". `check(...)` returns `FLAGGED` / `d2` / shape `EVM`, and `subject_norm` is lowercased — proof the 40-hex argument arrived as a real string and `subject.strip()` ran.

**The bond lifecycle is proven on-chain in both directions, not asserted from a flag.** `d1` shows a bond *held* while judgment is contestable. `d2` shows one *returned*: `_settle` runs inside the same `screen` transaction as the `LISTED` verdict, and the resulting payout is the third, independent transaction above. Nobody called it.

**The permissionless expiry button was exercised, and it refused.** `expire_appeal_window("d1")` — transaction `0xf74bb15b661661113fe153754d857ec41c36739e4eddca6a068b680aa1504431`, value 0 — rolled back with `[EXPECTED] The appeal window for d1 is open until 2026-08-28T14:03:52Z`, and `d1` re-read afterwards was unchanged. That proves the gate and the absence of an operator role. It does not prove the settlement branch behind the gate, which cannot run before `2026-08-28T14:03:52Z`; this record was frozen on 2026-08-22, six days short, and says so rather than working around it.

**The large-source question is answered.** The contract fetched and scanned **5,647,099 bytes** of `SDN.CSV` inside consensus — byte-exact against the vendored fixture, and reported identically by **five** finalized transactions across both determinations and both subject paths, two of them a day apart. `get_source_health` independently confirms `source_len: 5647099` with `unreadable_records: 13`. No size, runtime, fetch-limit or validator constraint was hit.

**Not proven live, and not claimed anywhere:** the appeal lifecycle and the successful expiry settlement. See [Honest limits](#honest-limits).

## Local development

The hosted build at **https://recourse-genlayer.vercel.app** already runs against the deployed contract. To run it locally:

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

The live proof verifier never handles signer material. Payable writes must be submitted separately through an already-unlocked wallet or CLI account. Given the returned report and screen hashes plus the exact determination identity, the verifier waits for `FINALIZED`, requires explicit GenVM `SUCCESS`, validates subject, reporter, bond, determination id and final non-pending state, then reads `check`, source health and stats. It exits on rollback/error and prints machine-readable evidence. To re-verify the captured runs:

```bash
node scripts/exercise-studionet.mjs \
  0xfcd3f63cd188fb9697c78b5751e259c7464db82bee04a7a2a0f896423e452aad \
  0x2ed5c3d24bc8755aa8ef79a925f23311b65627432b768a5c4b7c53c2512a1523 \
  d1 "AMNOKGANG TECHNOLOGY DEVELOPMENT COMPANY" \
  0xB5EcD6dDa36B370aca4af5E2005d8E2Ae89c6db2
```

```bash
node scripts/exercise-studionet.mjs \
  0x2bd4cf38c16eac159eec0fca9bf7cbed6dab03f22a245fe5757d3a5326b224ab \
  0x97019eb388279483cd47ddc8f9fc9a07293ed0420d3911f76dc4d11774e0e245 \
  d2 0x0330070FD38Ec3bB94F58FA55D40368271E9e54A \
  0xB5EcD6dDa36B370aca4af5E2005d8E2Ae89c6db2
```

Both exit 0 as of 2026-08-22 exactly as printed, with no environment variable exported. That last clause was not true until that day: the script took `NEXT_PUBLIC_RECOURSE_CONTRACT` straight from `process.env` while its sibling `scripts/verify-schema.mjs` already loaded `.env.local` itself, so the commands as documented aborted on a missing variable before opening a socket. The sibling's loader was copied in; nothing else about the verifier changed and the contract was not touched. The second command matters beyond re-checking a hash: it passes the 40-hex subject to `client.readContract` as a plain JavaScript string through `genlayer-js` — the same library and the same encoding path the browser uses — so the ADDRESS record is confirmed by the frontend's own route, not only by the CLI bridge that submitted it.

#### How the payable writes were submitted

GenLayer CLI 0.39.2 `genlayer write` hardcodes `value: 0n` and exposes no option for `gl.message.value`. `--fee-value` is not that option: `parseTransactionFees` assigns it to the nested `fees.feeValue`, while application value is the top-level `value` parameter of `writeContract`, which `genlayer-js` already supports.

The bonded `report` calls above were therefore sent from a separate local clone of `genlayer-cli` at tag `v0.39.2` carrying a one-field addition that forwards `--value-wei` to that parameter. The `d2` submission additionally bypassed `parseScalar` so the 40-hex subject stayed a JavaScript string — the identical `[subject, "ADDRESS", basisUrl]` tuple with `value: 1000000000000000n` that [`src/app/report/page.tsx`](./src/app/report/page.tsx) builds. That clone is not part of this repository and no contract change was required. Signing was untouched: the patched clone uses the same `BaseAction`/`getClient` path and the same OS-keychain cache populated by `genlayer account unlock`. No key was exported, no wallet or keystore was created, and no password was supplied on a command line or written to a file.

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

`DEPLOYMENT.json` binds the current source SHA to the deployment record, and `deployedSourceVerified` is `true`: the deployed source was retrieved with `genlayer code 0xA73d81f1f7Cf772AC5976317eE12D259a67D48F7` and compared byte-for-byte against `contracts/Recourse.py` — 101,872 bytes on both sides, SHA-256 `d21cbe18a55c51385c0b68c56d0b4127c8ba0fbbf7618ec07bba47e9a15f60a1` equal. This was done on 2026-08-21 and re-confirmed on 2026-08-22 after all evidence work was complete; the contract was never redeployed, so the address, deployment transaction and hash above are the originals. This is a claim about the contract source, not an independent audit of validator bytecode.

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

What is proven live are the two determinations recorded above — one per subject kind — and the bond lifecycle in both directions. What is not:

- **The appeal lifecycle has no live proof.** `d1` is appealable and its window is open until `2026-08-28T14:03:52Z`, but no appeal was filed and no live adjudication ran. This was a deliberate choice, not an oversight: `d1`'s subject is a genuinely OFAC-listed DPRK entity, so there is no honest evidence with which to contest the finding, and filing an appeal on invented grounds would have manufactured the proof rather than earned it. All three appeal dispositions, settlement latches, expiry and no-double-settlement are covered by direct tests against the production code paths.
- **The successful expiry-settlement branch of `expire_appeal_window` is time-gated until `2026-08-28T14:03:52Z`.** Only the gate itself could be exercised on 2026-08-22 — transaction `0xf74bb15b661661113fe153754d857ec41c36739e4eddca6a068b680aa1504431` records the live refusal and the six-day gap. The *returned* half of the bond lifecycle is instead proven live by `d2` above, whose settlement is immediate and whose payout is an independent on-chain fact.
- **The stock CLI's ADDRESS-coercion limitation was verified but is no longer a product gap.** An early attempt — transaction `0xdbcc1664ecae30c06f3f9f9e5f9b3db49f6c325ff233388c8b7ea4d5c5ae98a0` — reached FINALIZED with GenVM `contract_error` because GenLayer CLI 0.39.2 `parseScalar` coerces any `^0x[0-9a-fA-F]{40}$` argument into a `CalldataAddress`, so `report`'s `subject: str` received an Address object and raised `AttributeError`. That attempt stranded 0.001 GEN in the contract (StudioNet does not roll back `gl.message.value` on GenVM revert), and the amount is verifiable arithmetic: `stats.balance` is `2000000000000000` wei while the escrowed bonds total `1000000000000000`, so the 0.001 GEN difference is exactly this transfer. It is unrecoverable — the contract has no sweep or admin-withdraw, which is deliberate — so it is recorded rather than written off. The ADDRESS path itself was proven live on 2026-08-22 by submitting through a typed bridge that bypassed `parseScalar`, and the browser's `genlayer-js` route was never affected.

Direct tests execute the production address and name screen paths, source failure/truncation handling, bounded-candidate enforcement, all three appeal dispositions, settlement latches, pagination and rescreen rules. Live validator consensus and large-source runtime are no longer pending: both are established by the runs above, including the full 5,647,099-byte fetch inside consensus reported identically by five finalized transactions across two determinations and both subject paths.

## Submission notes

See [`REVIEW_RESPONSE.md`](./REVIEW_RESPONSE.md) for the reviewer-facing product explanation, verification evidence, and release limitations.
