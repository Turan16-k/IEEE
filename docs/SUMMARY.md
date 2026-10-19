# EmisPass: two-page summary

## Problem

- **CBAM is live.** Since 1 January 2026 EU importers pay for the CO2 embedded in steel, cement, aluminium, fertiliser and hydrogen. Without verified, installation-level data from the producer, they must use default values with a 10 % mark-up, rising to 30 % from 2028. The first declaration is due **30 September 2027**.
- **Türkiye is exposed twice.** It is a major exporter of CBAM goods: Turkish steel exports to the EU fell 22 % year-on-year in January–July 2026. Its own ETS (Climate Law No. 7552) starts with a 2026 reporting-only pilot that covers about 800 installations and roughly half of national emissions. Each installation's report must be checked by a TÜRKAK-accredited verifier, and there are too few of them.
- **The trust gap.** Producers will not publish process data. Importers cannot check what they receive. Verifiers spend most of their time reconciling invoices. And nothing stops a verified number from being altered later or reused for a different buyer.

## Solution

EmisPass is a **verifiable embedded-emission passport**:

1. The plant **signs** its monthly claim (EIP-712). Meter and fuel-supplier data arrive **signed by the third parties** who own them.
2. **Three independent AI verifiers** run seven explainable checks:
   - provenance;
   - reconciliation;
   - IPCC recalculation;
   - comparison with real Turkish peers from Climate TRACE;
   - a gradient-boosting model of expected intensity;
   - an Isolation Forest anomaly model;
   - a satellite activity signal.
3. A smart contract anchors the passport only if **2 of 3 verifiers** sign the exact claim. It stores totals, the verdict, the risk score and hashes of the report, the evidence and the model.
4. Each **EU importer** receives only its own shipment's record and a Merkle proof. It verifies the record on-chain and **declares it once**; nobody else can reuse it.

## Users and value

| User | Value |
|---|---|
| Turkish exporter (steel, cement) | Replaces punitive defaults with verified actual values: €15.94/t less gross exposure for the EAF plant in the demo. Process data stays private. |
| Accredited verifier (TÜRKAK / MEDAS) | Receives a pre-reconciled, explainable evidence pack and spends site-visit time where the risk is. |
| EU importer | Checks its own shipment cryptographically without trusting e-mails or PDFs, and has an audit trail for its CBAM declaration. |
| Regulator (Ministry, EPİAŞ/EXIST registry) | Gets tamper-evident monthly signals, can revoke a passport after a site visit, and sees flagged history. |

## What is built (working prototype)

- `FacilityRegistry` and `EmissionPassport` contracts (Solidity, OpenZeppelin 5), with **19 passing tests**.
- A Python AI verifier with **9 passing tests**. It uses real Climate TRACE data for 87 Turkish installations.
- An end-to-end demo: 10 passports, 1 under-declaration caught and then corrected, 22 importer declarations, and **6 of 6 live attacks blocked** (compromised verifier, replay, tampering, double use, theft, declaring from a flagged passport).
- A dashboard with Producer, AI Verifier, EU Importer and Security views that reads the chain live.

## Why blockchain, and why AI

- **Blockchain** gives operator, verifier, importer and regulator, who do not trust each other, one shared record that cannot be changed: who claimed what, which verifiers agreed, and which shipment was declared by whom. Nobody has to give up their data, and no single party controls the ledger. No token is involved.
- **AI** does the cross-checking that human verifiers cannot do monthly for 800 plants. It flags what deserves a site visit and explains why. Because the model is hashed, a verdict can always be traced to the exact model that produced it.

## Impact

Projected over 2027–2030 on a base of 86.3 MtCO2e/yr (Turkish steel and cement, Climate TRACE): **146 kt (conservative) to 5.1 Mt (ambitious)** of physical reductions through the price signal, plus 95 kt to 2.5 Mt of misreporting caught. All assumptions are stated in `IMPACT.md`.

## Next steps

| When | Step |
|---|---|
| Q1 2027 | Pilot with one EAF steel plant and one cement plant: real EPİAŞ meter data, e-invoice fuel data, Sentinel-5P connector. |
| Before 30 Sep 2027 | Passports used for the first CBAM declarations. |
| 2028 | Integration with TR-ETS pricing and verifier onboarding. |
