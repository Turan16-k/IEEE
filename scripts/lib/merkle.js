// Minimal Merkle tree compatible with OpenZeppelin MerkleProof (commutative keccak256 pair hashing).
// Mirrors verifier/emispass/merkle.py so proofs built in Python and JS are interchangeable.
const { ethers } = require("ethers");

const coder = ethers.AbiCoder.defaultAbiCoder();

function shipmentLeaf(importer, commitment) {
  return ethers.keccak256(ethers.keccak256(coder.encode(["address", "bytes32"], [importer, commitment])));
}

function hashPair(a, b) {
  return BigInt(a) < BigInt(b) ? ethers.keccak256(ethers.concat([a, b])) : ethers.keccak256(ethers.concat([b, a]));
}

function buildTree(leaves) {
  if (leaves.length === 0) throw new Error("empty tree");
  const layers = [leaves.slice()];
  while (layers[layers.length - 1].length > 1) {
    const prev = layers[layers.length - 1];
    const next = [];
    for (let i = 0; i < prev.length; i += 2) {
      next.push(i + 1 < prev.length ? hashPair(prev[i], prev[i + 1]) : prev[i]);
    }
    layers.push(next);
  }
  return {
    root: layers[layers.length - 1][0],
    proof(index) {
      const proof = [];
      let idx = index;
      for (let l = 0; l < layers.length - 1; l++) {
        const sibling = idx ^ 1;
        if (sibling < layers[l].length) proof.push(layers[l][sibling]);
        idx = Math.floor(idx / 2);
      }
      return proof;
    },
  };
}

module.exports = { shipmentLeaf, hashPair, buildTree };
