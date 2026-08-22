# Reviewer Response

**Live app:** https://recourse-genlayer.vercel.app · **StudioNet contract:** `0xA73d81f1f7Cf772AC5976317eE12D259a67D48F7`

There is no backend anywhere in this project: no API route, server action, database, indexer, worker or cron. Reads and writes go from the browser straight to the GenLayer RPC, and every time transition (screening, corroboration, rescreening, appeal adjudication, expired-window settlement) is a button any address can press.

## What problem does this solve?

Commercial screening APIs usually collapse a sanctions lookup into a score or colour. A person affected by a false positive has no public record of the source row, no clear statement of whether a model was involved, and no mechanism to contest the finding. Recourse makes the determination, evidence, bond, appeal, and settlement state public and queryable.

## What is GenLayer doing?

The contract fetches OFAC `SDN.CSV`, OFAC `ALT.CSV`, and the UN consolidated export inside consensus. Exact address matching and source truncation detection are deterministic. Name screening is narrowed to a bounded set of arithmetic candidates, then validators reach comparative agreement on whether the candidate denotes the subject. Appeal adjudication asks the equally narrow question of whether submitted evidence defeats the stated basis.

## Evidence and tests

- The embedded deterministic prefilter was exercised in the current release pass against the captured 5.65 MB OFAC export: 52 tests passed with 0 failures, 0 errors, and 0 skipped tests, including quoted CSV fields, malformed rows, address normalization, truncation detection, and bounded candidate extraction.
- The contract contains `prefilter_fingerprint()` and the repository includes textual and behavioural guards so the tested scanner cannot silently drift from the embedded copy.
- The frontend has an explicit fixture/live boundary, validates contract response shapes at the read boundary, and checks the exact deployed schema before a release can claim the full surface.
- The contract uses permissionless transitions for screening, corroboration, rescreening, appeal adjudication, and expired-window settlement. No operator queue is required to advance a record.
- Frontend lint, strict TypeScript checking, and the production Next.js build pass on the release candidate.
- `genvm-lint check contracts/Recourse.py --json` passes all lint and validation checks and reports 16 public methods: 8 views and 8 writes.

## Important design decisions

1. `UNKNOWN` is distinct from `CLEAR`: an unscreened subject is not a clean subject.
2. Exact matches return before any model prompt is constructed.
3. Missing or truncated evidence produces `INCONCLUSIVE`, never a false negative.
4. A judgment-based adverse result (`ASSERTED`) keeps the reporter bond escrowed during the appeal window.
5. The contract re-checks the candidate entity selected by consensus before storing a judgment, preventing the model from naming a record outside the bounded evidence set.

## Current release evidence

The release contract is deployed at `0xA73d81f1f7Cf772AC5976317eE12D259a67D48F7` by transaction `0xe10234c3fe7c27bafb971c06cdf450af3397c9c8cf91a9bf9fd4ba26ad550173`. Deployed-source equality is proven: the source was retrieved with `genlayer code 0xA73d81f1f7Cf772AC5976317eE12D259a67D48F7` and compared byte-for-byte against `contracts/Recourse.py`, at 101,872 bytes on both sides and SHA-256 `d21cbe18a55c51385c0b68c56d0b4127c8ba0fbbf7618ec07bba47e9a15f60a1` equal. Retrieved 2026-08-21, re-retrieved and re-compared 2026-08-22 after every evidence run below. The contract was never redeployed. The deployed schema exposes all 16 required methods.

The bonded write walk is proven along **both** subject paths, and the bond lifecycle is proven in both directions. Every hash below is full and unabbreviated; the machine-readable form, including an explicit list of what was not proven, is [`evidence/studionet.json`](./evidence/studionet.json).

