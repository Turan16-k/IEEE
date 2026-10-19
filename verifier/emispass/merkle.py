"""Merkle tree compatible with OpenZeppelin MerkleProof (commutative keccak256 pair hashing).
Mirrors scripts/lib/merkle.js."""

from __future__ import annotations

from eth_utils import keccak

from .crypto import hx, unhx


def hash_pair(a: str, b: str) -> str:
    x, y = unhx(a), unhx(b)
    return hx(keccak(x + y) if x < y else keccak(y + x))


class MerkleTree:
    def __init__(self, leaves: list[str]):
        if not leaves:
            raise ValueError("empty tree")
        self.layers = [list(leaves)]
        while len(self.layers[-1]) > 1:
            prev = self.layers[-1]
            self.layers.append(
                [hash_pair(prev[i], prev[i + 1]) if i + 1 < len(prev) else prev[i] for i in range(0, len(prev), 2)]
            )

    @property
    def root(self) -> str:
        return self.layers[-1][0]

    def proof(self, index: int) -> list[str]:
        proof, idx = [], index
        for layer in self.layers[:-1]:
            sibling = idx ^ 1
            if sibling < len(layer):
                proof.append(layer[sibling])
            idx //= 2
        return proof


def verify(proof: list[str], root: str, leaf: str) -> bool:
    h = leaf
    for p in proof:
        h = hash_pair(h, p)
    return h.lower() == root.lower()
