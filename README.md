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

This single command runs textual prefilter parity, the behavioral corpus suite against the copy extracted from the contract, fail-closed frontend regressions, deployment-record drift verification, TypeScript, ESLint, and the production build.

The repository contains the tested scanner, suite, and pinned authority fixtures under `tests/prefilter/`. The current verification pass ran all 52 tests against the copy extracted from `contracts/Recourse.py`: 0 failures, 0 errors, 0 skipped. Fixture sizes and SHA-256 hashes are recorded in `tests/prefilter/fixtures/README.md`; they are test inputs only and are never imported by the runtime contract.

### Live StudioNet

```bash
npm run verify:schema
node scripts/exercise-studionet.mjs <keystore> <password>
```

The live proof script waits for `FINALIZED`, then requires explicit GenVM `SUCCESS`. It identifies the exact report by comparing before/after IDs and verifying subject, reporter, bond, and pending state before screening. It exits immediately on rollback and prints machine-readable evidence. A successful funded run has not yet been captured in this repository.

Current local release checks:

```text
npm run verify             PASS
npm run build              PASS (Next.js 16 production build; 7 routes generated)
python -m py_compile       PASS for contracts/Recourse.py
genvm-lint check           PASS: 16 methods (8 view, 8 write), 0 constructor args
embedded prefilter suite   PASS: 52 run, 0 failures, 0 errors, 0 skipped
direct contract tests      PASS: 4 tests
frontend fail-closed tests PASS: 3 tests
StudioNet schema            PASS: 16 required methods present; prefilter fingerprint and stats read successfully
```

`DEPLOYMENT.json` binds the current source SHA to the deployment record. `deployedSourceVerified` is intentionally `false`: the repository records the exact local source used for deployment, but independent Explorer source retrieval has not been established. The drift script must not be read as Explorer parity.

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

Recourse covers the public exports named in the contract; it is not a universal sanctions or KYC service and is not legal advice. OFAC truncates some long `Remarks` fields, so an address cut at the source is explicitly `INCONCLUSIVE`. Public files can change, disappear, or be republished; `rescreen()` and `refresh_source_health()` make that visible rather than hiding it. StudioNet GEN is simulated network value. The repository includes `scripts/exercise-studionet.mjs` for a funded report/screen walk, but no successful live report or screen transaction is claimed yet. Direct tests cover UNKNOWN, minimum report bond, pending report storage, and LISTED appeal rejection; the full ASSERTED appeal settlement branch remains unproven.

## Submission notes

See [`REVIEW_RESPONSE.md`](./REVIEW_RESPONSE.md) for the reviewer-facing product explanation, verification evidence, and release limitations.
