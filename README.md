# EmisPass

[![CI](https://github.com/Turan16-k/IEEE/actions/workflows/ci.yml/badge.svg)](https://github.com/Turan16-k/IEEE/actions/workflows/ci.yml)

**AI-verified, threshold-signed embedded-emission passports for EU CBAM and the Turkish ETS.**

IEEE ClimateChain Global Hackathon 2026 · Track 1: *Carbon Markets & Emissions Transparency* (also relevant to Track 3: digital product passports)

**Live dashboard:** https://turan16-k.github.io/IEEE/app/ (English / Türkçe). The most useful starting point is the **Try to cheat** tab: https://turan16-k.github.io/IEEE/app/?tab=simulator&preset=fuel

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

   Each node writes a deterministic, explainable report and signs a verdict. A plain-language summary in Turkish and English goes with each report.
4. **On-chain, 2-of-3 verifiers must agree.** The `EmissionPassport` contract checks the operator signature, the verifier threshold, the nonce (replay protection) and that the verdict refers to the exact claim. It stores totals, the verdict, the risk score, the model hash and the report hash. Plant data never go on-chain.
5. **The EU importer checks only its own shipment.** The producer gives each importer a salted shipment record and a Merkle proof. The importer verifies it against the passport and **declares it once**, from the dashboard with MetaMask or by script. The record is bound to the importer's address, so no one else can reuse it.
6. **The data leaves in the shape CBAM asks for.** One click exports a passport or a shipment in the key fields of the EU communication template for installations (CSV or JSON).

Flagged months stay on the record, and the operator can submit a correction. A regulator can revoke a passport after a site visit, directly from the dashboard.

## Dashboard

| Tab | What you can do |
|---|---|
| Overview | Passports read live from the contract, KPIs |
| **Try to cheat** | Change what a plant declares (fuel, electricity, production, edit a signed meter record) and watch the verifier react. It runs the **same exported Gradient Boosting and Isolation Forest models** in the browser and verifies the feed signatures with ethers.js. |
| Producer | Verified intensity vs real Turkish peers; CBAM exposure with the passport vs the default; CBAM supplier-data export |
| AI Verifier | Findings, risk score, plain-language summary, on-chain hash check of the report and evidence, regulator revocation (wallet) |
| EU Importer | Selective-disclosure checks against the chain, single-use declaration with a wallet, per-shipment CBAM export |
| Real data | **Real Sentinel-5P NO₂** over the İskenderun Bay steel cluster (2025-07 to 2026-09) and the Climate TRACE distribution of 87 Turkish installations |
| Security | The six attacks executed against the deployed contracts, trust boundaries |

## Demo results (local chain, reproducible)

| | |
|---|---|
| Passports anchored | 10 (3 fictional plants × 3 months, plus 1 correction) |
| Flagged by AI verifiers | 1: a BF-BOF plant that under-declared coking coal by 30 %. Caught by supplier reconciliation (−29 %), recalculation (−22 %), the ML expected-intensity model (−25 %) and the anomaly model (−15 σ). |
| Shipments declared by EU importers | 22 of 34 committed |
| Attacks executed against the contracts | 6/6 blocked: compromised verifier plus outsider, replay, tampered numbers, double declaration, stolen shipment record, declaration from a flagged passport |
| Tests | 19 Solidity (Hardhat), 12 Python (pytest) and a browser-vs-Python verifier parity check; all run in CI |
| Gas per passport | about 335k–383k |

## Quick start

Requirements: Node 20+ and Python 3.11+.

```powershell
npm install
python -m venv .venv; .\.venv\Scripts\pip install -r verifier\requirements.txt

npx hardhat test                                            # 19 contract tests
cd verifier; ..\.venv\Scripts\python -m pytest -q; cd ..    # 12 verifier tests

# terminal 1
npx hardhat node
# terminal 2: simulate -> deploy -> 3 AI verifiers -> anchor + attacks -> parity check, then serve
.\run-demo.ps1 -Serve
# open http://localhost:8080/app/
```

On macOS or Linux, run the steps from `run-demo.ps1` by hand:
1. Set `PYTHONPATH=verifier`.
2. `python -m emispass simulate`
3. `npx hardhat run scripts/deploy.js --network localhost`
4. `python -m emispass run`
5. `npx hardhat run scripts/anchor.js --network localhost`
6. `node scripts/check-simulator.js`

**Optional extras:** `pip install -r verifier/requirements-data.txt`.
- `python -m emispass fetch-sentinel5p` downloads the real NO₂ series again. It needs no account; only the needed tiles are fetched with HTTP range requests.
- If Claude API credentials are available (`ANTHROPIC_API_KEY` or `ant auth login`), `python -m emispass run` writes the plain-language summaries with Claude. Otherwise a template is used. Either way the verdict always comes from the checks.

**Public testnet in two commands:** run `node scripts/setup-testnet.js`, fund the printed address from a Sepolia faucet, then run `.\run-demo.ps1 -Network sepolia`. Details are in [docs/DEPLOY.md](docs/DEPLOY.md).

## Repository map

| Path | What it is |
|---|---|
| `contracts/FacilityRegistry.sol` | Installations, operator keys, key rotation |
| `contracts/EmissionPassport.sol` | EIP-712 claims, k-of-n verifier signatures, passports, Merkle selective disclosure, single-use declarations, revocation |
| `test/` | Hardhat tests covering security properties |
| `verifier/emispass/` | AI verifier: `checks.py` (rules + ML), `node.py` (report + signing), `pipeline.py`, `export.py` (models to JSON for the browser), `explain.py` (TR/EN summaries), `sources/` (Climate TRACE, Sentinel-5P, grid mix) |
| `scripts/` | `deploy.js`, `anchor.js` (anchoring, attack suite, declarations), `check-simulator.js` (parity), `setup-testnet.js` |
| `app/` | Dashboard: `app.js`, `verifier.js` (in-browser verifier), `i18n.js` (EN/TR), `cbam.js` (CBAM export) |
| `docs/` | Architecture, security assessment, climate impact, summary, roadmap, demo script |

## Data honesty

- **Real:**
  - Climate TRACE asset-level estimates for 87 Turkish steel, cement and aluminium installations (CC-BY 4.0), in `data/climatetrace/`. They give the peer benchmarks: BF-BOF 1.90, EAF median 0.108, cement median 0.72 tCO2e/t.
  - Copernicus Sentinel-5P TROPOMI tropospheric NO₂ over the İskenderun Bay industrial zone, from MEEO's COGs on AWS Open Data, in `data/sentinel5p/`. The series covers an area, not a named company.
- **Synthetic, and labelled as such everywhere:** the three facilities, their activity data, the meter and fuel-supplier feeds, the per-plant satellite signal used by the checks, and the grid mix (a stand-in for an EPİAŞ export).
- **Illustrative:** CBAM "default values" in the dashboard are the Turkish route p90 × 1.10. They are not the official EU defaults. The €82.32/t certificate price is the Q3 2026 figure.

## Documents for judges

- [Architecture & technical specification](docs/ARCHITECTURE.md)
- [Security & data-integrity assessment](docs/SECURITY.md)
- [Climate impact assessment](docs/IMPACT.md)
- [Two-page summary](docs/SUMMARY.md)
- [Adoption & scalability roadmap](docs/ROADMAP.md)

License: MIT
