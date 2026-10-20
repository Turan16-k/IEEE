"""Real Sentinel-5P TROPOMI tropospheric NO2 over an industrial area (no account needed).

Source: MEEO "Sentinel-5P Level-2 COGs" on the AWS Open Data registry (s3://meeo-s5p), one
cloud-optimised GeoTIFF per orbit, EPSG:4326. Only the tiles covering the area of interest are
fetched with HTTP range requests, so a monthly series costs a few MB instead of GBs. GDAL is not
needed (it fails on non-ASCII install paths on Windows); tifffile decodes the tiles.

Method: for sampled days, take the orbit passing over Türkiye around 10-12 UTC, keep pixels with
qa_value >= 0.75, and compute the mean NO2 over the industrial box minus the mean over a nearby
rural background box ("enhancement"). Monthly enhancement is a proxy for combustion activity.
"""

from __future__ import annotations

import io
import json
import re
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import requests

BUCKET = "https://meeo-s5p.s3.amazonaws.com"
PREFIX = "COGT/OFFL/L2__NO2___"
CACHE = Path(__file__).resolve().parents[3] / "data" / "sentinel5p"
QA_MIN = 0.75  # recommended threshold for tropospheric NO2 (TROPOMI PUM)

# Industrial area of interest and a rural background box (lon_min, lat_min, lon_max, lat_max)
AREAS = {
    "iskenderun-bay": {
        "label": "İskenderun Bay industrial zone (Hatay) - integrated & EAF steel cluster",
        "aoi": (36.05, 36.55, 36.30, 36.95),
        "background": (36.60, 37.30, 37.10, 37.70),
    },
}


