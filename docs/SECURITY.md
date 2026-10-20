# Security & data-integrity assessment

**Scope:** smart contracts, the off-chain verifier pipeline, data feeds, keys and the dashboard.
**Method:** STRIDE threat model, executable attack suite (`scripts/anchor.js`), unit tests (`test/`, `verifier/tests/`).

## 1. Assets and adversaries

| Asset | Why it matters |
|---|---|
| Correctness of embedded-emission values | Directly sets the CBAM cost and TR-ETS obligations; under-reporting means unpriced CO2. |
| Confidentiality of plant data and buyers | Process data and customer lists are trade secrets, so producers will not share them openly. |
| Single use of each shipment record | Prevents the same verified low-carbon record from being used by more than one buyer. |
| Verifier and model integrity | A verdict is only as good as the code and data behind it. |

Adversaries considered:
- a dishonest operator, the most likely case;
- one compromised or bribed verifier;
- a malicious relayer or man-in-the-middle;
- a dishonest importer;
- an outsider holding a stolen key;
- a curious public observer (privacy).

## 2. STRIDE analysis

| Threat | Example | Control | Evidence |
|---|---|---|---|
| **S**poofing: operator identity | Someone submits claims for a plant | EIP-712 signature by the key registered in `FacilityRegistry`; key rotation | Test *rejects claims not signed by the registered operator key*; *rotated-out key* |
| **S**poofing: data feed | Forged meter or supplier record | EIP-191 signature by a trust-listed feed key, with scope check | pytest `test_forged_meter_feed_is_critical`, `test_feed_signed_by_untrusted_key_is_critical` |
| **S**poofing: verifier | Outsider key signs approval | Only `VERIFIER_ROLE` signatures count | Attack suite: compromised verifier + outsider → `InsufficientVerifierSignatures` |
| **T**ampering: claim in transit | Relayer lowers emissions after signing | Every field is covered by the EIP-712 claim digest; the verification is bound to that digest | Attack suite → `BadOperatorSignature`; test → `VerificationDoesNotMatchClaim` |
| **T**ampering: activity data | Operator under-declares coking coal | Reconciliation with supplier deliveries, independent recalculation, ML expected intensity, Isolation Forest | Demo passport #9 flagged (risk 1000) |
| **T**ampering: report or evidence after the fact | Edit the stored report to look clean | `reportHash` and `evidenceHash` on-chain; the dashboard recomputes keccak256 | Dashboard "Verify report & evidence hashes" |
| **T**ampering: sensor calibration | Meter scaled at source (Dieselgate-style) | Cross-source redundancy: meter vs operator vs satellite vs peers. One feed alone cannot clear a claim. | Residual risk, see §4 |
| **R**epudiation | Operator later denies a filing | Non-repudiable signatures; immutable `PassportIssued` events | All passports |
| **I**nformation disclosure | Competitor reads plant data or buyers | Only totals and hashes on-chain; shipments as salted commitments; per-importer disclosure | Test *prevents another importer from using someone else's shipment record* |
| **D**enial of service | Flood with junk submissions | Submissions need valid operator and k verifier signatures before any state change; signature arrays bounded | Gas about 350k per valid passport |
| **E**levation of privilege | Non-admin changes threshold or revokes | OpenZeppelin `AccessControl`; threshold must be greater than 0 | Test *restricts revocation, verifier management and threshold changes* |
| Replay | Resubmit an old approved claim | Per-facility nonce; one Approved passport per period | Attack suite → `BadNonce`; test → `PeriodAlreadyApproved` |
| Double use | Same importer declares twice, or another importer reuses the record | Leaf bound to `msg.sender`; `declaredUnder` mapping | Attack suite → `ShipmentAlreadyDeclared`, `InvalidShipmentProof` |
| Signature malleability | High-s variant of a signature | OpenZeppelin `ECDSA` rejects malleable signatures; duplicate signers are de-duplicated by address | Test *counts duplicate signatures from one verifier only once* |

