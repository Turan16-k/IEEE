# Architecture & technical specification

## Actors and trust boundaries

```mermaid
flowchart LR
  subgraph Plant["Installation (TR)"]
    OP[Operator MRV system<br/>signs EmissionClaim]
  end
  subgraph Feeds["Independent data sources"]
    GM[Grid meter operator<br/>signed electricity]
    FS[Fuel supplier<br/>signed deliveries]
    SAT[Satellite activity<br/>Sentinel-5P NO2]
    CT[Climate TRACE<br/>Turkish peers]
  end
  subgraph Verifiers["AI verifier nodes (independent)"]
    V1[Node 1]
    V2[Node 2]
    V3[Node 3]
  end
  subgraph Chain["EVM chain"]
    REG[FacilityRegistry]
    EP[EmissionPassport]
  end
  IMP[EU importer]
  REGU[Regulator / accreditation body]

  OP -- claim + evidence bundle --> V1 & V2 & V3
  GM & FS & SAT & CT --> V1 & V2 & V3
  V1 & V2 & V3 -- EIP-712 Verification --> EP
  OP -- EIP-712 claim --> EP
  REG --> EP
  OP -- disclosure + Merkle proof --> IMP
  IMP -- declareShipment --> EP
  REGU -- revokePassport --> EP
```

Every arrow that crosses a boundary carries a signature or a hash commitment:

| Boundary | Mechanism |
|---|---|
| Operator → anyone | EIP-712 `EmissionClaim` signed by the key in `FacilityRegistry` |
| Feeds → verifiers | EIP-191 signature over canonical JSON. The signer must be on the trust list and the scope (installation, period) must match. |
| Verifiers → chain | EIP-712 `Verification` over the exact claim digest. At least `verifierThreshold` distinct registered verifiers must sign. |
| Off-chain files → chain | `evidenceHash` = keccak256(evidence bundle bytes), `reportHash` = keccak256(report bytes), `modelHash` = keccak256(verifier code, factors, ML configuration, benchmarks) |
| Producer → importer | Salted commitment per shipment; leaf = keccak256(keccak256(abi.encode(importer, commitment))); Merkle root inside the claim |

## Sequence

```mermaid
sequenceDiagram
  participant O as Operator
  participant V as Verifier nodes (3)
  participant C as EmissionPassport
  participant I as EU importer
  O->>O: build monthly claim, shipments tree, evidence bundle
  O->>V: claim + EIP-712 signature + evidence
  V->>V: 7 checks -> deterministic report, risk score, verdict
  V-->>O: Verification signatures (same reportHash)
  O->>C: submitPassport(claim, opSig, verification, sigs[])
  C->>C: operator sig, nonce, k-of-n, digest match -> Approved / Flagged
  O-->>I: shipment record + salt + Merkle proof (off-chain)
  I->>I: recompute commitment, verify proof
  I->>C: declareShipment(passportId, commitment, proof)
  C->>C: proof valid for msg.sender, passport Approved, leaf unused
```

## Smart contracts (Solidity 0.8.28, OpenZeppelin 5)

### `FacilityRegistry`
- `registerFacility(name, installationId, country, sector, route, operatorKey)`. Restricted to `REGISTRAR_ROLE`.
- `rotateOperatorKey`, `setActive`, `getFacility`, `operatorOf`, `isActive`.

### `EmissionPassport`

EIP-712 domain: `EmisPass` / `1` / chainId / contract address.

```
EmissionClaim(uint256 facilityId,uint32 period,uint256 productionTonnes,uint256 directEmissionsKg,
              uint256 indirectEmissionsKg,bytes32 shipmentsRoot,bytes32 evidenceHash,uint256 nonce)
Verification(bytes32 claimDigest,uint8 verdict,uint16 riskScore,bytes32 modelHash,bytes32 reportHash)
```

| Function | Rules |
|---|---|
| `submitPassport(claim, operatorSig, verification, verifierSigs[])` | Anyone can relay it. Requirements: the facility is active; `nonce == facilityNonce`; the period is valid; the operator signature recovers to the registered key; `verification.claimDigest == hashClaim(claim)`; at least the threshold of distinct `VERIFIER_ROLE` signers. Duplicates and unknown keys are ignored. Status becomes Approved or Flagged. A period can be resubmitted only if no Approved passport exists for it. |
| `revokePassport(id, reason)` | `REGULATOR_ROLE` |
| `verifyShipment(id, importer, commitment, proof)` | View. True only for Approved passports. |
| `declareShipment(id, commitment, proof)` | The leaf is bound to `msg.sender` and can be declared only once (`declaredUnder`). |
| `setVerifierThreshold(k)` | `DEFAULT_ADMIN_ROLE`, k > 0 |
| `specificEmissions(id)` | kgCO2e per tonne, direct and indirect |

Custom errors make every rejection explicit: `BadNonce`, `BadOperatorSignature`, `VerificationDoesNotMatchClaim`, `InsufficientVerifierSignatures`, `PeriodAlreadyApproved`, `InvalidShipmentProof`, `ShipmentAlreadyDeclared`, and others.

## AI verifier (`verifier/emispass`)