class _RangeFile(io.RawIOBase):
    """Seekable read-only file over HTTP range requests with a small block cache."""

    BLOCK = 1 << 16

    def __init__(self, url: str, session: requests.Session):
        self.url, self.s, self.pos, self.cache = url, session, 0, {}
        r = self.s.head(url, timeout=60)
        r.raise_for_status()
        self.size = int(r.headers["Content-Length"])

    def readable(self):
        return True

    def seekable(self):
        return True

    def tell(self):
        return self.pos

    def seek(self, offset, whence=0):
        self.pos = offset if whence == 0 else self.pos + offset if whence == 1 else self.size + offset
        return self.pos

    def _block(self, i):
        if i not in self.cache:
            start = i * self.BLOCK
            end = min(start + self.BLOCK, self.size) - 1
            r = self.s.get(self.url, headers={"Range": f"bytes={start}-{end}"}, timeout=60)
            r.raise_for_status()
            self.cache[i] = r.content
        return self.cache[i]

    def read(self, n=-1):
        if n is None or n < 0:
            n = self.size - self.pos
        n = max(0, min(n, self.size - self.pos))
        out, p = bytearray(), self.pos
        while len(out) < n:
            b = self._block(p // self.BLOCK)
            off = p % self.BLOCK
            take = b[off : off + (n - len(out))]
            out += take
            p += len(take)
        self.pos = p
        return bytes(out)

    def readinto(self, buf):
        data = self.read(len(buf))
        buf[: len(data)] = data
        return len(data)


def _read_window(url: str, bbox: tuple, session: requests.Session) -> np.ndarray | None:
    import tifffile

    with tifffile.TiffFile(_RangeFile(url, session)) as tf:
        page = tf.pages[0]
        scale = page.tags["ModelPixelScaleTag"].value
        tie = page.tags["ModelTiepointTag"].value
        x0, y0, dx, dy = tie[3], tie[4], scale[0], scale[1]
        lon0, lat0, lon1, lat1 = bbox
        c0, c1 = int((lon0 - x0) / dx), int(np.ceil((lon1 - x0) / dx))
        r0, r1 = int((y0 - lat1) / dy), int(np.ceil((y0 - lat0) / dy))
        if c1 <= 0 or r1 <= 0 or c0 >= page.imagewidth or r0 >= page.imagelength:
            return None
        c0, r0 = max(c0, 0), max(r0, 0)
        c1, r1 = min(c1, page.imagewidth), min(r1, page.imagelength)
        tw, tl = page.tilewidth, page.tilelength
        tiles_across = -(-page.imagewidth // tw)
        out = np.full((r1 - r0, c1 - c0), np.nan, dtype="float64")
        fh = tf.filehandle
        nodata = page.tags["GDAL_NODATA"].value if "GDAL_NODATA" in page.tags else None
        for tr in range(r0 // tl, (r1 - 1) // tl + 1):
            for tc in range(c0 // tw, (c1 - 1) // tw + 1):
                idx = tr * tiles_across + tc
                off, cnt = page.dataoffsets[idx], page.databytecounts[idx]
                if cnt == 0:
                    continue
                fh.seek(off)
                tile = page.decode(fh.read(cnt), idx)[0]
                tile = np.asarray(tile).reshape(tl, tw).astype("float64")
                if nodata is not None:
                    tile[tile == float(nodata)] = np.nan
                ys, xs = tr * tl, tc * tw
                a0, a1 = max(r0, ys), min(r1, ys + tl)
                b0, b1 = max(c0, xs), min(c1, xs + tw)
                out[a0 - r0 : a1 - r0, b0 - c0 : b1 - c0] = tile[a0 - ys : a1 - ys, b0 - xs : b1 - xs]
        return out


def _orbits_for_day(day: date, session: requests.Session) -> list[str]:
    prefix = f"{PREFIX}/{day:%Y/%m/%d}/"
    r = session.get(BUCKET + "/", params={"list-type": "2", "prefix": prefix, "max-keys": "1000"}, timeout=60)
    r.raise_for_status()
    keys = re.findall(r"<Key>([^<]+_PRODUCT_nitrogendioxide_tropospheric_column_4326\.tif)</Key>", r.text)
    picked = []
    for k in keys:
        m = re.search(r"NO2____(\d{8}T\d{6})_(\d{8}T\d{6})", k)
        start = datetime.strptime(m.group(1), "%Y%m%dT%H%M%S")
        end = datetime.strptime(m.group(2), "%Y%m%dT%H%M%S")
        overpass = datetime(day.year, day.month, day.day, 10, 45)
        if start <= overpass + timedelta(minutes=50) and end >= overpass - timedelta(minutes=50):
            picked.append(k)
    return picked


def daily_enhancement(day: date, area: str, session: requests.Session) -> dict | None:
    cfg = AREAS[area]
    for key in _orbits_for_day(day, session):
        no2_url = f"{BUCKET}/{key}"
        qa_url = no2_url.replace("nitrogendioxide_tropospheric_column", "qa_value")
        vals = {}
        for name, box in (("aoi", cfg["aoi"]), ("bg", cfg["background"])):
            no2 = _read_window(no2_url, box, session)
            qa = _read_window(qa_url, box, session)
            if no2 is None or qa is None or not np.isfinite(qa).any():
                vals = {}
                break
            qa = qa / 100.0 if np.nanmax(qa) > 1.5 else qa
            good = (qa >= QA_MIN) & np.isfinite(no2)
            if good.sum() < 0.3 * good.size:
                vals = {}
                break
            vals[name] = float(np.nanmean(no2[good]))
        if vals:
            return {"date": day.isoformat(), "aoi": vals["aoi"], "background": vals["bg"], "enhancement": vals["aoi"] - vals["bg"], "orbitKey": key.split("/")[-1][:70]}
    return None


def monthly_series(area: str, first: date, last: date, step_days: int = 3, log=print) -> dict:
    """Monthly mean NO2 enhancement (mol/m2) with the daily samples, cached to data/sentinel5p/."""
    session = requests.Session()
    days, d = [], first
    while d <= last:
        days.append(d)
        d += timedelta(days=step_days)
    samples = []
    for i, day in enumerate(days):
        try:
            s = daily_enhancement(day, area, session)
        except Exception as e:  # network hiccups or missing orbit: skip the day
            log(f"  {day}: skipped ({type(e).__name__})")
            continue
        if s:
            samples.append(s)
        if i % 10 == 0:
            log(f"  {day}: {len(samples)} valid samples so far")
    months = {}
    for s in samples:
        months.setdefault(s["date"][:7].replace("-", ""), []).append(s["enhancement"])
    result = {
        "source": "Copernicus Sentinel-5P TROPOMI L2 NO2 (OFFL), MEEO COGs on AWS Open Data (s3://meeo-s5p)",
        "license": "Copernicus Sentinel data, free and open",
        "area": area,
        "label": AREAS[area]["label"],
        "aoi": AREAS[area]["aoi"],
        "background": AREAS[area]["background"],
        "qaMin": QA_MIN,
        "unit": "mol/m2 (tropospheric NO2 column, AOI mean minus background mean)",
        "retrievedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "months": {m: {"meanEnhancement": float(np.mean(v)), "samples": len(v)} for m, v in sorted(months.items())},
        "daily": samples,
    }
    CACHE.mkdir(parents=True, exist_ok=True)
    (CACHE / f"{area}.json").write_text(json.dumps(result, indent=1, ensure_ascii=False), encoding="utf-8")
    return result


def load(area: str = "iskenderun-bay") -> dict:
    return json.loads((CACHE / f"{area}.json").read_text(encoding="utf-8"))
