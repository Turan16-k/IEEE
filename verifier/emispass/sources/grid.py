"""Turkish grid emission factor from an EPİAŞ generation mix.

EPİAŞ Şeffaflık Platformu (https://seffaflik.epias.com.tr) publishes real-time generation by
source. Since Aug 2024 its API needs a free account (TGT ticket), so the pipeline accepts either
a JSON mix exported from the platform or the bundled sample in data/grid/.
"""

from __future__ import annotations

import json
from pathlib import Path

from ..factors import GRID_SOURCE_EF

SAMPLE = Path(__file__).resolve().parents[3] / "data" / "grid" / "tr_generation_mix_sample.json"


def grid_ef_from_mix(mix_mwh: dict[str, float]) -> float:
    """Generation-weighted grid intensity in tCO2/MWh."""
    total = sum(mix_mwh.values())
    if total <= 0:
        raise ValueError("empty generation mix")
    return sum(GRID_SOURCE_EF.get(src, GRID_SOURCE_EF["other"]) * mwh for src, mwh in mix_mwh.items()) / total


def load_monthly_mix(path: Path = SAMPLE) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def monthly_grid_ef(path: Path = SAMPLE) -> dict[str, float]:
    """{'YYYYMM': tCO2/MWh} from a monthly mix file."""
    data = load_monthly_mix(path)
    return {period: round(grid_ef_from_mix(mix), 4) for period, mix in data["months"].items()}
