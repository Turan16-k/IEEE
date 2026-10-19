const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { shipmentLeaf, buildTree } = require("../scripts/lib/merkle");

const CLAIM_TYPES = {
  EmissionClaim: [
    { name: "facilityId", type: "uint256" },
    { name: "period", type: "uint32" },
    { name: "productionTonnes", type: "uint256" },
    { name: "directEmissionsKg", type: "uint256" },
    { name: "indirectEmissionsKg", type: "uint256" },
    { name: "shipmentsRoot", type: "bytes32" },
    { name: "evidenceHash", type: "bytes32" },
    { name: "nonce", type: "uint256" },
  ],
};
const VERIFICATION_TYPES = {
  Verification: [
    { name: "claimDigest", type: "bytes32" },
    { name: "verdict", type: "uint8" },
    { name: "riskScore", type: "uint16" },
    { name: "modelHash", type: "bytes32" },
    { name: "reportHash", type: "bytes32" },
  ],
};

const APPROVED = 0;
const FLAGGED = 1;
const Status = { None: 0n, Approved: 1n, Flagged: 2n, Revoked: 3n };

async function deployFixture() {
  const [admin, operator, v1, v2, v3, importer, otherImporter, outsider] = await ethers.getSigners();
  const registry = await ethers.deployContract("FacilityRegistry", [admin.address]);
  const passport = await ethers.deployContract("EmissionPassport", [admin.address, await registry.getAddress(), 2]);
  const VERIFIER_ROLE = await passport.VERIFIER_ROLE();
  for (const v of [v1, v2, v3]) await passport.grantRole(VERIFIER_ROLE, v.address);
  await registry.registerFacility("Demo EAF Steel", "TR-ETS-0001", "TR", 0, "EAF", operator.address);

  const domain = {
    name: "EmisPass",
    version: "1",
    chainId: (await ethers.provider.getNetwork()).chainId,
    verifyingContract: await passport.getAddress(),
  };

  // three shipments, two to `importer`, one to `otherImporter`
  const shipments = [importer, importer, otherImporter].map((imp, i) => ({
    importer: imp.address,
    commitment: ethers.keccak256(ethers.toUtf8Bytes(`shipment-${i}`)),
  }));
  const tree = buildTree(shipments.map((s) => shipmentLeaf(s.importer, s.commitment)));

  return { admin, operator, v1, v2, v3, importer, otherImporter, outsider, registry, passport, domain, shipments, tree };
}

function baseClaim(ctx, overrides = {}) {
  return {
    facilityId: 1n,
    period: 202609,
    productionTonnes: 40_000n,
    directEmissionsKg: 16_800_000n,
    indirectEmissionsKg: 9_400_000n,
    shipmentsRoot: ctx.tree.root,
    evidenceHash: ethers.keccak256(ethers.toUtf8Bytes("evidence-bundle")),
    nonce: 0n,
    ...overrides,
  };
}

async function buildSubmission(ctx, { claim, verdict = APPROVED, riskScore = 120, verifiers, operator } = {}) {
  claim = claim || baseClaim(ctx);
  const claimDigest = ethers.TypedDataEncoder.hash(ctx.domain, CLAIM_TYPES, claim);
  const operatorSig = await (operator || ctx.operator).signTypedData(ctx.domain, CLAIM_TYPES, claim);
  const verification = {
    claimDigest,
    verdict,
    riskScore,
    modelHash: ethers.keccak256(ethers.toUtf8Bytes("emispass-verifier-1.0.0")),
    reportHash: ethers.keccak256(ethers.toUtf8Bytes("report")),
  };
  const sigs = [];
  for (const v of verifiers || [ctx.v1, ctx.v2]) {
    sigs.push(await v.signTypedData(ctx.domain, VERIFICATION_TYPES, verification));
  }
  return { claim, operatorSig, verification, sigs };
}

async function submit(ctx, s) {
  return ctx.passport.submitPassport(s.claim, s.operatorSig, s.verification, s.sigs);
}

