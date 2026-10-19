import copy

import pytest

from emispass import node, simulate
from emispass.checks import train_expected_intensity_model
from emispass.crypto import (
    CLAIM_FIELDS,
    canonical_json,
    demo_key,
    domain,
    recover_typed,
    shipment_commitment,
    shipment_leaf,
    sign_record,
    sign_typed,
    typed_digest,
    verify_record,
)
from emispass.merkle import MerkleTree, verify
from emispass.sources import climate_trace

DOM = domain(31337, "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512")


@pytest.fixture(scope="module")
def world():
    ds = simulate.generate()
    facilities = {f["facilityId"]: f for f in ds["facilities"]}
    bm = climate_trace.benchmarks()
    training = [r for r in ds["records"] if r["period"] < min(simulate.ANCHORED_PERIODS)]
    ctx = {
        "trustedFeeds": ds["trustedFeeds"],
        "benchmarks": bm,
        "intensityModel": train_expected_intensity_model(training, facilities),
        "modelHash": node.model_hash(bm),
        "claimDigest": "0x" + "11" * 32,
        "evidenceHash": "0x" + "22" * 32,
    }
    return ds, facilities, ctx


def _verify(world, facility_id, period, use_correction=False, mutate=None):
    ds, facilities, ctx = world
    rec = next(r for r in ds["records"] if r["facilityId"] == facility_id and r["period"] == period)
    rec = copy.deepcopy(rec)
    if use_correction:
        rec["declaration"] = rec["correction"]
    if mutate:
        mutate(rec)
    history = [r for r in ds["records"] if r["facilityId"] == facility_id and r["period"] < period]
    return node.verify(rec, facilities[facility_id], history, ctx)


def test_honest_claims_are_approved(world):
    for fid in (1, 2, 3):
        for period in (202607, 202608):
            assert _verify(world, fid, period)["verdict"] == "APPROVED"


def test_under_declared_coking_coal_is_flagged_with_explanations(world):
    report = _verify(world, 3, 202609)
    assert report["verdict"] == "FLAGGED"
    checks = {f["check"] for f in report["findings"] if f["severity"] in ("high", "critical")}
    assert {"reconciliation", "recalculation", "ml-expected-intensity"} <= checks
    anomaly = next(f for f in report["findings"] if f["check"] == "ml-anomaly")
    assert anomaly["severity"] == "medium"


def test_correction_of_flagged_month_is_approved(world):
    assert _verify(world, 3, 202609, use_correction=True)["verdict"] == "APPROVED"


def test_forged_meter_feed_is_critical(world):
    def forge(rec):
        rec["feeds"]["gridMeter"]["record"]["electricityMWh"] *= 0.8  # altered after signing

    report = _verify(world, 1, 202608, mutate=forge)
    assert report["verdict"] == "FLAGGED"
    assert any(f["check"] == "provenance" and f["severity"] == "critical" for f in report["findings"])


def test_feed_signed_by_untrusted_key_is_critical(world):
    def resign(rec):
        rec["feeds"]["fuelSupplier"] = sign_record(demo_key("attacker"), rec["feeds"]["fuelSupplier"]["record"])

    report = _verify(world, 2, 202608, mutate=resign)
    assert report["verdict"] == "FLAGGED"


def test_reports_are_deterministic_across_nodes(world):
    a = canonical_json(_verify(world, 2, 202609))
    b = canonical_json(_verify(world, 2, 202609))
    assert a == b


def test_eip712_sign_and_recover():
    claim = {
        "facilityId": 1,
        "period": 202609,
        "productionTonnes": 40000,
        "directEmissionsKg": 16800000,
        "indirectEmissionsKg": 9400000,
        "shipmentsRoot": "0x" + "ab" * 32,
        "evidenceHash": "0x" + "cd" * 32,
        "nonce": 0,
    }
    key = demo_key("operator:1")
    digest, sig = sign_typed(key, "EmissionClaim", CLAIM_FIELDS, DOM, claim)
    assert digest == typed_digest("EmissionClaim", CLAIM_FIELDS, DOM, claim)
    assert recover_typed("EmissionClaim", CLAIM_FIELDS, DOM, claim, sig) == key.address


def test_signed_record_detects_tampering():
    env = sign_record(demo_key("feed:grid-meter"), {"electricityMWh": 100.0})
    assert verify_record(env)
    env["record"]["electricityMWh"] = 90.0
    assert not verify_record(env)


def test_merkle_proofs_and_importer_binding():
    shipments = [
        {"shipmentId": f"S{i}", "importer": demo_key("importer:A" if i % 2 else "importer:B").address, "cnCode": "7214", "quantityKg": 1000 * i,
         "directKgPerT": 110, "indirectKgPerT": 190, "period": 202609, "salt": "0x" + f"{i:02x}" * 32}
        for i in range(5)
    ]
    leaves = [shipment_leaf(s["importer"], shipment_commitment(s)) for s in shipments]
    tree = MerkleTree(leaves)
    for i, leaf in enumerate(leaves):
        assert verify(tree.proof(i), tree.root, leaf)
    other = demo_key("attacker").address
    assert not verify(tree.proof(0), tree.root, shipment_leaf(other, shipment_commitment(shipments[0])))
    changed = dict(shipments[0], directKgPerT=50)
    assert not verify(tree.proof(0), tree.root, shipment_leaf(changed["importer"], shipment_commitment(changed)))
