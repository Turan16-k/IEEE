"""CLI: python -m emispass <command>"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import pipeline, simulate
from .sources import climate_trace


def main(argv: list[str] | None = None) -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(prog="emispass", description="EmisPass AI verifier")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("fetch-climatetrace", help="download Turkish CBAM-sector assets from Climate TRACE")
    sub.add_parser("benchmarks", help="print Turkish route benchmarks from the cached Climate TRACE data")
    sub.add_parser("simulate", help="regenerate the synthetic demo dataset")
    run = sub.add_parser("run", help="sign claims, run the 3 verifier nodes, write out/")
    run.add_argument("--deployment", default=str(pipeline.ROOT / "deployments" / "localhost.json"))
    args = parser.parse_args(argv)

    if args.cmd == "fetch-climatetrace":
        data = climate_trace.fetch()
        print(f"cached {len(data['assets'])} assets -> {climate_trace.cache_path()}")
    elif args.cmd == "benchmarks":
        print(json.dumps(climate_trace.benchmarks(), indent=1, ensure_ascii=False))
    elif args.cmd == "simulate":
        ds = simulate.generate()
        print(f"generated {len(ds['records'])} facility-months -> {simulate.DEMO_DIR / 'dataset.json'}")
    elif args.cmd == "run":
        manifest = pipeline.run(Path(args.deployment))
        for s in manifest["submissions"]:
            print(f"{s['tag']:<34} {s['verdict']:<9} risk={s['riskScore']}")
        print(f"{len(manifest['disclosures'])} shipment disclosures, {len(manifest['attacks'])} attack fixtures -> out/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
