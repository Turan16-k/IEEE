"""Verification checks: deterministic rules + two ML models.

Every check returns findings with a severity and the numbers behind it, so a human verifier
(e.g. a TÜRKAK-accredited body) can reproduce the reasoning. The ML parts are advisory signals
that raise the risk score; they never approve a claim on their own.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from sklearn.ensemble import GradientBoostingRegressor, IsolationForest

from .crypto import verify_record
from .factors import BENCHMARK_GROUP, EMISSION_FACTORS, FUELS_BY_ROUTE, LABELS, SEVERITY_POINTS, TOLERANCE

ML_SEED = 7
FEED_LABELS = {"gridMeter": "Grid meter", "fuelSupplier": "Fuel supplier"}


@dataclass
class Finding:
    check: str
    severity: str
    title: str
    detail: str
    values: dict = field(default_factory=dict)

    def as_dict(self) -> dict:
        return {"check": self.check, "severity": self.severity, "title": self.title, "detail": self.detail, "values": self.values}


def _pct(a: float, b: float) -> float:
    return 0.0 if b == 0 else (a - b) / b * 100.0


# ---------------------------------------------------------------- 1. provenance


def check_provenance(record: dict, trusted: dict) -> list[Finding]:
    out = []
    for name, env in record["feeds"].items():
        expected = trusted.get(name)
        ok_sig = verify_record(env)
        ok_signer = expected is not None and env["signer"].lower() == expected.lower()
        rec = env["record"]
        ok_scope = rec.get("installationId") == record["declaration"]["installationId"] and rec.get("period") == record["period"]
        if ok_sig and ok_signer and ok_scope:
            out.append(Finding("provenance", "info", f"{FEED_LABELS.get(name, name)} feed authentic", "Signature valid, signer on trust list, scope matches.", {"signer": env["signer"]}))
        else:
            out.append(
                Finding(
                    "provenance",
                    "critical",
                    f"{FEED_LABELS.get(name, name)} feed failed authentication",
                    "Independent evidence could not be authenticated; the claim cannot be verified.",
                    {"signatureValid": ok_sig, "trustedSigner": ok_signer, "scopeMatches": ok_scope},
                )
            )
    return out


# ---------------------------------------------------------------- 2. activity reconciliation


def check_reconciliation(record: dict) -> list[Finding]:
    d = record["declaration"]
    out = []
    metered = record["feeds"]["gridMeter"]["record"]["electricityMWh"]
    dev = _pct(d["electricityMWh"], metered)
    sev = "high" if abs(dev) > TOLERANCE["electricityMeterPct"] else "info"
    out.append(Finding("reconciliation", sev, "Electricity vs grid meter", f"Declared {d['electricityMWh']:.0f} MWh, metered {metered:.0f} MWh ({dev:+.1f} %).", {"declared": d["electricityMWh"], "metered": metered, "deviationPct": round(dev, 2)}))

    deliveries = record["feeds"]["fuelSupplier"]["record"]["deliveries"]
    for fuel, delivered in deliveries.items():
        declared = d["activity"].get(fuel, 0.0)
        dev = _pct(declared, delivered)
        sev = "info"
        if abs(dev) > TOLERANCE["fuelDeliveryPct"]:
            sev = "critical" if dev < -3 * TOLERANCE["fuelDeliveryPct"] else "high"
        out.append(
            Finding(
                "reconciliation",
                sev,
                f"{LABELS.get(fuel, fuel)} vs supplier deliveries",
                f"Declared consumption {declared:,.0f}, supplier delivered {delivered:,.0f} ({dev:+.1f} %).",
                {"fuel": fuel, "declared": declared, "delivered": delivered, "deviationPct": round(dev, 2)},
            )
        )
    return out


# ---------------------------------------------------------------- 3. independent recalculation


def independent_direct_emissions_kg(record: dict, route: str) -> float:
    """Direct emissions rebuilt from supplier deliveries where available, declared values otherwise."""
    d = record["declaration"]
    deliveries = record["feeds"]["fuelSupplier"]["record"]["deliveries"]
    total = 0.0
    for f in FUELS_BY_ROUTE[route]:
        qty = deliveries.get(f, d["activity"].get(f, 0.0))
        total += qty * EMISSION_FACTORS[f]
    return total * 1000


def check_recalculation(record: dict, route: str) -> tuple[list[Finding], float]:
    d = record["declaration"]
    own = sum(d["activity"].get(f, 0.0) * EMISSION_FACTORS[f] for f in FUELS_BY_ROUTE[route]) * 1000
    independent = independent_direct_emissions_kg(record, route)
    out = []
    arith = _pct(d["directEmissionsKg"], own)
    if abs(arith) > 0.5:
        out.append(Finding("recalculation", "high", "Declared total does not match declared activity data", f"Totals differ by {arith:+.1f} % from the operator's own inputs.", {"deviationPct": round(arith, 2)}))
    dev = _pct(d["directEmissionsKg"], independent)
    sev = "info"
    if abs(dev) > TOLERANCE["recalcCriticalPct"]:
        sev = "critical"
    elif abs(dev) > TOLERANCE["recalcHighPct"]:
        sev = "high"
    out.append(
        Finding(
            "recalculation",
            sev,
            "Direct emissions vs independent recalculation",
            f"Declared {d['directEmissionsKg'] / 1e6:,.1f} kt, recomputed from supplier/meter data {independent / 1e6:,.1f} kt ({dev:+.1f} %).",
            {"declaredKg": d["directEmissionsKg"], "independentKg": round(independent), "deviationPct": round(dev, 2)},
        )
    )
    ind_expected = record["feeds"]["gridMeter"]["record"]["electricityMWh"] * d["gridEmissionFactor"] * 1000
    dev_i = _pct(d["indirectEmissionsKg"], ind_expected)
    out.append(
        Finding(
            "recalculation",
            "high" if abs(dev_i) > TOLERANCE["recalcHighPct"] else "info",
            "Indirect emissions vs metered electricity x grid factor",
            f"Declared {d['indirectEmissionsKg'] / 1e6:,.2f} kt, expected {ind_expected / 1e6:,.2f} kt ({dev_i:+.1f} %).",
            {"declaredKg": d["indirectEmissionsKg"], "expectedKg": round(ind_expected), "gridEF": d["gridEmissionFactor"], "deviationPct": round(dev_i, 2)},
        )
    )
    return out, independent


# ---------------------------------------------------------------- 4. peer benchmark (Climate TRACE, real data)


def check_benchmark(record: dict, route: str, benchmarks: dict) -> list[Finding]:
    group = benchmarks["routes"].get(BENCHMARK_GROUP[route])
    if not group:
        return [Finding("benchmark", "low", "No Turkish peer benchmark", f"No Climate TRACE assets for route {route}.")]
    d = record["declaration"]
    intensity = d["directEmissionsKg"] / d["productionTonnes"] / 1000
    lo, hi, med = group["p10T"], group["p90T"], group["medianT"]
    if intensity < lo * 0.85:
        sev, title = "medium", "Intensity implausibly low for production route"
    elif intensity > hi * 1.25:
        sev, title = "low", "Intensity above Turkish peer range"
    else:
        sev, title = "info", "Intensity within Turkish peer range"
    return [
        Finding(
            "benchmark",
            sev,
            title,
            f"{intensity:.3f} tCO2e/t vs Turkish {BENCHMARK_GROUP[route]} p10-p90 {lo:.3f}-{hi:.3f} (median {med:.3f}, {group['assets']} assets, Climate TRACE).",
            {"intensityT": round(intensity, 4), "p10T": round(lo, 4), "p90T": round(hi, 4), "medianT": round(med, 4), "peerAssets": group["assets"]},
        )
    ]


# ---------------------------------------------------------------- 5. ML: expected emissions from independent signals


def _independent_features(record: dict, route_idx: int) -> list[float]:
    d = record["declaration"]
    prod = d["productionTonnes"]
    deliveries = record["feeds"]["fuelSupplier"]["record"]["deliveries"]
    fuel_co2_per_t = sum(q * EMISSION_FACTORS[f] for f, q in deliveries.items()) / prod
    return [
        route_idx,
        fuel_co2_per_t,
        record["feeds"]["gridMeter"]["record"]["electricityMWh"] / prod,
        record["satellite"]["no2AnomalyUmolM2"] / prod * 1000,
    ]


ROUTES = ["EAF", "BF-BOF", "dry-kiln"]


def train_expected_intensity_model(history: list[dict], facilities: dict) -> GradientBoostingRegressor:
    """Learns direct intensity (t/t) from signals the operator does not control.

    Trained on verified past months of all registered installations (pooled across routes), plus
    jittered copies to regularise the small sample.
    """
    rng = np.random.default_rng(ML_SEED)
    X, y = [], []
    for rec in history:
        route = facilities[rec["facilityId"]]["route"]
        base = _independent_features(rec, ROUTES.index(route))
        target = rec["declaration"]["directEmissionsKg"] / rec["declaration"]["productionTonnes"] / 1000
        for _ in range(20):
            jitter = np.array(base) * (1 + np.r_[0, 0.01 * rng.standard_normal(3)])
            X.append(jitter)
            y.append(target * (1 + 0.005 * rng.standard_normal()))
    model = GradientBoostingRegressor(n_estimators=150, max_depth=3, learning_rate=0.08, random_state=ML_SEED)
    model.fit(np.array(X), np.array(y))
    return model


def check_expected_intensity(record: dict, route: str, model: GradientBoostingRegressor) -> list[Finding]:
    d = record["declaration"]
    declared = d["directEmissionsKg"] / d["productionTonnes"] / 1000
    predicted = float(model.predict(np.array([_independent_features(record, ROUTES.index(route))]))[0])
    dev = _pct(declared, predicted)
    sev = "info"
    if dev < -15:
        sev = "high"
    elif dev < -7:
        sev = "medium"
    return [
        Finding(
            "ml-expected-intensity",
            sev,
            "Declared intensity vs ML estimate from independent signals",
            f"Gradient-boosting model (fuel deliveries, metered electricity, satellite activity) expects {predicted:.3f} t/t; declared {declared:.3f} t/t ({dev:+.1f} %).",
            {"predictedT": round(predicted, 4), "declaredT": round(declared, 4), "deviationPct": round(dev, 2)},
        )
    ]


# ---------------------------------------------------------------- 6. ML: anomaly vs own history


def _history_features(rec: dict, route: str) -> list[float]:
    d = rec["declaration"]
    prod = d["productionTonnes"]
    independent = independent_direct_emissions_kg(rec, route)
    return [
        d["directEmissionsKg"] / prod,
        d["indirectEmissionsKg"] / prod,
        d["directEmissionsKg"] / independent,
        prod / rec["satellite"]["no2AnomalyUmolM2"],
    ]


def check_isolation_forest(record: dict, history: list[dict], route: str) -> list[Finding]:
    if len(history) < 6:
        return [Finding("ml-anomaly", "low", "Insufficient history for anomaly model", f"{len(history)} months available, 6 needed.")]
    X = np.array([_history_features(h, route) for h in history])
    mu, sd = X.mean(axis=0), X.std(axis=0) + 1e-9
    model = IsolationForest(n_estimators=200, contamination="auto", random_state=ML_SEED).fit((X - mu) / sd)
    x = (np.array(_history_features(record, route)) - mu) / sd
    score = float(model.score_samples([x])[0])
    floor = float(model.score_samples((X - mu) / sd).min())
    names = ["direct kg/t", "indirect kg/t", "declared/independent ratio", "production per satellite unit"]
    worst = int(np.argmax(np.abs(x)))
    # Isolation-forest path lengths saturate for extreme outliers, so a large standardised
    # deviation on any feature also counts as anomalous.
    anomalous = score < floor - 0.02 or abs(float(x[worst])) > 4.0
    return [
        Finding(
            "ml-anomaly",
            "medium" if anomalous else "info",
            "Month is anomalous vs facility history" if anomalous else "Month consistent with facility history",
            f"Isolation Forest score {score:.3f} (least normal historical month {floor:.3f}); largest deviation in '{names[worst]}' ({x[worst]:+.1f} sigma).",
            {"score": round(score, 4), "historicalFloor": round(floor, 4), "driver": names[worst], "zScore": round(float(x[worst]), 2), "historyMonths": len(history)},
        )
    ]


# ---------------------------------------------------------------- 7. satellite consistency


def check_satellite(record: dict, history: list[dict]) -> list[Finding]:
    ratios = [h["declaration"]["productionTonnes"] / h["satellite"]["no2AnomalyUmolM2"] for h in history]
    if not ratios:
        return []
    implied = record["satellite"]["no2AnomalyUmolM2"] * float(np.median(ratios))
    dev = _pct(record["declaration"]["productionTonnes"], implied)
    sev = "medium" if abs(dev) > TOLERANCE["satelliteProductionPct"] else "info"
    return [
        Finding(
            "satellite",
            sev,
            "Production vs satellite activity signal",
            f"Satellite-implied production {implied:,.0f} t, declared {record['declaration']['productionTonnes']:,} t ({dev:+.1f} %). Supporting signal only.",
            {"impliedT": round(implied), "declaredT": record["declaration"]["productionTonnes"], "deviationPct": round(dev, 2), "cloudFreeDays": record["satellite"]["cloudFreeDays"]},
        )
    ]


def risk_score(findings: list[Finding]) -> int:
    return min(1000, sum(SEVERITY_POINTS[f.severity] for f in findings))
