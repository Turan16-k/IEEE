"""Hashing, canonical JSON, demo key derivation and EIP-712 signing.

Typed-data definitions must stay byte-identical to contracts/EmissionPassport.sol.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass

from eth_abi import encode as abi_encode
from eth_account import Account
from eth_account.messages import encode_defunct, encode_typed_data
from eth_utils import keccak, to_checksum_address

Account.enable_unaudited_hdwallet_features()

HARDHAT_MNEMONIC = "test test test test test test test test test test test junk"

# Index of each demo role in the HD wallet (m/44'/60'/0'/0/i). deploy.js uses the same map.
ROLE_INDEX = {
    "admin": 0,
    "operator:1": 1,
    "operator:2": 2,
    "operator:3": 3,
    "verifier:1": 4,
    "verifier:2": 5,
    "verifier:3": 6,
    "importer:A": 7,
    "importer:B": 8,
    "feed:grid-meter": 9,
    "feed:fuel-supplier": 10,
    "attacker": 11,
}

CLAIM_FIELDS = [
    {"name": "facilityId", "type": "uint256"},
    {"name": "period", "type": "uint32"},
    {"name": "productionTonnes", "type": "uint256"},
    {"name": "directEmissionsKg", "type": "uint256"},
    {"name": "indirectEmissionsKg", "type": "uint256"},
    {"name": "shipmentsRoot", "type": "bytes32"},
    {"name": "evidenceHash", "type": "bytes32"},
    {"name": "nonce", "type": "uint256"},
]
VERIFICATION_FIELDS = [
    {"name": "claimDigest", "type": "bytes32"},
    {"name": "verdict", "type": "uint8"},
    {"name": "riskScore", "type": "uint16"},
    {"name": "modelHash", "type": "bytes32"},
    {"name": "reportHash", "type": "bytes32"},
]
DOMAIN_FIELDS = [
    {"name": "name", "type": "string"},
    {"name": "version", "type": "string"},
    {"name": "chainId", "type": "uint256"},
    {"name": "verifyingContract", "type": "address"},
]


def hx(b: bytes) -> str:
    return "0x" + bytes(b).hex()


def unhx(s: str) -> bytes:
    return bytes.fromhex(s[2:] if s.startswith("0x") else s)


def canonical_json(obj) -> bytes:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def keccak_hex(data: bytes) -> str:
    return hx(keccak(data))


@dataclass(frozen=True)
class Key:
    role: str
    address: str
    private_key: bytes


def demo_key(role: str) -> Key:
    """Deterministic demo keys. Set EMISPASS_MNEMONIC for anything that touches a public testnet."""
    mnemonic = os.environ.get("EMISPASS_MNEMONIC") or HARDHAT_MNEMONIC
    acct = Account.from_mnemonic(mnemonic, account_path=f"m/44'/60'/0'/0/{ROLE_INDEX[role]}")
    return Key(role, acct.address, bytes(acct.key))


def domain(chain_id: int, contract: str) -> dict:
    return {"name": "EmisPass", "version": "1", "chainId": chain_id, "verifyingContract": to_checksum_address(contract)}


def _typed(primary: str, fields: list, dom: dict, message: dict) -> dict:
    return {
        "types": {"EIP712Domain": DOMAIN_FIELDS, primary: fields},
        "primaryType": primary,
        "domain": dom,
        "message": message,
    }


def _bytesify(message: dict, fields: list) -> dict:
    out = dict(message)
    for f in fields:
        if f["type"] == "bytes32":
            out[f["name"]] = unhx(out[f["name"]])
    return out


def sign_typed(key: Key, primary: str, fields: list, dom: dict, message: dict) -> tuple[str, str]:
    """Returns (digest, signature) as 0x-hex strings."""
    signable = encode_typed_data(full_message=_typed(primary, fields, dom, _bytesify(message, fields)))
    signed = Account.sign_message(signable, private_key=key.private_key)
    return hx(signed.message_hash), hx(signed.signature)


def typed_digest(primary: str, fields: list, dom: dict, message: dict) -> str:
    from eth_account.messages import _hash_eip191_message

    signable = encode_typed_data(full_message=_typed(primary, fields, dom, _bytesify(message, fields)))
    return hx(_hash_eip191_message(signable))


def recover_typed(primary: str, fields: list, dom: dict, message: dict, signature: str) -> str:
    signable = encode_typed_data(full_message=_typed(primary, fields, dom, _bytesify(message, fields)))
    return Account.recover_message(signable, signature=unhx(signature))


# --- signed data feeds (EIP-191 over canonical JSON) ---------------------------------------


def sign_record(key: Key, record: dict) -> dict:
    signed = Account.sign_message(encode_defunct(primitive=canonical_json(record)), private_key=key.private_key)
    return {"record": record, "signer": key.address, "signature": hx(signed.signature)}


def verify_record(envelope: dict) -> bool:
    try:
        recovered = Account.recover_message(
            encode_defunct(primitive=canonical_json(envelope["record"])), signature=unhx(envelope["signature"])
        )
    except Exception:
        return False
    return recovered.lower() == envelope["signer"].lower()


# --- shipment commitments (must match scripts/lib/merkle.js + EmissionPassport.shipmentLeaf) --


def shipment_commitment(s: dict) -> str:
    """keccak256(abi.encode(string id, address importer, string cnCode, uint256 quantityKg,
    uint256 directKgPerT, uint256 indirectKgPerT, uint32 period, bytes32 salt))"""
    return hx(
        keccak(
            abi_encode(
                ["string", "address", "string", "uint256", "uint256", "uint256", "uint32", "bytes32"],
                [
                    s["shipmentId"],
                    to_checksum_address(s["importer"]),
                    s["cnCode"],
                    int(s["quantityKg"]),
                    int(s["directKgPerT"]),
                    int(s["indirectKgPerT"]),
                    int(s["period"]),
                    unhx(s["salt"]),
                ],
            )
        )
    )


def shipment_leaf(importer: str, commitment: str) -> str:
    return hx(keccak(keccak(abi_encode(["address", "bytes32"], [to_checksum_address(importer), unhx(commitment)]))))
