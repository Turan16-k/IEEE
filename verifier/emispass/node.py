"""A verifier node: runs all checks on a claim package, writes a deterministic report and signs
an EIP-712 `Verification` over the exact claim digest.

Nodes are operated independently (e.g. two accredited verification bodies and a public-interest
auditor). Because the pipeline is deterministic, honest nodes produce byte-identical reports,
so agreement is checked by comparing report hashes before signatures are aggregated.
"""

from __future__ import annotations

from pathlib import Path

from . import __version__, checks
from .crypto import VERIFICATION_FIELDS, Key, canonical_json, keccak_hex, sign_typed
from .factors import CBAM_INDIRECT_IN_SCOPE, CBAM_PRICE_EUR, DEFAULT_MARKUP_2026, FLAG_THRESHOLD, ILLUSTRATIVE_DEFAULT_BASIS, BENCHMARK_GROUP

PKG = Path(__file__).resolve().parent


def model_hash(benchmarks: dict) -> str:
    """Binds a verdict to the exact code, factors, ML hyper-parameters and benchmark data used."""
    parts = [(PKG / name).read_bytes() for name in ("checks.py", "factors.py", "node.py")]
    parts.append(canonical_json({"version": __version__, "mlSeed": checks.ML_SEED, "benchmarks": benchmarks["routes"]}))
    return keccak_hex(b"".join(parts))


def cbam_view(record: dict, facility: dict, benchmarks: dict) -> dict:
    d = record["declaration"]
    prod = d["productionTonnes"]
    direct_t = d["directEmissionsKg"] / prod / 1000
    indirect_t = d["indirectEmissionsKg"] / prod / 1000
    in_scope = direct_t + (indirect_t if CBAM_INDIRECT_IN_SCOPE[facility["sector"]] else 0.0)
    group = benchmarks["routes"][BENCHMARK_GROUP[facility["route"]]]
    default_t = group[ILLUSTRATIVE_DEFAULT_BASIS] * DEFAULT_MARKUP_2026
    return {
        "seeDirectT": round(direct_t, 4),
        "seeIndirectT": round(indirect_t, 4),
        "seeInScopeT": round(in_scope, 4),
        "indirectInScope": CBAM_INDIRECT_IN_SCOPE[facility["sector"]],
        "illustrativeDefaultT": round(default_t, 4),
        "certificatePriceEur": CBAM_PRICE_EUR,
        "grossExposureActualEurPerT": round(in_scope * CBAM_PRICE_EUR, 2),
        "grossExposureDefaultEurPerT": round(default_t * CBAM_PRICE_EUR, 2),
        "note": "Gross exposure before the free-allocation adjustment (CBAM factor). Default value is ILLUSTRATIVE "
        "(Turkish route p90 from Climate TRACE x 1.10 mark-up), not the official EU default.",
    }


def verify(record: dict, facility: dict, history: list[dict], ctx: dict) -> dict:
    """Pure function: same inputs -> byte-identical report on every node."""
    route = facility["route"]
    findings: list[checks.Finding] = []
    findings += checks.check_provenance(record, ctx["trustedFeeds"])
    findings += checks.check_reconciliation(record)
    recalc, independent = checks.check_recalculation(record, route)
    findings += recalc
    findings += checks.check_benchmark(record, route, ctx["benchmarks"])
    findings += checks.check_expected_intensity(record, route, ctx["intensityModel"])
    findings += checks.check_isolation_forest(record, history, route)
    findings += checks.check_satellite(record, history)

    score = checks.risk_score(findings)
    critical = any(f.severity == "critical" for f in findings)
    verdict = "FLAGGED" if critical or score >= FLAG_THRESHOLD else "APPROVED"
    d = record["declaration"]
    return {
        "schema": "emispass.verification-report/1",
        "facility": {k: facility[k] for k in ("facilityId", "name", "installationId", "sector", "route", "cnCode", "product")},
        "period": record["period"],
        "declarationKind": d["kind"],
        "claimDigest": ctx["claimDigest"],
        "evidenceHash": ctx["evidenceHash"],
        "model": {
            "version": __version__,
            "modelHash": ctx["modelHash"],
            "components": [
                "signed-feed provenance (EIP-191)",
                "activity reconciliation vs supplier deliveries & grid meter",
                "independent recalculation (IPCC 2006 factors)",
                "Turkish peer benchmark (Climate TRACE, real data)",
                "GradientBoostingRegressor expected intensity",
                "IsolationForest monthly anomaly",
                "satellite activity consistency",
            ],
        },
        "declared": {
            "productionTonnes": d["productionTonnes"],
            "directEmissionsKg": d["directEmissionsKg"],
            "indirectEmissionsKg": d["indirectEmissionsKg"],
        },
        "independentDirectEmissionsKg": round(independent),
        "cbam": cbam_view(record, facility, ctx["benchmarks"]),
        "findings": [f.as_dict() for f in findings],
        "riskScore": score,
        "verdict": verdict,
    }


def sign_verification(key: Key, dom: dict, claim_digest: str, report: dict) -> tuple[dict, str]:
    report_bytes = canonical_json(report)
    verification = {
        "claimDigest": claim_digest,
        "verdict": 0 if report["verdict"] == "APPROVED" else 1,
        "riskScore": report["riskScore"],
        "modelHash": report["model"]["modelHash"],
        "reportHash": keccak_hex(report_bytes),
    }
    _, sig = sign_typed(key, "Verification", VERIFICATION_FIELDS, dom, verification)
    return verification, sig
