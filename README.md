# EmisPass
https://turan16-k.github.io/IEEE/app/
**AI-verified, threshold-signed embedded-emission passports for EU CBAM and the Turkish ETS.**

IEEE ClimateChain Global Hackathon 2026 · Track 1: *Carbon Markets & Emissions Transparency* (also relevant to Track 3: digital product passports)

## The problem

Since 1 January 2026, EU importers of steel, cement, aluminium, fertiliser and hydrogen pay CBAM on the emissions embedded in what they buy. If the non-EU producer cannot supply **verified, installation-level** emission data, the importer must use default values. Those defaults carry a 10 % mark-up in 2026, rising to 30 % from 2028. Türkiye is one of the largest exporters of CBAM goods to the EU. In 2026 its own ETS pilot also starts: every covered installation must report emissions annually and have the report verified by an accredited verifier. Verifier capacity is scarce, plant data are commercially sensitive, and nothing today stops the same emission record from being misstated, altered after verification, or reused across buyers.

## What EmisPass does

1. **The operator signs** each month's activity data and totals (EIP-712) together with a Merkle root of that month's EU shipments.
2. **Third parties sign their own feeds**: grid-meter electricity and fuel-supplier deliveries. A satellite activity signal is attached as supporting evidence.
3. **Three independent AI verifier nodes** check every claim:
   - feed provenance;
   - activity reconciliation;
   - recalculation with IPCC factors;
   - comparison with real Turkish peers from Climate TRACE;
   - a gradient-boosting model of expected intensity;
   - an Isolation Forest of the plant's own history;
   - satellite consistency.

   Each node writes a deterministic, explainable report and signs a verdict.
4. **On-chain, 2-of-3 verifiers must agree.** The `EmissionPassport` contract checks the operator signature, the verifier threshold, the nonce (replay protection) and that the verdict refers to the exact claim. It stores totals, the verdict, the risk score, the model hash and the report hash. Plant data never go on-chain.
5. **The EU importer checks only its own shipment.** The producer gives each importer a salted shipment record and a Merkle proof. The importer verifies it against the passport and **declares it once**. The record is bound to the importer's address, so no one else can reuse it.

Flagged months stay on the record, and the operator can submit a correction. A regulator role can revoke a passport after a site visit.

## Demo results (local chain, reproducible)

| | |
|---|---|
| Passports anchored | 10 (3 fictional plants × 3 months, plus 1 correction) |
| Flagged by AI verifiers | 1: a BF-BOF plant that under-declared coking coal by 30 %. Caught by supplier reconciliation (−29 %), recalculation (−22 %), the ML expected-intensity model (−25 %) and the anomaly model (−15 σ). |
| Shipments declared by EU importers | 22 of 34 committed |
| Attacks executed against the contracts | 6/6 blocked: compromised verifier plus outsider, replay, tampered numbers, double declaration, stolen shipment record, declaration from a flagged passport |
| Tests | 19 Solidity (Hardhat) + 9 Python (pytest), all passing |
| Gas per passport | about 335k–383k |

## Quick start

Requirements: Node 20+ and Python 3.11+.

```powershell
npm install
python -m venv .venv; .\.venv\Scripts\pip install -r verifier\requirements.txt

npx hardhat test                                  # 19 contract tests
cd verifier; ..\.venv\Scripts\python -m pytest -q; cd ..   # 9 verifier tests

# terminal 1
npx hardhat node
# terminal 2: simulate -> deploy -> 3 AI verifiers -> anchor + attack suite, then serve the dashboard
.\run-demo.ps1 -Serve
# open http://localhost:8080/app/
```

On macOS or Linux, run the four steps from `run-demo.ps1` by hand. Set `PYTHONPATH=verifier` and run `python -m emispass simulate`, `npx hardhat run scripts/deploy.js --network localhost`, `python -m emispass run`, then `npx hardhat run scripts/anchor.js --network localhost`.

To deploy to a public testnet (Sepolia or Base Sepolia), see [docs/DEPLOY.md](docs/DEPLOY.md).

## Repository map

| Path | What it is |
|---|---|
| `contracts/FacilityRegistry.sol` | Installations, operator keys, key rotation |
| `contracts/EmissionPassport.sol` | EIP-712 claims, k-of-n verifier signatures, passports, Merkle selective disclosure, single-use declarations, revocation |
| `test/` | Hardhat tests covering security properties |
| `verifier/emispass/` | AI verifier: `checks.py` (rules + ML), `node.py` (report + signing), `pipeline.py`, `sources/` (Climate TRACE, grid mix) |
| `scripts/deploy.js`, `scripts/anchor.js` | Deployment; anchoring, attack suite and importer declarations |
| `app/` | Dashboard with Producer, AI Verifier, EU Importer and Security views; reads the chain live |
| `docs/` | Architecture, security assessment, climate impact, summary, roadmap, demo script |

## Data honesty

- **Real:** Climate TRACE asset-level estimates for 87 Turkish steel, cement and aluminium installations (CC-BY 4.0), cached in `data/climatetrace/`. They give the peer benchmarks: BF-BOF 1.90, EAF median 0.108, cement median 0.72 tCO2e/t.
- **Synthetic, and labelled as such everywhere:** the three facilities, their activity data, the meter and fuel-supplier feeds, the satellite signal (a stand-in for Sentinel-5P NO2) and the grid mix (a stand-in for an EPİAŞ export).
- **Illustrative:** CBAM "default values" in the dashboard are the Turkish route p90 × 1.10. They are not the official EU defaults. The €82.32/t certificate price is the Q3 2026 figure.

## Documents for judges

- [Architecture & technical specification](docs/ARCHITECTURE.md)
- [Security & data-integrity assessment](docs/SECURITY.md)
- [Climate impact assessment](docs/IMPACT.md)
- [Two-page summary](docs/SUMMARY.md)
- [Adoption & scalability roadmap](docs/ROADMAP.md)

License: MIT
