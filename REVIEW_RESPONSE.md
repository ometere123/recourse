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

The release contract is deployed at `0xA73d81f1f7Cf772AC5976317eE12D259a67D48F7` by transaction `0xe10234c3fe7c27bafb971c06cdf450af3397c9c8cf91a9bf9fd4ba26ad550173`. The deployed schema exposes all 16 required methods, and `prefilter_fingerprint()` plus `stats()` read successfully. The application includes the root, check, report, register, determination, appeal and docs routes, wallet and transaction lifecycle, contract adapter, schema verifier, and a reproducible `scripts/exercise-studionet.mjs` funded report/screen walk. The standalone write walk remains unverified here because this workspace rejected outbound network escalation before the script submitted a transaction.

## Known limitations

- The contract reads the public files named above, not every jurisdictional list or private record.
- Some OFAC records are truncated at the authority's own 1,000-character Remarks limit. Recourse measures the damaged records and refuses to infer the missing bytes.
- Model-based identity and appeal outcomes are consensus judgments, not legal determinations.
- The included fixture mode is for exploration and development only; it must never be presented as a deployed result.
- StudioNet is a simulated environment and does not provide production-chain settlement guarantees.
