import numpy as np

from emispass import checks, export, simulate
from emispass.sources import climate_trace


def _world():
    ds = simulate.generate()
    facilities = {f["facilityId"]: f for f in ds["facilities"]}
    training = [r for r in ds["records"] if r["period"] < min(simulate.ANCHORED_PERIODS)]
    return ds, facilities, training


def test_exported_gbr_matches_sklearn():
    ds, facilities, training = _world()
    model = checks.train_expected_intensity_model(training, facilities)
    exported = export.export_gbr(model)
    for rec in ds["records"]:
        route = facilities[rec["facilityId"]]["route"]
        x = checks._independent_features(rec, checks.ROUTES.index(route))
        assert abs(export.predict_gbr(exported, x) - model.predict(np.array([x]))[0]) < 1e-9


def test_exported_iforest_matches_sklearn():
    ds, facilities, _ = _world()
    for fid, fac in facilities.items():
        recs = [r for r in ds["records"] if r["facilityId"] == fid]
        history = [r for r in recs if r["period"] < 202609]
        fitted = checks.fit_history_model(history, fac["route"])
        exported = export.export_iforest(fitted["model"])
        for rec in recs:
            x = (np.array(checks._history_features(rec, fac["route"])) - fitted["mu"]) / fitted["sd"]
            assert abs(export.score_iforest(exported, x) - fitted["model"].score_samples([x])[0]) < 1e-9


def test_simulator_bundle_contains_every_facility():
    ds, facilities, training = _world()
    model = checks.train_expected_intensity_model(training, facilities)
    bundle = export.simulator_bundle(ds, climate_trace.benchmarks(), model, 202609)
    assert set(bundle["facilities"]) == {str(f) for f in facilities}
    assert bundle["facilities"]["3"]["underDeclaredInDemo"] is True
