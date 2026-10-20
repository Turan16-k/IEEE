# Demo video script (target 3:20)

Record at 1920×1080 with the dashboard in the browser at 110–125 % zoom. Speak in English, calmly, about 140 words per minute. Total spoken text is about 470 words. If the jury is mostly Turkish, switch the dashboard to TR with one click at 2:55 to show it is bilingual.

| Time | Screen | Narration |
|---|---|---|
| 0:00–0:20 | Title slide: "EmisPass: verifiable emission passports for CBAM". | "Since January, every tonne of Turkish steel or cement entering the EU carries a carbon bill under CBAM. If the producer cannot prove its real emissions, the importer pays on punitive default values. Türkiye's own emissions trading system starts at the same time, and there are not enough verifiers. The real problem is trust." |
| 0:20–0:40 | Overview tab, the 5-step flow | "EmisPass turns a plant's monthly emission report into a passport. The plant signs it. Meter and fuel-supplier data come signed by those third parties. Three independent AI verifiers check it, and a smart contract anchors it only if two of three agree." |
| 0:40–1:25 | **Try to cheat** tab, BF-BOF plant. Click "Honest report" (APPROVED), then "Hide 30 % of main fuel" (FLAGGED), then drag the coking coal slider back towards 100 %. | "Let's play the dishonest plant manager. An honest report is approved. Now I hide 30 % of my coking coal. The supplier's signed deliveries don't match, the recalculation is 22 % higher, a gradient-boosting model trained on independent signals expects far more CO2, and the anomaly model sees a 15-sigma jump. Flagged. These are the same machine-learning models the verifier nodes run, exported to the browser and tested against them." |
| 1:25–1:40 | Click "Edit meter record after signing" | "What if I edit the grid meter record instead? Its signature no longer matches. Critical, instantly." |
| 1:40–2:00 | AI Verifier tab, passport #9 → *Verify report & evidence hashes*, then scroll to the plain-language summary | "Here is that month on-chain: flagged, with every finding explained in Turkish and English for the plant manager. The report and evidence hashes are on-chain, so nobody can quietly edit them later. The corrected resubmission was approved, and the flagged attempt stays on record." |
| 2:00–2:20 | Producer tab, EAF plant → click *CBAM supplier data (CSV)* | "For honest producers this is money: this electric-arc-furnace plant is verified at 0.11 tonnes of CO2 per tonne, inside the real Turkish peer range from Climate TRACE, about 16 euros per tonne less than the default. One click exports the data in the fields the EU CBAM template asks for." |
| 2:20–2:40 | EU Importer tab → Run checks (→ optionally Declare with wallet) | "An importer in Rotterdam receives only its own shipment. It checks the Merkle proof against the passport on-chain and declares it once, from its wallet. Other buyers' volumes and the plant's process data stay private." |
| 2:40–2:55 | Real data tab: the Sentinel-5P chart | "The satellite signal is real: Sentinel-5P nitrogen dioxide over the İskenderun steel cluster, fetched straight from Copernicus data." |
| 2:55–3:10 | Security tab; click TR | "We attacked our own contracts: a compromised verifier, replay, tampering, double use and theft. All six were blocked. Everything is tested in CI, and the whole dashboard works in Turkish too." |
| 3:10–3:20 | Closing slide: impact numbers + links | "With verified data, a cleaner plant becomes a cheaper supplier. On Türkiye's 86 million tonnes of steel and cement emissions, we project 0.15 to 5 million tonnes of reductions by 2030. EmisPass, for COP31 in Antalya." |

**Checklist before recording:**
- Run `npx hardhat node` and `.\run-demo.ps1 -Serve` fresh, so the block numbers look clean and all 6 attacks show as blocked.
- For the wallet scene, import the Hardhat key of "importer:A" (account #7) into MetaMask. It is a test key only.
- Close notifications.
- Say once that the plants are fictional, the plant data is synthetic, and the benchmarks and satellite data are real.
