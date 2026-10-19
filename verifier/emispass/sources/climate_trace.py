"""Climate TRACE (https://climatetrace.org, CC-BY 4.0) asset-level emission estimates.

Used as an *independent, remote-sensing based* reference: the verifier builds Turkish
sector intensity benchmarks from it. The public API is in beta, so results are cached
to data/climatetrace/ and the pipeline runs fully offline from that cache.
"""

from __future__ import annotations

import json
import statistics
from datetime import datetime, timezone
from pathlib import Path

API = "https://api.climatetrace.org/v6/assets"
SUBSECTORS = ("iron-and-steel", "cement", "aluminum")
CACHE_DIR = Path(__file__).resolve().parents[3] / "data" / "climatetrace"


def cache_path(country: str = "TUR") -> Path:
    return CACHE_DIR / f"{country.lower()}_industrial_assets.json"


def fetch(country: str = "TUR", timeout: int = 60) -> dict:
    """Download all assets of the CBAM-relevant subsectors for one country and cache them."""
    import requests

    assets = []
    for subsector in SUBSECTORS:
        offset = 0
        while True:
            r = requests.get(
                API,
                params={"countries": country, "subsectors": subsector, "limit": 500, "offset": offset},
                timeout=timeout,
            )
            r.raise_for_status()
            page = r.json().get("assets") or []
            assets.extend(_slim(a) for a in page if a.get("Sector") == subsector)
            if len(page) < 500:
                break
            offset += 500

    payload = {
        "source": "Climate TRACE API v6 (CC-BY 4.0)",
        "url": API,
        "country": country,
        "retrievedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "assets": assets,
    }
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_path(country).write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    return payload


def _slim(asset: dict) -> dict:
    summary = next((s for s in asset.get("EmissionsSummary") or [] if s.get("Gas") == "co2e_100yr"), {})
    return {
        "id": asset.get("Id"),
        "name": asset.get("Name"),
        "sector": asset.get("Sector"),
        "assetType": asset.get("AssetType"),
        "owners": [o.get("CompanyName") for o in asset.get("Owners") or []],
        "emissionsT": summary.get("EmissionsQuantity"),
        "activity": summary.get("Activity"),
        "activityUnits": summary.get("ActivityUnits"),
        "emissionsFactor": summary.get("EmissionsFactor"),
        "emissionsFactorUnits": summary.get("EmissionsFactorUnits"),
        "capacity": summary.get("Capacity"),
        "capacityUnits": summary.get("CapacityUnits"),
    }


def load(country: str = "TUR") -> dict:
    path = cache_path(country)
    if not path.exists():
        raise FileNotFoundError(f"{path} missing - run `python -m emispass fetch-climatetrace` first")
    return json.loads(path.read_text(encoding="utf-8"))


def _route_of(asset: dict) -> str:
    t = (asset.get("assetType") or "").upper()
    if asset["sector"] == "iron-and-steel":
        if "EAF" in t:
            return "EAF"
        if "BF" in t or "BOF" in t:
            return "BF-BOF"
        return t or "unknown"
    return asset["sector"]


def benchmarks(country: str = "TUR") -> dict:
    """Per production route: median / p10 / p90 of tCO2e per tonne of product, plus totals."""
    data = load(country)
    groups: dict[str, list[dict]] = {}
    for a in data["assets"]:
        ef, act = a.get("emissionsFactor"), a.get("activity")
        if not ef or not act or ef <= 0:
            continue
        groups.setdefault(_route_of(a), []).append(a)

    out = {}
    for route, items in groups.items():
        efs = sorted(i["emissionsFactor"] for i in items)
        q = statistics.quantiles(efs, n=10) if len(efs) >= 2 else [efs[0]] * 9
        out[route] = {
            "assets": len(items),
            "medianT": statistics.median(efs),
            "p10T": q[0],
            "p90T": q[-1],
            "totalEmissionsMt": sum(i["emissionsT"] or 0 for i in items) / 1e6,
            "totalActivityMt": sum(i["activity"] or 0 for i in items) / 1e6,
            "unit": items[0].get("emissionsFactorUnits"),
        }
    return {"source": data["source"], "retrievedAt": data["retrievedAt"], "country": country, "routes": out}
