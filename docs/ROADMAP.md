# Adoption & scalability roadmap

## Adoption strategy

| Phase | Timing | Goal | Partners (target) |
|---|---|---|---|
| 0. Hackathon prototype | Oct 2026 | End-to-end demo, open source | IEEE Blockchain Türkiye |
| 1. Pilot | Q1–Q2 2027 | 1 EAF steel and 1 cement exporter; real meter, fuel and satellite feeds; 6 months of passports | Exporter associations (steel, cement), one TÜRKAK-accredited verifier, a university lab |
| 2. First CBAM cycle | Q3 2027 | Passports attached to supplier data for EU importers ahead of the first CBAM declaration (30 Sep 2027) | 2–3 EU importers of the pilot plants |
| 3. TR-ETS integration | 2028 | Export of verified data in the MEDAS/EXIST formats; verifier marketplace | Ministry of Environment, Urbanisation and Climate Change; EPİAŞ |
| 4. Regional | 2029+ | Other CBAM-exposed exporters (e.g. Ukraine, Egypt, India) | Exporter associations, development banks |

**Funding channels for exporters:** Türk Eximbank green export credit and the Ministry of Trade support covering 50 % of Green Deal consulting costs. Verification software can be bundled into these.

**Business model:** a subscription per installation per year, paid by the exporter, which is cheaper than one tonne of default mark-up. Verifier nodes are paid per verified passport. There is no token.

## Technical scalability

| Dimension | Today | At national scale | Path |
|---|---|---|---|
| Passports/year | 10 in the demo | about 9,600 (800 installations × 12) | Already fine. About 350k gas each fits easily on an L2. |
| Chain | Hardhat / Sepolia / Base Sepolia | Ethereum L2 (Base, Arbitrum) or a permissioned EVM run by the registry operator | Contracts are chain-agnostic EVM |
| Shipments | Merkle root per month | Unlimited per month; proof size grows as log2(n) | No change |
| Verifier nodes | 3, threshold 2 | 5–7 nodes across accredited bodies, threshold 3–4 | `setVerifierThreshold` + `grantRole` |
| Evidence storage | Local files | IPFS/Filecoin with encryption; access granted to verifiers | `evidenceHash` already content-addresses files |
| Data connectors | Synthetic stand-ins | EPİAŞ API (TGT), e-Fatura/GİB, Sentinel-5P via Copernicus/Planetary Computer, Climate TRACE live API | `sources/` interface |
| Privacy | Totals public | ZK range proofs ("intensity below X") instead of totals | Circom/Halo2 circuit over the same commitments |
| Standards | Custom EIP-712 schema | W3C Verifiable Credentials or EAS attestations; mapping to the CBAM supplier communication template | Schema mapping only |
| Governance | Single admin key | Safe multisig (ministry, registry, accreditation body) + timelock | Role transfer |

## Sustainability of the project

- Open source (MIT) so that verifiers and regulators can audit the code. This matters because `modelHash` is meaningful only if the code is public.
- Model updates are versioned. Each new version gets a new `modelHash`, and old passports remain tied to the version that issued them.
- The methodology can be extended to other sectors (aluminium, fertiliser, hydrogen) by adding emission factors and routes in `factors.py`.
