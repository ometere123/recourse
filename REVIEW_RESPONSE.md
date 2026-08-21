# Reviewer Response

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

The release contract is deployed at `0xA73d81f1f7Cf772AC5976317eE12D259a67D48F7` by transaction `0xe10234c3fe7c27bafb971c06cdf450af3397c9c8cf91a9bf9fd4ba26ad550173`. The deployed schema exposes all 16 required methods, and `prefilter_fingerprint()` plus `stats()` read successfully. The application includes the root, check, report, determinations, determination detail, appeal and docs routes, wallet and transaction lifecycle, strict live adapters, schema verifier, and a paced public-data proof verifier. The bonded write walk remains unverified: the mandated active CLI account is unlocked, but CLI v0.39.2 cannot attach payable application value to `report()`. No transaction was submitted and no signer material was exported.

| Release check | Evidence |
| --- | --- |
| Contract deployed | `0xA73d81f1f7Cf772AC5976317eE12D259a67D48F7` |
| Deployment transaction | `0xe10234c3fe7c27bafb971c06cdf450af3397c9c8cf91a9bf9fd4ba26ad550173` |
| Source binding | SHA-256 `d21cbe18a55c51385c0b68c56d0b4127c8ba0fbbf7618ec07bba47e9a15f60a1`; Explorer source parity not independently available |
| Fixture binary integrity | PASS locally: SDN 5,647,099 B / `369c3a…c6b`; ALT 1,063,617 B / `c00af6…2bc`; UN 2,176,185 B / `0f0ac1…ced` |
| Cross-platform fixture CI | PENDING until the new Linux + Windows GitHub Actions run completes |
| Schema | PASS, 16 required methods via GenLayer CLI |
| Prefilter textual parity | PASS, 582 lines / 11 functions / 23,679 bytes |
| Embedded behavioral corpus | PASS, 52 run / 0 failures / 0 errors / 0 skipped |
| Direct contract tests | PASS, 32 tests; production `screen()` address/name branches, truncation/unavailable handling, source health, bounded-candidate rejection, appeal dispositions and settlement latches included |
| Frontend fail-closed regressions | PASS, 12 tests |
| GenVM lint | PASS, 16 methods / 8 views / 8 writes / 0 constructor args |
| TypeScript | PASS |
| ESLint | PASS |
| Production build | PASS, 7 product routes plus not-found |
| Successful bonded report | BLOCKED: mandated CLI v0.39.2 account is unlocked, but `genlayer write` has no payable contract-value option (its `--fee-value` is only the fee deposit); no transaction was submitted and no credential workaround was used |
| Successful screen | NOT RUN because no report transaction was submitted |
| Stored determination/check/source health proof | NOT RUN; the harness has no captured live output |
| Appeal branch | Partial direct proof: ASSERTED appeal creation, validation, expiry/no-double-settlement and exact `LISTED` rejection; live semantic adjudication remains pending |
| Live app | No public URL recorded in this repository |

## Known limitations

- The contract reads the public files named above, not every jurisdictional list or private record.
- Some OFAC records are truncated at the authority's own 1,000-character Remarks limit. Recourse measures the damaged records and refuses to infer the missing bytes.
- Model-based identity and appeal outcomes are consensus judgments, not legal determinations.
- The included fixture mode is for exploration and development only; every live page is explicitly marked `LIVE CONTRACT`, and a failed live read renders unavailable rather than substituting a fixture.
- StudioNet is a simulated environment and does not provide production-chain settlement guarantees.
- The positive bonded StudioNet lifecycle and large-source validator execution remain unproven until a signer interface capable of supplying payable contract value is used. The proof verifier accepts only resulting hashes and public identity fields; it does not load keys or passwords.
