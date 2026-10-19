# Climate impact assessment

## Why verified emission data reduces emissions

EmisPass does not create offsets or credits. It affects the climate through two channels:

1. **Integrity.** Under-reported emissions escape carbon pricing. Catching misreporting returns those tonnes to the priced inventory of the Turkish ETS and of CBAM. This is not a physical reduction, but without it the price signal is weaker.
2. **Price signal.** Under CBAM, a producer with *verified actual* emissions below the default value saves its EU buyer money on every tonne. With verified data, a cleaner plant becomes a cheaper supplier. That rewards efficiency investments such as scrap-based EAF, alternative fuels and lower clinker ratios, which defaults cannot do.

In the demo, the EAF rebar plant's verified intensity is 0.114 tCO2e/t against an illustrative default of 0.308. That is €15.94/t lower gross CBAM exposure at €82.32/tCO2e, or about €18,000 on a single 1,089 t shipment. The values are illustrative and come before the free-allocation adjustment.

## Projection 2027–2030

Reproduce it with `python -m emispass.impact`. The base is real Climate TRACE data for Turkish BF-BOF and EAF steel and cement installations: **86.3 MtCO2e per year**.

| Assumption | Conservative | Moderate | Ambitious |
|---|---|---|---|
| Share of base flowing through EmisPass, 2027 → 2030 | 1 → 5 % | 3 → 20 % | 5 → 45 % |
| Misreporting caught (share of verified emissions) | 1 % | 2 % | 3 % |
| Extra annual intensity cut at adopters (price signal), cumulative | 0.5 %/yr | 1 %/yr | 2 %/yr |

| Scenario | Cumulative 2027–2030 physical reduction | Cumulative misreporting caught |
|---|---|---|
| Conservative | **146 kt CO2e** | 95 kt CO2e |
| Moderate | **1,134 kt CO2e** | 725 kt CO2e |
| Ambitious | **5,139 kt CO2e** | 2,461 kt CO2e |

Moderate scenario by year:

| Year | Emissions verified (Mt) | Misreporting caught (Mt) | Physical reduction (Mt) |
|---|---|---|---|
| 2027 | 2.59 | 0.052 | 0.026 |
| 2028 | 6.04 | 0.121 | 0.120 |
| 2029 | 10.36 | 0.207 | 0.308 |
| 2030 | 17.27 | 0.345 | 0.680 |

## Why the assumptions are plausible, and where they are not

- **Adoption** follows the policy calendar. The TR-ETS pilot reports for 2026 are due in 2027. The first CBAM declaration, covering 2026 imports, is due 30 September 2027. Prices in TR-ETS start in 2027–2028. The base is limited to steel and cement, which are both TR-ETS and CBAM sectors, and excludes aluminium, fertiliser and power.
- **Misreporting rates** of 1–3 % are deliberately far below the over-crediting found in voluntary markets. One example is the ~9× over-crediting of survey-based cookstove credits against ~1.5× for metered methods (Gill-Wiehl et al., *Nature Sustainability* 2024). Compliance reporting is more tightly controlled, so smaller rates are assumed.
- **The intensity effect** is the most uncertain number. It depends on CBAM price levels and the free-allocation phase-out (CBAM factor 2.5 % in 2026, rising to 100 % in 2034). The conservative case assumes almost no behavioural change.
- **Not counted:** lower verification costs, faster verifier throughput, and avoided trade losses (Turkish steel exports to the EU fell 22 % year-on-year in January–July 2026, partly because of CBAM verification uncertainty).

## Sustainability of the system itself

Anchoring a passport costs about 350k gas. 800 TR-ETS installations × 12 months is about 9,600 passports a year, roughly 3.4 billion gas, which is negligible on an Ethereum L2 or a proof-of-stake chain. The AI checks run on a CPU in under a second per claim. The system's own footprint is immaterial next to the emissions it verifies.