describe("EmissionPassport", function () {
  describe("EIP-712 parity", function () {
    it("on-chain claim and verification digests match off-chain typed-data hashes", async function () {
      const ctx = await loadFixture(deployFixture);
      const s = await buildSubmission(ctx);
      expect(await ctx.passport.hashClaim(s.claim)).to.equal(s.verification.claimDigest);
      expect(await ctx.passport.hashVerification(s.verification)).to.equal(
        ethers.TypedDataEncoder.hash(ctx.domain, VERIFICATION_TYPES, s.verification)
      );
    });
  });

  describe("issuance", function () {
    it("issues an approved passport with 2-of-3 verifier signatures", async function () {
      const ctx = await loadFixture(deployFixture);
      const s = await buildSubmission(ctx);
      await expect(submit(ctx, s))
        .to.emit(ctx.passport, "PassportIssued")
        .withArgs(1n, 1n, 202609, Status.Approved, 120, 2, s.verification.reportHash);

      const p = await ctx.passport.getPassport(1);
      expect(p.status).to.equal(Status.Approved);
      expect(p.productionTonnes).to.equal(40_000n);
      expect(await ctx.passport.passportOf(1, 202609)).to.equal(1n);
      expect(await ctx.passport.facilityNonce(1)).to.equal(1n);
      const [direct, indirect] = await ctx.passport.specificEmissions(1);
      expect(direct).to.equal(420n);
      expect(indirect).to.equal(235n);
    });

    it("records a flagged verdict without making shipments declarable", async function () {
      const ctx = await loadFixture(deployFixture);
      await submit(ctx, await buildSubmission(ctx, { verdict: FLAGGED, riskScore: 780 }));
      expect((await ctx.passport.getPassport(1)).status).to.equal(Status.Flagged);
      const proof = ctx.tree.proof(0);
      expect(await ctx.passport.verifyShipment(1, ctx.importer.address, ctx.shipments[0].commitment, proof)).to.equal(false);
    });

    it("allows a corrected resubmission after a flagged passport, but never a second approval", async function () {
      const ctx = await loadFixture(deployFixture);
      await submit(ctx, await buildSubmission(ctx, { verdict: FLAGGED, riskScore: 780 }));
      const corrected = baseClaim(ctx, { directEmissionsKg: 22_000_000n, nonce: 1n });
      await submit(ctx, await buildSubmission(ctx, { claim: corrected }));
      expect(await ctx.passport.passportOf(1, 202609)).to.equal(2n);

      const third = baseClaim(ctx, { nonce: 2n });
      await expect(submit(ctx, await buildSubmission(ctx, { claim: third })))
        .to.be.revertedWithCustomError(ctx.passport, "PeriodAlreadyApproved")
        .withArgs(1n, 202609, 2n);
    });
  });

  describe("signature security", function () {
    it("rejects a passport with fewer than k verifier signatures", async function () {
      const ctx = await loadFixture(deployFixture);
      const s = await buildSubmission(ctx, { verifiers: [ctx.v1] });
      await expect(submit(ctx, s))
        .to.be.revertedWithCustomError(ctx.passport, "InsufficientVerifierSignatures")
        .withArgs(1, 2);
    });

    it("counts duplicate signatures from one verifier only once", async function () {
      const ctx = await loadFixture(deployFixture);
      const s = await buildSubmission(ctx, { verifiers: [ctx.v1, ctx.v1, ctx.v1] });
      await expect(submit(ctx, s)).to.be.revertedWithCustomError(ctx.passport, "InsufficientVerifierSignatures");
    });

    it("ignores signatures from unregistered keys (a compromised outsider cannot approve)", async function () {
      const ctx = await loadFixture(deployFixture);
      const s = await buildSubmission(ctx, { verifiers: [ctx.v1, ctx.outsider] });
      await expect(submit(ctx, s))
        .to.be.revertedWithCustomError(ctx.passport, "InsufficientVerifierSignatures")
        .withArgs(1, 2);
    });

    it("rejects claims whose numbers were altered after the operator signed", async function () {
      const ctx = await loadFixture(deployFixture);
      const s = await buildSubmission(ctx);
      s.claim = { ...s.claim, directEmissionsKg: 1_000_000n };
      await expect(submit(ctx, s)).to.be.revertedWithCustomError(ctx.passport, "BadOperatorSignature");
    });

    it("rejects verifier approvals that were issued for a different claim", async function () {
      const ctx = await loadFixture(deployFixture);
      const honest = await buildSubmission(ctx);
      const altered = baseClaim(ctx, { directEmissionsKg: 1_000_000n });
      const alteredSig = await ctx.operator.signTypedData(ctx.domain, CLAIM_TYPES, altered);
      await expect(
        ctx.passport.submitPassport(altered, alteredSig, honest.verification, honest.sigs)
      ).to.be.revertedWithCustomError(ctx.passport, "VerificationDoesNotMatchClaim");
    });

    it("rejects claims not signed by the registered operator key", async function () {
      const ctx = await loadFixture(deployFixture);
      const s = await buildSubmission(ctx, { operator: ctx.outsider });
      await expect(submit(ctx, s)).to.be.revertedWithCustomError(ctx.passport, "BadOperatorSignature");
    });

    it("blocks replay of an already submitted passport", async function () {
      const ctx = await loadFixture(deployFixture);
      const s = await buildSubmission(ctx);
      await submit(ctx, s);
      await expect(submit(ctx, s)).to.be.revertedWithCustomError(ctx.passport, "BadNonce").withArgs(1n, 0n);
    });

    it("rejects claims signed with a rotated-out operator key", async function () {
      const ctx = await loadFixture(deployFixture);
      await ctx.registry.rotateOperatorKey(1, ctx.outsider.address);
      await expect(submit(ctx, await buildSubmission(ctx))).to.be.revertedWithCustomError(
        ctx.passport,
        "BadOperatorSignature"
      );
      await submit(ctx, await buildSubmission(ctx, { operator: ctx.outsider }));
      expect(await ctx.passport.passportCount()).to.equal(1n);
    });

    it("rejects claims from deactivated facilities and invalid periods", async function () {
      const ctx = await loadFixture(deployFixture);
      await expect(
        submit(ctx, await buildSubmission(ctx, { claim: baseClaim(ctx, { period: 202613 }) }))
      ).to.be.revertedWithCustomError(ctx.passport, "InvalidPeriod");
      await ctx.registry.setActive(1, false);
      await expect(submit(ctx, await buildSubmission(ctx))).to.be.revertedWithCustomError(ctx.passport, "InactiveFacility");
    });
  });

  describe("selective disclosure and declarations", function () {
    it("lets an importer declare its own shipment exactly once", async function () {
      const ctx = await loadFixture(deployFixture);
      await submit(ctx, await buildSubmission(ctx));
      const { commitment } = ctx.shipments[1];
      const proof = ctx.tree.proof(1);

      expect(await ctx.passport.verifyShipment(1, ctx.importer.address, commitment, proof)).to.equal(true);
      await expect(ctx.passport.connect(ctx.importer).declareShipment(1, commitment, proof))
        .to.emit(ctx.passport, "ShipmentDeclared")
        .withArgs(1n, ctx.importer.address, commitment, shipmentLeaf(ctx.importer.address, commitment));
      await expect(
        ctx.passport.connect(ctx.importer).declareShipment(1, commitment, proof)
      ).to.be.revertedWithCustomError(ctx.passport, "ShipmentAlreadyDeclared");
      expect(await ctx.passport.declarationCount()).to.equal(1n);
    });

    it("prevents another importer from using someone else's shipment record", async function () {
      const ctx = await loadFixture(deployFixture);
      await submit(ctx, await buildSubmission(ctx));
      const { commitment } = ctx.shipments[0];
      await expect(
        ctx.passport.connect(ctx.otherImporter).declareShipment(1, commitment, ctx.tree.proof(0))
      ).to.be.revertedWithCustomError(ctx.passport, "InvalidShipmentProof");
    });

    it("rejects a forged commitment", async function () {
      const ctx = await loadFixture(deployFixture);
      await submit(ctx, await buildSubmission(ctx));
      const forged = ethers.keccak256(ethers.toUtf8Bytes("forged"));
      await expect(
        ctx.passport.connect(ctx.importer).declareShipment(1, forged, ctx.tree.proof(0))
      ).to.be.revertedWithCustomError(ctx.passport, "InvalidShipmentProof");
    });
  });

  describe("revocation and governance", function () {
    it("lets the regulator revoke a passport, which disables further declarations", async function () {
      const ctx = await loadFixture(deployFixture);
      await submit(ctx, await buildSubmission(ctx));
      await expect(ctx.passport.revokePassport(1, "site visit: meter tampering"))
        .to.emit(ctx.passport, "PassportRevoked")
        .withArgs(1n, ctx.admin.address, "site visit: meter tampering");
      const p = await ctx.passport.getPassport(1);
      expect(p.status).to.equal(Status.Revoked);
      expect(p.revocationReason).to.equal("site visit: meter tampering");
      await expect(
        ctx.passport.connect(ctx.importer).declareShipment(1, ctx.shipments[0].commitment, ctx.tree.proof(0))
      ).to.be.revertedWithCustomError(ctx.passport, "InvalidShipmentProof");
      await expect(ctx.passport.revokePassport(1, "again")).to.be.revertedWithCustomError(ctx.passport, "NotRevocable");
    });

    it("restricts revocation, verifier management and threshold changes", async function () {
      const ctx = await loadFixture(deployFixture);
      await submit(ctx, await buildSubmission(ctx));
      await expect(ctx.passport.connect(ctx.outsider).revokePassport(1, "x")).to.be.revertedWithCustomError(
        ctx.passport,
        "AccessControlUnauthorizedAccount"
      );
      await expect(ctx.passport.connect(ctx.outsider).setVerifierThreshold(1)).to.be.revertedWithCustomError(
        ctx.passport,
        "AccessControlUnauthorizedAccount"
      );
      await expect(ctx.passport.setVerifierThreshold(0)).to.be.revertedWithCustomError(ctx.passport, "InvalidThreshold");
      await expect(
        ctx.registry.connect(ctx.outsider).registerFacility("x", "x", "TR", 0, "EAF", ctx.outsider.address)
      ).to.be.revertedWithCustomError(ctx.registry, "AccessControlUnauthorizedAccount");
    });

    it("raising the threshold to 3-of-3 requires every verifier", async function () {
      const ctx = await loadFixture(deployFixture);
      await ctx.passport.setVerifierThreshold(3);
      await expect(submit(ctx, await buildSubmission(ctx))).to.be.revertedWithCustomError(
        ctx.passport,
        "InsufficientVerifierSignatures"
      );
      await submit(ctx, await buildSubmission(ctx, { verifiers: [ctx.v1, ctx.v2, ctx.v3] }));
      expect(await ctx.passport.passportCount()).to.equal(1n);
    });
  });
});