| Step | Transaction | Result |
| --- | --- | --- |
| `report` (payable, 0.001 GEN bond) → `d1` | `0xfcd3f63cd188fb9697c78b5751e259c7464db82bee04a7a2a0f896423e452aad` | FINALIZED + GenVM `SUCCESS`; leader returned `d1`; 4 validator executions SUCCESS, 2 non-fatal ERROR; votes 3 AGREE / 2 IDLE |
| `screen("d1")` | `0x2ed5c3d24bc8755aa8ef79a925f23311b65627432b768a5c4b7c53c2512a1523` | FINALIZED + GenVM `SUCCESS` |
| `refresh_source_health()` | `0xb93fcf39310baf4e16be5798c59f67a02eb169f239cc597804b73caddb9442ab` | FINALIZED + GenVM `SUCCESS` |
| `report` (payable, 0.001 GEN bond) → `d2` | `0x2bd4cf38c16eac159eec0fca9bf7cbed6dab03f22a245fe5757d3a5326b224ab` | FINALIZED + GenVM `SUCCESS`; `value_credited: true`; leader returned `d2`; 4 SUCCESS, 2 non-fatal ERROR; votes 3 AGREE / 2 IDLE |
| `screen("d2")` | `0x97019eb388279483cd47ddc8f9fc9a07293ed0420d3911f76dc4d11774e0e245` | FINALIZED + GenVM `SUCCESS`; 4 SUCCESS, 2 non-fatal ERROR; votes 3 AGREE / 2 IDLE |
| bond returned to reporter (inside `screen("d2")`) | `0x37c061a5edc7d50b4920223225310d6f14fa344fa06cf7c64795862e648da5b0` | FINALIZED type-0 transfer of `1000000000000000` wei from the contract to `0xB5EcD6dDa36B370aca4af5E2005d8E2Ae89c6db2` |
| `expire_appeal_window("d1")`, the permissionless time gate | `0xf74bb15b661661113fe153754d857ec41c36739e4eddca6a068b680aa1504431` | FINALIZED, value 0, rolled back with `[EXPECTED] The appeal window for d1 is open until 2026-08-28T14:03:52Z`; `d1` unchanged afterwards |

Determination `d1`: subject `AMNOKGANG TECHNOLOGY DEVELOPMENT COMPANY`, kind `NAME`, basis `https://sanctionslistservice.ofac.treas.gov/api/download/sdn.csv`, reporter `0xB5EcD6dDa36B370aca4af5E2005d8E2Ae89c6db2`:

| Field | Value |
| --- | --- |
| `status` | `ASSERTED` |
| `entry_ent_num` | `57056` (re-checked against the arithmetic candidate set before storage) |
| `verdict` | `DPRK4`. On the ASSERTED path this field stores the identity round's cited basis, here the OFAC program code carried by that record. It is not a status. |
| `source_len` | `5647099` |
| `alias_count` / `damaged_total` | `4` / `13` |
| `un_corroborated` | `false` |
| `appealable` / `appeal_deadline` | `true` / `2026-08-28T14:03:52Z` |
| `bond` / `bond_settled` | `1000000000000000` wei / `false`, correctly held, because an asserted finding rests on judgment and paying the reporter before the subject can respond would defeat the mechanism |
| `created_at` / `screened_at` | `2026-08-21T14:01:27.214175Z` / `2026-08-21T14:03:52.505596Z` |

`check("AMNOKGANG TECHNOLOGY DEVELOPMENT COMPANY")` returns `FLAGGED`, `determination_id: d1`, `shape: NAME`, `source_len: 5647099`, `unreadable_records: 13`, `appealable: true`. `get_source_health` independently reports `source_len: 5647099`, `unreadable_records: 13`, `sdn_min_bytes: 4000000`, observed `2026-08-21T14:11:19.481662Z`.

Determination `d2`: subject `0x0330070FD38Ec3bB94F58FA55D40368271E9e54A`, kind `ADDRESS`, same basis and reporter. The address is not invented: it is published in the same SDN record `ent_num 57056` that `d1` reached by name, so the two paths converge on one real entity from opposite directions.

