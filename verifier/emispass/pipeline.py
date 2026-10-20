"""End-to-end off-chain pipeline: operator builds and signs claims, three verifier nodes check and
co-sign them, and everything needed for on-chain anchoring and importer disclosure is written to
out/.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import numpy as np

from . import explain, export, node, simulate
from .checks import train_expected_intensity_model
from .crypto import (
    CLAIM_FIELDS,
    VERIFICATION_FIELDS,
    canonical_json,
    demo_key,
    domain,
    keccak_hex,
    shipment_commitment,
    shipment_leaf,
    sign_typed,
)
from .merkle import MerkleTree, verify as merkle_verify
from .sources import climate_trace

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "out"
VERIFIERS = ["verifier:1", "verifier:2", "verifier:3"]


def _write(path: Path, data: bytes | dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(data, dict):
        data = json.dumps(data, indent=1, ensure_ascii=False).encode("utf-8")
    path.write_bytes(data)


def _shipments(facility: dict, decl: dict, tag: str) -> list[dict]:
    rng = np.random.default_rng(abs(hash_int(tag)) % (2**32))
    n = 4 if facility["facilityId"] == 3 else 3
    export_share = 0.45
    weights = rng.dirichlet(np.ones(n))
    importers = [demo_key("importer:A").address, demo_key("importer:B").address]
    prod = decl["productionTonnes"]
    out = []
    for i in range(n):
        out.append(
            {
                "shipmentId": f"{facility['installationId']}-{decl['period']}-{decl['kind'][0].upper()}{i + 1:02d}",
                "importer": importers[i % 2],
                "importerName": ["EU Importer A (demo, Rotterdam)", "EU Importer B (demo, Hamburg)"][i % 2],
                "cnCode": facility["cnCode"],
                "product": facility["product"],
                "quantityKg": int(prod * export_share * weights[i] * 1000),
                "directKgPerT": round(decl["directEmissionsKg"] / prod),
                "indirectKgPerT": round(decl["indirectEmissionsKg"] / prod),
                "period": decl["period"],
                "salt": keccak_hex(f"salt|{tag}|{i}".encode()),
            }
        )
    return out


def hash_int(s: str) -> int:
    return int(keccak_hex(s.encode())[2:18], 16)


def run(deployment_path: Path, use_llm: bool = True) -> dict:
    dep = json.loads(Path(deployment_path).read_text(encoding="utf-8"))
    dom = domain(dep["chainId"], dep["contracts"]["EmissionPassport"])

    dataset = simulate.load() if (simulate.DEMO_DIR / "dataset.json").exists() else simulate.generate()
    facilities = {f["facilityId"]: f for f in dataset["facilities"]}
    for f in facilities.values():
        onchain = dep["facilities"].get(str(f["facilityId"]))
        if not onchain or onchain["operator"].lower() != demo_key(f"operator:{f['facilityId']}").address.lower():
            raise SystemExit(f"Deployment does not match demo facility {f['facilityId']} - redeploy first")

    benchmarks = climate_trace.benchmarks()
    mhash = node.model_hash(benchmarks)
    records = dataset["records"]
    first_anchored = min(simulate.ANCHORED_PERIODS)
    training = [r for r in records if r["period"] < first_anchored]
    ctx_base = {
        "trustedFeeds": dataset["trustedFeeds"],
        "benchmarks": benchmarks,
        "intensityModel": train_expected_intensity_model(training, facilities),
        "modelHash": mhash,
    }

    jobs = []
    for period in simulate.ANCHORED_PERIODS:
        for fid in sorted(facilities):
            rec = next(r for r in records if r["facilityId"] == fid and r["period"] == period)
            jobs.append((rec, rec["declaration"]))
    for rec in records:
        if "correction" in rec:
            jobs.append((rec, rec["correction"]))

    if OUT.exists():
        shutil.rmtree(OUT)
    nonces = {fid: 0 for fid in facilities}
    manifest = {"chainId": dep["chainId"], "contract": dep["contracts"]["EmissionPassport"], "modelHash": mhash, "submissions": [], "disclosures": [], "attacks": []}

    for seq, (rec, decl) in enumerate(jobs, start=1):
        fac = facilities[rec["facilityId"]]
        tag = f"{seq:02d}-{decl['period']}-F{fac['facilityId']}-{decl['kind']}"
        view = dict(rec, declaration=decl)

        shipments = _shipments(fac, decl, tag)
        for s in shipments:
            s["commitment"] = shipment_commitment(s)
            s["leaf"] = shipment_leaf(s["importer"], s["commitment"])
        tree = MerkleTree([s["leaf"] for s in shipments])

        evidence = {"declaration": decl, "feeds": rec["feeds"], "satellite": rec["satellite"], "label": dataset["label"]}
        evidence_bytes = canonical_json(evidence)
        evidence_uri = f"out/evidence/{tag}.json"
        _write(ROOT / evidence_uri, evidence_bytes)

        claim = {
            "facilityId": fac["facilityId"],
            "period": decl["period"],
            "productionTonnes": decl["productionTonnes"],
            "directEmissionsKg": decl["directEmissionsKg"],
            "indirectEmissionsKg": decl["indirectEmissionsKg"],
            "shipmentsRoot": tree.root,
            "evidenceHash": keccak_hex(evidence_bytes),
            "nonce": nonces[fac["facilityId"]],
        }
        claim_digest, operator_sig = sign_typed(demo_key(f"operator:{fac['facilityId']}"), "EmissionClaim", CLAIM_FIELDS, dom, claim)
        nonces[fac["facilityId"]] += 1

        history = [r for r in records if r["facilityId"] == fac["facilityId"] and r["period"] < decl["period"]]
        ctx = dict(ctx_base, claimDigest=claim_digest, evidenceHash=claim["evidenceHash"])

        reports, signatures, verification = [], [], None
        for v in VERIFIERS:  # each node runs the full pipeline independently
            report = node.verify(view, fac, history, ctx)
            ver, sig = node.sign_verification(demo_key(v), dom, claim_digest, report)
            reports.append(canonical_json(report))
            signatures.append(sig)
            verification = ver
        if len(set(reports)) != 1:
            raise RuntimeError(f"verifier nodes disagree on {tag}")
        report_uri = f"out/reports/{tag}.json"
        _write(ROOT / report_uri, reports[0])
        report = json.loads(reports[0])

        submission = {
            "tag": tag,
            "facilityId": fac["facilityId"],
            "facilityName": fac["name"],
            "period": decl["period"],
            "kind": decl["kind"],
            "claim": claim,
            "claimDigest": claim_digest,
            "operatorSignature": operator_sig,
            "verification": verification,
            "verifierSignatures": signatures,
            "verdict": report["verdict"],
            "riskScore": report["riskScore"],
            "reportUri": report_uri,
            "evidenceUri": evidence_uri,
        }
        _write(OUT / "submissions" / f"{tag}.json", submission)
        manifest["submissions"].append({k: submission[k] for k in ("tag", "facilityId", "period", "kind", "verdict", "riskScore", "reportUri", "evidenceUri")})

        for i, s in enumerate(shipments):
            proof = tree.proof(i)
            assert merkle_verify(proof, tree.root, s["leaf"])
            disclosure = {
                "schema": "emispass.shipment-disclosure/1",
                "submissionTag": tag,
                "facilityId": fac["facilityId"],
                "facilityName": fac["name"],
                "installationId": fac["installationId"],
                "shipment": {k: s[k] for k in ("shipmentId", "importer", "importerName", "cnCode", "product", "quantityKg", "directKgPerT", "indirectKgPerT", "period", "salt")},
                "commitment": s["commitment"],
                "proof": proof,
                "shipmentsRoot": tree.root,
                "reportUri": report_uri,
            }
            uri = f"out/disclosures/{s['shipmentId']}.json"
            _write(ROOT / uri, disclosure)
            manifest["disclosures"].append({"uri": uri, "submissionTag": tag, "shipmentId": s["shipmentId"], "importer": s["importer"], "verdict": report["verdict"]})

        if decl["kind"] == "original" and report["verdict"] == "FLAGGED":
            manifest["attacks"].append(_compromised_approval(tag, claim, claim_digest, operator_sig, dom, mhash))

    for s in manifest["submissions"]:
        report = json.loads((ROOT / s["reportUri"]).read_text(encoding="utf-8"))
        summary = explain.summarize(report, use_llm=use_llm)
        _write(OUT / "explanations" / f"{s['tag']}.json", summary)
        s["explanationUri"] = f"out/explanations/{s['tag']}.json"
        s["explanationSource"] = summary["source"]

    bundle = export.simulator_bundle(dataset, benchmarks, ctx_base["intensityModel"], max(simulate.ANCHORED_PERIODS))
    _write(OUT / "simulator.json", bundle)
    manifest["simulatorUri"] = "out/simulator.json"

    _write(OUT / "manifest.json", manifest)
    return manifest


def _compromised_approval(tag: str, claim: dict, claim_digest: str, operator_sig: str, dom: dict, mhash: str) -> dict:
    """Attack fixture: one compromised verifier plus an attacker key try to approve a flagged claim."""
    forged = {"claimDigest": claim_digest, "verdict": 0, "riskScore": 40, "modelHash": mhash, "reportHash": keccak_hex(b"forged clean report")}
    sigs = [sign_typed(demo_key(k), "Verification", VERIFICATION_FIELDS, dom, forged)[1] for k in ("verifier:3", "attacker")]
    attack = {
        "name": "compromised-verifier-approval",
        "description": "Verifier node 3 is compromised and colludes with an outside key to approve the under-declared claim.",
        "targetTag": tag,
        "claim": claim,
        "operatorSignature": operator_sig,
        "verification": forged,
        "verifierSignatures": sigs,
    }
    uri = f"out/attacks/{tag}-compromised-approval.json"
    _write(ROOT / uri, attack)
    return {"uri": uri, "name": attack["name"], "targetTag": tag}
