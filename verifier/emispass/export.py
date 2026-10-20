"""Export the verifier's ML models and parameters to JSON so the dashboard can re-run the exact
same checks in the browser ("try to cheat" simulator, app/verifier.js).

Trees are exported node by node; app/verifier.js walks them with float32 inputs, exactly like
scikit-learn's tree.apply. tests/test_export.py checks that the exported models reproduce the
scikit-learn predictions.
"""

from __future__ import annotations

import numpy as np
from sklearn.ensemble._iforest import _average_path_length

from . import checks, factors
from .crypto import canonical_json


def _tree_nodes(tree) -> dict:
    t = tree.tree_
    return {
        "left": t.children_left.tolist(),
        "right": t.children_right.tolist(),
        "feature": t.feature.tolist(),
        "threshold": [float(x) for x in t.threshold],
    }


def export_gbr(model) -> dict:
    return {
        "init": float(np.ravel(model.init_.constant_)[0]),
        "learningRate": float(model.learning_rate),
        "trees": [dict(_tree_nodes(est[0]), value=[float(v) for v in est[0].tree_.value[:, 0, 0]]) for est in model.estimators_],
    }


def export_iforest(model) -> dict:
    trees = []
    for est, lengths, avg in zip(model.estimators_, model._decision_path_lengths, model._average_path_length_per_tree):
        nodes = _tree_nodes(est)
        nodes["leafDepth"] = [float(a + b - 1.0) for a, b in zip(lengths, avg)]
        trees.append(nodes)
    denominator = len(model.estimators_) * float(_average_path_length([model._max_samples])[0])
    return {"trees": trees, "denominator": denominator}


def _walk(nodes: dict, x: np.ndarray) -> int:
    i = 0
    while nodes["left"][i] != -1:
        i = nodes["left"][i] if x[nodes["feature"][i]] <= nodes["threshold"][i] else nodes["right"][i]
    return i


def predict_gbr(exported: dict, x) -> float:
    x = np.asarray(x, dtype=np.float32)
    return exported["init"] + exported["learningRate"] * sum(t["value"][_walk(t, x)] for t in exported["trees"])


def score_iforest(exported: dict, x) -> float:
    x = np.asarray(x, dtype=np.float32)
    depth = sum(t["leafDepth"][_walk(t, x)] for t in exported["trees"])
    return -(2 ** (-depth / exported["denominator"]))


def simulator_bundle(dataset: dict, benchmarks: dict, intensity_model, period: int) -> dict:
    """Everything app/verifier.js needs to re-run all seven checks for each facility's `period`."""
    facilities = {}
    for fac in dataset["facilities"]:
        fid, route = fac["facilityId"], fac["route"]
        recs = [r for r in dataset["records"] if r["facilityId"] == fid]
        rec = next(r for r in recs if r["period"] == period)
        history = [r for r in recs if r["period"] < period]
        fitted = checks.fit_history_model(history, route)
        honest = rec.get("correction", rec["declaration"])
        facilities[str(fid)] = {
            "name": fac["name"],
            "route": route,
            "sector": fac["sector"],
            "routeIndex": checks.ROUTES.index(route),
            "record": {
                "period": period,
                "declaration": honest,
                # `message` is the exact byte string the feed owner signed (EIP-191), so the
                # browser can verify signatures without re-implementing Python's JSON encoder.
                "feeds": {k: dict(v, message=canonical_json(v["record"]).decode("utf-8")) for k, v in rec["feeds"].items()},
                "satellite": rec["satellite"],
            },
            "underDeclaredInDemo": "correction" in rec,
            "history": {
                "months": len(history),
                "mu": fitted["mu"].tolist(),
                "sd": fitted["sd"].tolist(),
                "floor": fitted["floor"],
                "satelliteRatioMedian": float(np.median([h["declaration"]["productionTonnes"] / h["satellite"]["no2AnomalyUmolM2"] for h in history])),
                "iforest": export_iforest(fitted["model"]),
            },
        }
    return {
        "schema": "emispass.simulator/1",
        "period": period,
        "emissionFactors": factors.EMISSION_FACTORS,
        "fuelsByRoute": factors.FUELS_BY_ROUTE,
        "labels": factors.LABELS,
        "benchmarkGroup": factors.BENCHMARK_GROUP,
        "tolerance": factors.TOLERANCE,
        "severityPoints": factors.SEVERITY_POINTS,
        "flagThreshold": factors.FLAG_THRESHOLD,
        "trustedFeeds": dataset["trustedFeeds"],
        "benchmarks": benchmarks["routes"],
        "gbr": export_gbr(intensity_model),
        "facilities": facilities,
    }