| Field | Value |
| --- | --- |
| `status` | `LISTED` |
| `match_kind` | `EXACT`, returned before any model prompt was constructed |
| `verdict` | `Address appears verbatim on the SDN list.` |
| `entry_ent_num` / `entry_program` / `entry_symbol` | `57056` / `DPRK4` / `ETH` |
| `source_len` | `5647099` |
| `alias_count` / `damaged_total` | `0` / `13` |
| `appealable` / `appeal_deadline` | `false` / empty, because an exact byte match rests on arithmetic, not judgment, so there is nothing to contest |
| `bond` / `bond_settled` | `1000000000000000` wei / `true`, settled inside the same `screen` transaction, paid out by the transfer listed above |
| `subject_norm` | `0x0330070fd38ec3bb94f58fa55d40368271e9e54a`, lowercased, which is the proof that the 40-hex argument arrived as a real Python `str` and `subject.strip().lower()` ran |

`check("0x0330070FD38Ec3bB94F58FA55D40368271E9e54A")` returns `FLAGGED`, `determination_id: d2`, `shape: EVM`, `appealable: false`.

**The bond lifecycle is proven on-chain in both directions, not inferred from a flag.** `d1` shows a bond *held* while a judgment-based finding is still contestable. `d2` shows one *returned*: `_settle` runs inside the same `screen` transaction as the `LISTED` verdict, and the resulting payout is an independent finalized transfer. Nobody called it, and no operator role exists to call it.

**The large-source risk is retired.** The central product question was whether a multi-megabyte authority file can actually be fetched and scanned inside a consensus round. It can: **5,647,099 bytes** of `SDN.CSV`, byte-exact against the vendored fixture and reported identically by **five** independent finalized transactions spanning both determinations and both subject paths, two of them a day apart. No size, runtime, fetch-limit or validator constraint was hit, and nothing about it is being hidden or minimised.

