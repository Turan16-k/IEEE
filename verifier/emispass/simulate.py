"""Demo dataset: three FICTIONAL Turkish installations, 15 months of operations.

Everything produced here is synthetic and labelled as such. The structure mirrors what a real
deployment would receive: an operator declaration (from the plant's MRV system), signed feeds
from parties the operator does not control (grid meter operator, fuel supplier), a satellite
activity index (stand-in for a Sentinel-5P NO2 retrieval around the plant) and a grid
generation mix (stand-in for an EPİAŞ export).

Scenario: in 2026-09 facility 3 (BF-BOF) under-declares coking coal by 30 %, which lowers its
reported direct emissions by ~22 %. Its correction for the same month is also generated.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np

from .crypto import demo_key, sign_record
from .factors import EMISSION_FACTORS, FUELS_BY_ROUTE
from .sources.grid import SAMPLE as GRID_SAMPLE, grid_ef_from_mix

ROOT = Path(__file__).resolve().parents[2]
DEMO_DIR = ROOT / "data" / "demo"

PERIODS = [202507 + i if 202507 + i <= 202512 else 202601 + (i - 6) for i in range(15)]  # 2025-07 .. 2026-09
ANCHORED_PERIODS = [202607, 202608, 202609]
FRAUD = {"facilityId": 3, "period": 202609, "field": "cokingCoalT", "factor": 0.70}

FACILITIES = [
    {
        "facilityId": 1,
        "name": "Ege Green Steel - EAF rebar mill (fictional)",
        "installationId": "TR-ETS-DEMO-0001",
        "country": "TR",
        "sector": "IronSteel",
        "sectorCode": 0,
        "route": "EAF",
        "cnCode": "7214 20 00",
        "product": "Concrete reinforcing bars",
        "monthlyProductionT": 42_000,
        "intensity": {"naturalGasNm3": 28.0, "electrodesT": 0.0018, "chargeCarbonT": 0.012, "limestoneT": 0.030},
        "electricityMWhPerT": 0.42,
        "satelliteK": 0.0021,
    },
    {
        "facilityId": 2,
        "name": "Marmara Cement - integrated dry kiln (fictional)",
        "installationId": "TR-ETS-DEMO-0002",
        "country": "TR",
        "sector": "Cement",
        "sectorCode": 1,
        "route": "dry-kiln",
        "cnCode": "2523 29 00",
        "product": "Portland cement",
        "monthlyProductionT": 125_000,
        "intensity": {"petcokeT": 0.76 * 0.105, "naturalGasNm3": 2.0, "clinkerT": 0.76},
        "electricityMWhPerT": 0.095,
        "satelliteK": 0.0011,
    },
    {
        "facilityId": 3,
        "name": "Anatolia Iron & Steel - BF-BOF flat products (fictional)",
        "installationId": "TR-ETS-DEMO-0003",
        "country": "TR",
        "sector": "IronSteel",
        "sectorCode": 0,
        "route": "BF-BOF",
        "cnCode": "7208 51 20",
        "product": "Hot-rolled flat products",
        "monthlyProductionT": 210_000,
        "intensity": {"cokingCoalT": 0.55, "pciCoalT": 0.13, "limestoneT": 0.15, "naturalGasNm3": 30.0},
        "electricityMWhPerT": 0.11,
        "satelliteK": 0.0019,
    },
]


def _grid_mix(rng: np.random.Generator) -> dict:
    """Illustrative monthly Turkish generation mix (GWh-scale shares, seasonal hydro/solar)."""
    months = {}
    for p in PERIODS:
        m = p % 100
        season = math.cos((m - 4) / 12 * 2 * math.pi)  # wet spring
        summer = math.cos((m - 7) / 12 * 2 * math.pi)
        mix = {
            "lignite": 4200 + 300 * rng.standard_normal(),
            "importedCoal": 6200 - 600 * season + 300 * rng.standard_normal(),
            "naturalGas": 5600 + 900 * summer - 500 * season + 300 * rng.standard_normal(),
            "hydro": 5200 + 2200 * season + 300 * rng.standard_normal(),
            "wind": 3300 + 400 * rng.standard_normal(),
            "solar": 2400 + 1100 * summer + 150 * rng.standard_normal(),
            "geothermal": 900 + 40 * rng.standard_normal(),
            "biomass": 600,
            "other": 300,
        }
        months[str(p)] = {k: round(max(v, 0) * 1000, 0) for k, v in mix.items()}  # MWh
    return {
        "label": "ILLUSTRATIVE sample shaped like an EPİAŞ real-time generation export (not real data)",
        "unit": "MWh",
        "months": months,
    }


def _emissions(activity: dict, route: str) -> float:
    return sum(activity.get(f, 0.0) * EMISSION_FACTORS[f] for f in FUELS_BY_ROUTE[route])


def generate(seed: int = 2026) -> dict:
    rng = np.random.default_rng(seed)
    grid_mix = _grid_mix(rng)
    GRID_SAMPLE.parent.mkdir(parents=True, exist_ok=True)
    GRID_SAMPLE.write_text(json.dumps(grid_mix, indent=1, ensure_ascii=False), encoding="utf-8")
    grid_ef = {int(p): grid_ef_from_mix(mix) for p, mix in grid_mix["months"].items()}

    meter_key, fuel_key = demo_key("feed:grid-meter"), demo_key("feed:fuel-supplier")
    records = []
    for fac in FACILITIES:
        for p in PERIODS:
            m = p % 100
            seasonal = 1 + 0.06 * math.sin((m - 1) / 12 * 2 * math.pi)
            production = round(fac["monthlyProductionT"] * seasonal * (1 + 0.04 * rng.standard_normal()))
            true_activity = {
                f: production * per_t * (1 + 0.025 * rng.standard_normal()) for f, per_t in fac["intensity"].items()
            }
            electricity = production * fac["electricityMWhPerT"] * (1 + 0.02 * rng.standard_normal())

            declared_activity = dict(true_activity)
            scenario = "honest"
            if fac["facilityId"] == FRAUD["facilityId"] and p == FRAUD["period"]:
                declared_activity[FRAUD["field"]] = true_activity[FRAUD["field"]] * FRAUD["factor"]
                scenario = "under-declared"

            def declaration(activity: dict, kind: str) -> dict:
                direct = _emissions(activity, fac["route"])
                indirect = electricity * grid_ef[p]
                return {
                    "kind": kind,
                    "facilityId": fac["facilityId"],
                    "installationId": fac["installationId"],
                    "period": p,
                    "productionTonnes": production,
                    "activity": {k: round(v, 3) for k, v in activity.items()},
                    "electricityMWh": round(electricity, 3),
                    "gridEmissionFactor": round(grid_ef[p], 4),
                    "directEmissionsKg": round(direct * 1000),
                    "indirectEmissionsKg": round(indirect * 1000),
                    "methodology": "Calculation-based (CBAM Implementing Reg. 2023/1773 Annex III), IPCC 2006 factors",
                }

            # stock changes make deliveries differ slightly from consumption
            deliveries = {f: v * (1 + 0.015 * rng.standard_normal()) for f, v in true_activity.items() if f.endswith(("CoalT", "petcokeT", "Nm3"))}
            deliveries = {f: round(v, 3) for f, v in deliveries.items()}
            meter = sign_record(
                meter_key,
                {"feed": "grid-meter", "installationId": fac["installationId"], "period": p, "electricityMWh": round(electricity * (1 + 0.004 * rng.standard_normal()), 3)},
            )
            fuel = sign_record(
                fuel_key,
                {"feed": "fuel-supplier", "installationId": fac["installationId"], "period": p, "deliveries": deliveries},
            )
            satellite = {
                "source": "SYNTHETIC stand-in for Sentinel-5P TROPOMI tropospheric NO2 (plant buffer, monthly mean anomaly)",
                "period": p,
                "no2AnomalyUmolM2": round(fac["satelliteK"] * production * (1 + 0.05 * rng.standard_normal()), 2),
                "cloudFreeDays": int(rng.integers(12, 28)),
            }
            rec = {
                "facilityId": fac["facilityId"],
                "period": p,
                "scenario": scenario,
                "anchored": p in ANCHORED_PERIODS,
                "declaration": declaration(declared_activity, "original"),
                "feeds": {"gridMeter": meter, "fuelSupplier": fuel},
                "satellite": satellite,
            }
            if scenario == "under-declared":
                rec["correction"] = declaration(true_activity, "correction")
            records.append(rec)

    dataset = {
        "label": "SYNTHETIC demo dataset - fictional facilities, generated by emispass.simulate",
        "seed": seed,
        "facilities": FACILITIES,
        "trustedFeeds": {"gridMeter": meter_key.address, "fuelSupplier": fuel_key.address},
        "records": records,
    }
    DEMO_DIR.mkdir(parents=True, exist_ok=True)
    (DEMO_DIR / "dataset.json").write_text(json.dumps(dataset, indent=1, ensure_ascii=False), encoding="utf-8")
    return dataset


def load() -> dict:
    return json.loads((DEMO_DIR / "dataset.json").read_text(encoding="utf-8"))