| # | Check | Type | Signals the operator does not control |
|---|---|---|---|
| 1 | Provenance | rule | Feed signatures and trust list |
| 2 | Activity reconciliation | rule | Grid meter (±2 %) and supplier deliveries (±5 %) |
| 3 | Independent recalculation | rule | IPCC 2006 factors applied to supplier and meter data |
| 4 | Turkish peer benchmark | data | Climate TRACE p10–p90 by production route (real data) |
| 5 | Expected intensity | ML: `GradientBoostingRegressor` | Fuel deliveries, metered electricity, satellite activity per tonne |
| 6 | Monthly anomaly | ML: `IsolationForest` + robust z | The facility's own verified history |
| 7 | Satellite consistency | rule | Production implied by the satellite activity signal |

The risk score is the sum of severity points (info 0, low 40, medium 120, high 300, critical 600), capped at 1000. The verdict is **FLAGGED** if the score is at least 400 or any finding is critical. The ML outputs can only raise risk; no model can approve a claim on its own.

The pipeline is deterministic: fixed seeds, canonical JSON, no timestamps in reports. Honest nodes therefore produce byte-identical reports, and the orchestrator refuses to aggregate signatures if the report hashes differ.

## Data model off-chain

- `out/evidence/<tag>.json`: the operator declaration, both signed feeds and the satellite record. Its hash is `evidenceHash`.
- `out/reports/<tag>.json`: findings with numbers, the CBAM view and model metadata. Its hash is `reportHash`.
- `out/disclosures/<shipmentId>.json`: one shipment's values, salt, commitment and Merkle proof, given only to its importer.

In production these files go to content-addressed storage such as IPFS or Filecoin, with access control for the evidence bundle.

## Production data sources (connectors)

| Demo stand-in | Production source |
|---|---|
| Synthetic grid mix | EPİAŞ Şeffaflık Platformu real-time generation (free account, TGT ticket). `sources/grid.py` turns any mix into gCO2/kWh. |
| Synthetic NO2 index | Sentinel-5P TROPOMI L2 NO2 (Copernicus Data Space or Planetary Computer), as a monthly buffer mean around the plant |
| Signed meter feed | Distribution company / EPİAŞ settlement meter data, signed by the data owner |
| Signed fuel feed | e-invoice (e-Fatura) or customs (GİB, BOTAŞ, port) records, signed at source |
| Climate TRACE cache | Live API `api.climatetrace.org/v6/assets?countries=TUR&subsectors=…` (`python -m emispass fetch-climatetrace`) |

## Browser verifier ("Try to cheat")

`verifier/emispass/export.py` serialises the trained models into `out/simulator.json`:
- every tree of the `GradientBoostingRegressor`, node by node;
- every tree of each facility's `IsolationForest`, with the per-leaf path lengths;
- the emission factors, tolerances, Climate TRACE benchmarks and the exact signed feed messages.

`app/verifier.js` runs the same seven checks on top of that file. Trees are walked with float32 inputs, as scikit-learn does, and feed signatures are verified with `ethers.verifyMessage` over the signed bytes. Two tests guard the equivalence:
- `verifier/tests/test_export.py`: the exported models reproduce scikit-learn to within 1e-9.
- `scripts/check-simulator.js`: the browser verdicts, risk scores and finding severities equal the Python reports. CI runs it on every push.

## Plain-language summaries

`verifier/emispass/explain.py` writes `out/explanations/<tag>.json` with a Turkish and an English paragraph plus next actions for the plant manager.

- **Default:** a deterministic template built from the report.
- **With Claude API credentials:** Claude (`claude-opus-5-5`, structured JSON output, server-side refusal fallback) rewrites the summary from the report's findings. The prompt forbids changing the verdict or inventing numbers.
- **On any error:** the template is used.

The verdict and the signed `reportHash` never depend on the summary.

## Real Sentinel-5P data

`verifier/emispass/sources/sentinel5p.py` reads Copernicus Sentinel-5P TROPOMI L2 tropospheric NO₂ from MEEO's cloud-optimised GeoTIFFs on AWS Open Data (`s3://meeo-s5p`). It needs no account and no GDAL; `tifffile` and HTTP range requests are enough.

For each sampled day it:
1. picks the orbit over Türkiye at about 10:45 UTC;
2. keeps pixels with `qa_value ≥ 0.75`;
3. computes the mean NO₂ over the industrial box minus a rural background box.

Monthly means are cached in `data/sentinel5p/<area>.json` and shown in the dashboard. In production the same function, pointed at an installation's box, replaces the synthetic per-plant activity signal.

## Wallet actions and CBAM export

- **Wallet:** the dashboard connects to any EIP-1193 wallet such as MetaMask, switching to or adding the deployment's chain. An importer can `declareShipment` for its own disclosure, and an account holding `REGULATOR_ROLE` can `revokePassport` with a reason. Without a reachable chain these buttons are hidden and the dashboard runs in snapshot mode.
- **CBAM export:** `app/cbam.js` maps a passport, or a passport plus one shipment, onto the key fields of the CBAM communication template for installations. These are the installation, reporting period, CN code, specific direct and indirect emissions, determination method, carbon price paid and the verification references (passport id, report, evidence and model hashes, contract, chain). It exports CSV or JSON.