| Release check | Evidence |
| --- | --- |
| Contract deployed | `0xA73d81f1f7Cf772AC5976317eE12D259a67D48F7` |
| Deployment transaction | `0xe10234c3fe7c27bafb971c06cdf450af3397c9c8cf91a9bf9fd4ba26ad550173` |
| Source binding | SHA-256 `d21cbe18a55c51385c0b68c56d0b4127c8ba0fbbf7618ec07bba47e9a15f60a1` |
| Deployed-source parity | PASS: `genlayer code` retrieval on 2026-08-21, re-confirmed 2026-08-22; 101,872 bytes both sides; SHA-256 equal; never redeployed |
| Fixture binary integrity | PASS locally: SDN 5,647,099 B / `369c3a…c6b`; ALT 1,063,617 B / `c00af6…2bc`; UN 2,176,185 B / `0f0ac1…ced` |
| Cross-platform fixture CI | PASS: GitHub Actions run `32548072114` on commit `866cb070fba125834074cfa1d35a30a3d5e084c8`, the commit carrying the `d2` ADDRESS determination, the bond payout and `evidence/studionet.json`. Jobs `linux` and `fixture-windows`, `ubuntu-latest` + `windows-latest`, conclusion `success`. The earlier run `32508769044` on commit `66d943d229c394bd227862976887ec5d39d057e6` is recorded separately in the evidence file because its `npm ci` steps are the first to report `found 0 vulnerabilities` on both platforms. CI runs on every push, so the commit that added this row has a later run of its own; the release tag points at that one. |
| Schema | PASS, 16 required methods via GenLayer CLI |
| Prefilter textual parity | PASS, 582 lines / 11 functions / 23,679 bytes |
| Embedded behavioral corpus | PASS, 52 run / 0 failures / 0 errors / 0 skipped |
| Direct contract tests | PASS, 32 tests; production `screen()` address/name branches, truncation/unavailable handling, source health, bounded-candidate rejection, appeal dispositions and settlement latches included |
| Frontend fail-closed regressions | PASS, 12 tests |
| GenVM lint | PASS, 16 methods / 8 views / 8 writes / 0 constructor args |
| TypeScript | PASS |
| ESLint | PASS |
| Production build | PASS, 7 product routes plus not-found |
| Dependency audit | PASS, `npm audit --omit=dev`: 0 vulnerabilities. See [Dependency audit](#dependency-audit). |
| Bonded `report` (NAME → `d1`) | PASS, `0xfcd3f63cd188fb9697c78b5751e259c7464db82bee04a7a2a0f896423e452aad` |
| `screen("d1")` | PASS, `0x2ed5c3d24bc8755aa8ef79a925f23311b65627432b768a5c4b7c53c2512a1523` |
| Bonded `report` (ADDRESS → `d2`) | PASS, `0x2bd4cf38c16eac159eec0fca9bf7cbed6dab03f22a245fe5757d3a5326b224ab` |
| `screen("d2")` | PASS, `0x97019eb388279483cd47ddc8f9fc9a07293ed0420d3911f76dc4d11774e0e245` |
| Stored determination / check / source health | PASS for both `d1` and `d2`, values read back from the deployed contract above |
| Live source fetch inside consensus | PASS, 5,647,099 bytes, corroborated by five finalized transactions |
| ADDRESS path on StudioNet | PASS, `d2`: `LISTED` / `EXACT`, `subject_norm` lowercased. The earlier failure was a stock-CLI argument-coercion limitation, not a contract defect; see [Known limitations](#known-limitations). |
| Bond held (judgment pending) | PASS, `d1` `bond_settled: false` with the window open to `2026-08-28T14:03:52Z` |
| Bond returned (settlement) | PASS, `0x37c061a5edc7d50b4920223225310d6f14fa344fa06cf7c64795862e648da5b0`: finalized transfer of `1000000000000000` wei out of the contract, triggered inside `screen("d2")` |
| Permissionless expiry gate | PASS (refusal), `0xf74bb15b661661113fe153754d857ec41c36739e4eddca6a068b680aa1504431`: anyone can press it, and it named the deadline instead of settling early |
| Consensus status ≠ application success | PASS (control), `0xd7d2bc3f00736650005efd96b5288fdc282dd6a17fc321b2a7b091f727895b15`: FINALIZED with GenVM `rollback`, 0/6 validator executions succeeded, nothing stored and nothing stranded, because the stock CLI sent `value: 0` and the contract refused before doing work |
| Frontend read path on the live ADDRESS record | PASS, `node scripts/exercise-studionet.mjs … d2 0x0330070FD38Ec3bB94F58FA55D40368271E9e54A …` exits 0 exactly as documented, passing the 40-hex subject to `client.readContract` as a plain JavaScript string through `genlayer-js`, the browser's own encoding path. One defect was fixed on 2026-08-22 to get there: the script read its contract address from `process.env` with no `.env.local` loader, unlike its sibling `scripts/verify-schema.mjs`, so the documented commands exited 1 before reaching the network. Verifier only; no contract change. |
| Expiry *settlement* branch on StudioNet | NOT PROVEN: time-gated until `2026-08-28T14:03:52Z`, six days after this record was frozen. Gate proven above; settlement covered by direct tests, and the returned half of the bond lifecycle proven live by `d2`. |
| Appeal branch on StudioNet | NOT PROVEN: `d1` is appealable with an open window, but no appeal was filed and no live adjudication ran. Deliberate: its subject is a genuinely OFAC-listed DPRK entity, so no honest contesting evidence exists and inventing some would have manufactured the proof. Direct-test coverage only. |
| Live app | PASS, **https://recourse-genlayer.vercel.app**: public, no login wall, all 8 routes return 200, contract address baked into the served HTML, no backend of any kind |

## Dependency audit

Both CI installs reported 3 high-severity findings. They were real and they were in the production dependency tree, not dev-only. `npm audit --package-lock-only --omit=dev` against the previous lockfile reproduces all three:

| Finding | Severity | Path | Advisories |
| --- | --- | --- | --- |
| `postcss <=8.5.22` | high | `node_modules/next/node_modules/postcss` | GHSA-qx2v-qp2m-jg93, GHSA-6g55-p6wh-862q, GHSA-fxqj-rqcc-2cmp, GHSA-r28c-9q8g-f849 |
| `sharp <0.35.0` | high | `node_modules/sharp` (optional dep of `next`) | GHSA-f88m-g3jw-g9cj, inherited libvips CVE-2026-33327/33328/35590/35591 |
| `next 9.3.4-canary.0 – 16.3.0-preview.10` | high | `node_modules/next` | Flagged only for depending on the two above |

All three were transitive through one direct dependency, `next 16.2.12`, and npm's own recommended remedy was `next@16.3.2`. That upgrade was applied deliberately, as a reviewed `npm install next@16.3.2 --save-exact`, and not through `npm audit fix --force`, which is documented to install outside the stated dependency range and would have been an unreviewed framework change in a submission build.

After the bump, `postcss` resolves to `8.5.23` and `sharp` to `0.35.3`, both outside their advisory ranges, and both `npm audit` and `npm audit --omit=dev` report **0 vulnerabilities**. CI confirms it independently: the `npm ci` steps of run `32508769044` print `found 0 vulnerabilities` on both Linux and Windows, where the earlier runs printed 3 high. This app does not import `next/image`, so the `sharp` path was never reachable at runtime, but it is on a fixed version regardless rather than argued away. `npm run verify` passes end to end on the new lockfile.

## Known limitations

- The contract reads the public files named above, not every jurisdictional list or private record.
- Some OFAC records are truncated at the authority's own 1,000-character Remarks limit. Recourse measures the damaged records and refuses to infer the missing bytes.
- Model-based identity and appeal outcomes are consensus judgments, not legal determinations.
- The included fixture mode is for exploration and development only; every live page is explicitly marked `LIVE CONTRACT`, and a failed live read renders unavailable rather than substituting a fixture.
- StudioNet is a simulated environment and does not provide production-chain settlement guarantees.
- **The stock GenLayer CLI cannot submit an ADDRESS report, and that limitation was verified rather than assumed.** Transaction `0xdbcc1664ecae30c06f3f9f9e5f9b3db49f6c325ff233388c8b7ea4d5c5ae98a0` reached FINALIZED with GenVM `contract_error` at exit code 1 and stored nothing. The cause is the CLI, not the contract: GenLayer CLI 0.39.2 `parseScalar` coerces any argument matching `^0x[0-9a-fA-F]{40}$` into a `CalldataAddress`, so `report`'s `subject: str` parameter received an `Address` object and `subject.strip()` raised `AttributeError`. There is no escape hatch through the documented interface: `parseArg`'s JSON branch routes through `coerceValue` → `parseScalar` as well, and `genlayer call` is affected identically, so even reading `check` on a 40-hex subject fails from the stock CLI. The contract's input validation behaved correctly by rejecting a malformed subject. The frontend was never affected, because `genlayer-js` passes typed JavaScript values straight through; `d2` above was submitted through a local bridge that takes that same typed path, and its stored `subject_norm` is the receipt.
- **That failed attempt stranded 0.001 GEN in the contract, and it is unrecoverable.** StudioNet does not roll back `gl.message.value` when the GenVM reverts; `raise gl.vm.UserError` is not an EVM revert, so the bond had already moved and stayed. This is verifiable arithmetic rather than an assertion: `stats.balance` is `2000000000000000` wei, the escrowed bonds total `1000000000000000` (`d1` held; `d2` already paid out), and the `1000000000000000` wei difference is exactly this transfer. The figure surviving a second complete lifecycle unchanged is itself a check: a settlement that had silently failed to pay out would have left the balance at `3000000000000000`. There is no sweep or admin-withdraw path to recover it, which is deliberate: an owner who can move escrowed bonds is a worse problem than 0.001 GEN of simulated network value. It is recorded here rather than written off silently.
- **The appeal lifecycle has no live proof, by choice.** `d1` is appealable and its window is open until `2026-08-28T14:03:52Z`, but no appeal was filed and no live adjudication ran. Its subject is a genuinely OFAC-listed DPRK entity, so there is no honest evidence with which to contest the finding; filing on invented grounds would have produced a green row at the cost of the thing the row is supposed to attest. All three dispositions, settlement latches, window expiry and no-double-settlement are covered by direct tests against the production code paths only.
- **The successful expiry-settlement branch is time-gated, not skipped.** The earliest a real expiry can run for `d1` is `2026-08-28T14:03:52Z`; this record was frozen on 2026-08-22, six days short. The gate itself was exercised live and refused correctly (`0xf74bb15b…`), and the *returned* half of the bond lifecycle is proven live by `d2`'s payout instead.
- The proof verifier accepts only resulting hashes and public identity fields; it does not load keys or passwords.