## 3. AI-specific risks (responsible AI)

| Risk | Control |
|---|---|
| Model swapped for a lenient one | `modelHash` (code, factors, ML hyper-parameters, benchmark data) is stored with every passport. Verifiers must agree on the same report hash. |
| Black-box verdicts | Every finding states the numbers, thresholds and data source. The risk score is a transparent sum of severities. |
| ML false positives | ML findings are at most *high*. Only rule-based provenance, reconciliation or recalculation can be *critical*. A flagged operator can submit a correction, and the history stays visible. |
| ML false negatives | ML is one of seven layers. The decisive controls, reconciliation and recalculation, use signed third-party data. |
| Biased peer benchmarks | Benchmarks come from public, documented Climate TRACE data and only produce *medium* or *low* findings. |
| Adversarial manipulation of training data | Models are trained only on months already verified. Training inputs and seeds are part of `modelHash`. |
| Automation bias | The output is a *pre-verification evidence pack* for the accredited human verifier (TÜRKAK/MEDAS process). It does not replace them. |

## 4. Residual risks and mitigations planned

1. **Collusion of k verifiers.** Planned mitigations: choose verifier operators from different organisations (two accredited bodies plus one public-interest auditor), add stake or slashing, and rotate members.
2. **Physical sensor tampering at source.** Cryptography protects data only after signing. Planned mitigations: tamper-evident meters with secure elements, signing by the utility (not the plant), and periodic site audits recorded through `revokePassport`.
3. **Key management.** In the demo, keys are derived from a public mnemonic, which is for local testing only. Production would use HSM or cloud KMS for operators and verifiers, keys separated per environment, and key rotation already supported in `FacilityRegistry`.
4. **Admin centralisation.** `DEFAULT_ADMIN_ROLE` should be a multisig (for example Safe 2-of-3: ministry, registry operator, accreditation body) with a timelock on threshold changes.
5. **Satellite signal resolution.** Sentinel-5P NO2 is coarse at the scale of a single plant, so it is treated only as supporting evidence and never as decisive.
6. **Privacy of totals.** Monthly totals per installation are public. For sensitive sectors, the next step is to publish only commitments and prove range statements with zero-knowledge proofs (see the roadmap).

## 5. Test evidence

- `npx hardhat test`: 19 passing. Covers EIP-712 parity, issuance, flagged and corrected flows, threshold, duplicates, outsiders, tampering, replay, key rotation, inactive facilities, selective disclosure, single-use declarations, revocation and access control.
- `pytest`: 9 passing. Covers honest claims approved, fraud flagged with explanations, correction approved, forged and untrusted feeds critical, determinism across nodes, EIP-712 round-trip, signed-record tampering, Merkle importer binding.
- `scripts/anchor.js`: 6 live attacks against the deployed contracts, 6 blocked.

## 6. Additions in v1.1

| Component | Risk | Control |
|---|---|---|
| Browser verifier | A modified copy could show a misleading verdict | It is a demonstration and self-check only. Authoritative verdicts come from the signed reports and the on-chain passport. Parity with the Python verifier is tested in CI. |
| LLM summaries (optional) | Hallucinated numbers, or a summary contradicting the verdict | The prompt restricts the model to report numbers and forbids changing the verdict; structured JSON output. The summary is not part of `reportHash`, and the dashboard shows the verdict from the report beside it. The template is used whenever the API is unavailable or the model declines. |
| Report data sent to an LLM | Confidentiality of plant data | Only the report (totals, findings, hashes) is sent, never the evidence bundle. The feature is off unless credentials are configured; `--no-llm` disables it explicitly. |
| Wallet actions | Phishing or wrong chain | Chain id is taken from the deployment file and switched explicitly. Role checks (`hasRole`) and importer-address checks run before any transaction is proposed. All authorisation is enforced by the contract, not the UI. |
| Real satellite data | Coarse resolution, cloud gaps | QA filtering (≥ 0.75), background subtraction, used only as supporting evidence (medium severity at most). |
