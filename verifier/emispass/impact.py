"""Climate-impact projection for docs/IMPACT.md.

Every input is listed in ASSUMPTIONS; the covered-emissions base comes from the cached Climate
TRACE data for Turkish steel and cement installations. Outputs are projections, not measurements.
"""

from __future__ import annotations

from .sources import climate_trace

ASSUMPTIONS = {
    "years": [2027, 2028, 2029, 2030],
    "scenarios": {
        # share of Turkish steel+cement emissions whose monthly reports flow through EmisPass
        "conservative": {"adoption": [0.01, 0.02, 0.03, 0.05], "misreportingCaught": 0.01, "extraIntensityCut": 0.005},
        "moderate": {"adoption": [0.03, 0.07, 0.12, 0.20], "misreportingCaught": 0.02, "extraIntensityCut": 0.01},
        "ambitious": {"adoption": [0.05, 0.15, 0.30, 0.45], "misreportingCaught": 0.03, "extraIntensityCut": 0.02},
    },
    "notes": {
        "misreportingCaught": "Share of covered emissions that would otherwise be under-reported and is brought back into the priced inventory (integrity gain, not a physical reduction).",
        "extraIntensityCut": "Additional annual intensity reduction at adopters, cumulative, because verified actual values are rewarded against punitive defaults (price signal).",
    },
}


def project() -> dict:
    bm = climate_trace.benchmarks()["routes"]
    base_mt = sum(bm[g]["totalEmissionsMt"] for g in ("BF-BOF", "EAF", "cement") if g in bm)
    out = {"baseMt": base_mt, "scenarios": {}}
    for name, s in ASSUMPTIONS["scenarios"].items():
        rows, cum_red, cum_int = [], 0.0, 0.0
        for i, (year, adoption) in enumerate(zip(ASSUMPTIONS["years"], s["adoption"])):
            covered = base_mt * adoption
            integrity = covered * s["misreportingCaught"]
            reduction = covered * (1 - (1 - s["extraIntensityCut"]) ** (i + 1))
            cum_red += reduction
            cum_int += integrity
            rows.append({"year": year, "coveredMt": covered, "integrityMt": integrity, "reductionMt": reduction})
        out["scenarios"][name] = {"rows": rows, "cumReductionMt": cum_red, "cumIntegrityMt": cum_int}
    return out


def markdown() -> str:
    p = project()
    lines = [f"Covered base: **{p['baseMt']:.1f} MtCO2e/yr** (Turkish BF-BOF + EAF steel and cement installations, Climate TRACE).", ""]
    lines.append("| Scenario | Year | Emissions verified (Mt) | Misreporting caught (Mt) | Physical reduction (Mt) |")
    lines.append("|---|---|---|---|---|")
    for name, s in p["scenarios"].items():
        for r in s["rows"]:
            lines.append(f"| {name} | {r['year']} | {r['coveredMt']:.2f} | {r['integrityMt']:.3f} | {r['reductionMt']:.3f} |")
    lines.append("")
    lines.append("| Scenario | Cumulative 2027-2030 physical reduction | Cumulative misreporting caught |")
    lines.append("|---|---|---|")
    for name, s in p["scenarios"].items():
        lines.append(f"| {name} | {s['cumReductionMt'] * 1000:,.0f} kt CO2e | {s['cumIntegrityMt'] * 1000:,.0f} kt CO2e |")
    return "\n".join(lines)


if __name__ == "__main__":
    print(markdown())
