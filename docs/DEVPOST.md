# Devpost submission text (copy and paste)

**Project name:** EmisPass

**Tagline (≤ 200 characters):** AI-verified, threshold-signed emission passports that let Turkish exporters prove real CBAM emissions to EU importers without revealing plant data.

**Track:** Carbon Markets & Emissions Transparency

**Built with:** solidity, openzeppelin, hardhat, ethers.js, python, scikit-learn, eth-account, climate-trace, eip-712, merkle-trees

---

## Inspiration
Since 1 January 2026, EU importers pay CBAM on the CO2 embedded in steel, cement, aluminium and fertiliser. A producer that cannot supply verified, installation-level data pushes its buyer onto default values with a growing mark-up (10 % in 2026, 30 % from 2028). Türkiye is one of the largest exporters of these goods, and its own ETS pilot starts in 2026 with about 800 installations, each needing an accredited verifier. The bottleneck is not measurement but **trust**: plants won't publish process data, importers can't check what they receive, and nothing prevents a verified figure from being changed or reused.

## What it does
EmisPass turns a plant's monthly emission report into a **verifiable passport**:
- The operator signs the claim (EIP-712). Grid-meter and fuel-supplier data arrive signed by those third parties.
- **Three independent AI verifier nodes** run seven explainable checks:
  - provenance;
  - reconciliation;
  - IPCC recalculation;
  - real Turkish peer benchmarks from Climate TRACE (87 installations);
  - a gradient-boosting model of expected intensity;
  - an Isolation Forest anomaly model;
  - satellite activity consistency.
- The `EmissionPassport` contract anchors the passport only when **2 of 3 verifiers** sign the exact claim. It stores the verdict, the risk score and hashes of the report, the evidence and the model.
- Each **EU importer** gets only its own shipment record and a Merkle proof. It verifies on-chain and declares the shipment exactly once; no one else can reuse it.
- A regulator can revoke a passport after a site visit. Flagged months stay visible, and corrections are possible.

## How we built it
- **Contracts:** Solidity 0.8.28 + OpenZeppelin 5 (AccessControl, EIP712, ECDSA, MerkleProof); Hardhat. 19 tests.
- **AI verifier:** Python with scikit-learn (GradientBoostingRegressor, IsolationForest) and eth-account for EIP-712 and EIP-191 signing. The pipeline is deterministic, so honest nodes produce byte-identical reports. 9 tests.
- **Real data:** Climate TRACE API v6 assets for Türkiye (BF-BOF 1.90, EAF median 0.108, cement median 0.72 tCO2e/t).
- **Dashboard:** vanilla JS + ethers v6. It reads the contract live and has Producer, AI Verifier, EU Importer and Security views.

## Demo
- 10 passports: 9 approved, 1 flagged under-declaration (coking coal −30 %), caught by four independent checks and then corrected.
- 22 shipments declared by two EU importers through Merkle proofs.
- **6 of 6 live attacks blocked:** compromised verifier + outsider, replay, tampered numbers, double declaration, stolen shipment record, declaring from a flagged passport.

## Challenges we ran into
- Making the AI layer auditable: we hash the code, emission factors, ML configuration and benchmark data into a `modelHash` stored with every passport.
- Isolation Forest saturates on extreme outliers. We combined it with robust z-scores so a 15-sigma deviation is never scored as "normal".
- Balancing privacy and verifiability: salted per-shipment commitments bound to the importer's address.

## Accomplishments we're proud of
A working end-to-end trust chain from sensor to EU declaration, with a documented STRIDE threat model and an executable attack suite.

## What we learned
Blockchain does not fix bad input data, and the 2022 tokenised-carbon collapse proved it. The value is in combining signed third-party data, explainable AI cross-checks and a threshold of independent verifiers. The chain is the shared, tamper-evident record.

## What's next
- A pilot with one EAF steel and one cement exporter in Q1 2027, using real EPİAŞ meter data, e-invoice fuel data and Sentinel-5P.
- Passports used for the first CBAM declaration on 30 September 2027.
- Export in the TR-ETS MEDAS/EXIST formats.
- ZK range proofs for confidential totals.

## Honesty note
The facilities and plant data in the demo are fictional and synthetic. Peer benchmarks are real Climate TRACE data (CC-BY 4.0). CBAM default values in the dashboard are illustrative.

**Links:** GitHub repo · demo video · testnet contracts (Etherscan) · docs/SECURITY.md · docs/IMPACT.md
