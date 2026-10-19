// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {FacilityRegistry} from "./FacilityRegistry.sol";

/// @title EmissionPassport
/// @notice Anchors monthly embedded-emission claims of CBAM / TR-ETS installations.
///
///  Trust model
///  1. The installation operator signs an EIP-712 `EmissionClaim` (activity-based totals for
///     one month plus the Merkle root of the month's shipments).
///  2. Independent AI verifier nodes cross-check the claim against external evidence and sign
///     an EIP-712 `Verification` over the exact claim digest. A passport is accepted only if
///     at least `verifierThreshold` distinct registered verifiers signed it (k-of-n).
///  3. EU importers prove, without revealing any other shipment, that their shipment is part of
///     an approved passport (Merkle proof over a salted commitment bound to their address) and
///     declare it exactly once, which prevents the same emission record being reused.
///
///  Only hashes, totals and verdicts go on-chain; process data and evidence stay off-chain
///  (content-addressed by `evidenceHash` / `reportHash`).
contract EmissionPassport is EIP712, AccessControl {
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    bytes32 public constant REGULATOR_ROLE = keccak256("REGULATOR_ROLE");

    bytes32 public constant CLAIM_TYPEHASH = keccak256(
        "EmissionClaim(uint256 facilityId,uint32 period,uint256 productionTonnes,uint256 directEmissionsKg,uint256 indirectEmissionsKg,bytes32 shipmentsRoot,bytes32 evidenceHash,uint256 nonce)"
    );
    bytes32 public constant VERIFICATION_TYPEHASH =
        keccak256("Verification(bytes32 claimDigest,uint8 verdict,uint16 riskScore,bytes32 modelHash,bytes32 reportHash)");

    uint8 public constant VERDICT_APPROVED = 0;
    uint8 public constant VERDICT_FLAGGED = 1;

    enum Status {
        None,
        Approved,
        Flagged,
        Revoked
    }

    struct EmissionClaim {
        uint256 facilityId;
        uint32 period; // YYYYMM
        uint256 productionTonnes;
        uint256 directEmissionsKg;
        uint256 indirectEmissionsKg;
        bytes32 shipmentsRoot;
        bytes32 evidenceHash;
        uint256 nonce;
    }

    struct Verification {
        bytes32 claimDigest;
        uint8 verdict;
        uint16 riskScore; // 0 (no risk) .. 1000
        bytes32 modelHash; // hash of the verifier model + config version
        bytes32 reportHash; // hash of the full verification report (off-chain / IPFS)
    }

    struct Passport {
        uint256 facilityId;
        uint32 period;
        uint256 productionTonnes;
        uint256 directEmissionsKg;
        uint256 indirectEmissionsKg;
        bytes32 shipmentsRoot;
        bytes32 evidenceHash;
        bytes32 claimDigest;
        uint16 riskScore;
        bytes32 modelHash;
        bytes32 reportHash;
        uint8 verifierSignatures;
        Status status;
        uint64 issuedAt;
        string revocationReason;
    }

    FacilityRegistry public immutable registry;
    uint8 public verifierThreshold;
    uint256 public passportCount;
    uint256 public declarationCount;

    mapping(uint256 => Passport) private _passports;
    mapping(uint256 => uint256) public facilityNonce;
    /// facilityId => period => latest passportId
    mapping(uint256 => mapping(uint32 => uint256)) public passportOf;
    /// shipment leaf => passportId it was declared under (0 = not declared)
    mapping(bytes32 => uint256) public declaredUnder;

    event PassportIssued(
        uint256 indexed passportId,
        uint256 indexed facilityId,
        uint32 period,
        Status status,
        uint16 riskScore,
        uint8 verifierSignatures,
        bytes32 reportHash
    );
    event PassportRevoked(uint256 indexed passportId, address indexed by, string reason);
    event ShipmentDeclared(uint256 indexed passportId, address indexed importer, bytes32 commitment, bytes32 leaf);
    event VerifierThresholdUpdated(uint8 threshold);

    error InactiveFacility(uint256 facilityId);
    error BadNonce(uint256 expected, uint256 got);
    error PeriodAlreadyApproved(uint256 facilityId, uint32 period, uint256 passportId);
    error InvalidPeriod(uint32 period);
    error ZeroProduction();
    error BadOperatorSignature(address recovered, address expected);
    error VerificationDoesNotMatchClaim();
    error InvalidVerdict(uint8 verdict);
    error InvalidRiskScore(uint16 riskScore);
    error InsufficientVerifierSignatures(uint8 valid, uint8 required);
    error UnknownPassport(uint256 passportId);
    error NotRevocable(uint256 passportId, Status status);
    error InvalidShipmentProof();
    error ShipmentAlreadyDeclared(bytes32 leaf, uint256 passportId);
    error InvalidThreshold();

    constructor(address admin, FacilityRegistry registry_, uint8 threshold) EIP712("EmisPass", "1") {
        if (threshold == 0) revert InvalidThreshold();
        registry = registry_;
        verifierThreshold = threshold;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(REGULATOR_ROLE, admin);
        emit VerifierThresholdUpdated(threshold);
    }

    // ------------------------------------------------------------------ admin

    function setVerifierThreshold(uint8 threshold) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (threshold == 0) revert InvalidThreshold();
        verifierThreshold = threshold;
        emit VerifierThresholdUpdated(threshold);
    }

    // ------------------------------------------------------------------ hashing

    function hashClaim(EmissionClaim calldata c) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    CLAIM_TYPEHASH,
                    c.facilityId,
                    c.period,
                    c.productionTonnes,
                    c.directEmissionsKg,
                    c.indirectEmissionsKg,
                    c.shipmentsRoot,
                    c.evidenceHash,
                    c.nonce
                )
            )
        );
    }

    function hashVerification(Verification calldata v) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(abi.encode(VERIFICATION_TYPEHASH, v.claimDigest, v.verdict, v.riskScore, v.modelHash, v.reportHash))
        );
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // ------------------------------------------------------------------ passports

    /// @notice Anchor a verified monthly claim. Anyone may relay it; authority comes from the
    ///         operator signature and the k-of-n verifier signatures, not from msg.sender.
    function submitPassport(
        EmissionClaim calldata claim,
        bytes calldata operatorSignature,
        Verification calldata verification,
        bytes[] calldata verifierSignatures
    ) external returns (uint256 passportId) {
        uint256 facilityId = claim.facilityId;
        if (!registry.isActive(facilityId)) revert InactiveFacility(facilityId);
        if (claim.nonce != facilityNonce[facilityId]) revert BadNonce(facilityNonce[facilityId], claim.nonce);
        uint32 month = claim.period % 100;
        if (month == 0 || month > 12 || claim.period < 202001) revert InvalidPeriod(claim.period);
        if (claim.productionTonnes == 0) revert ZeroProduction();

        uint256 previous = passportOf[facilityId][claim.period];
        if (previous != 0 && _passports[previous].status == Status.Approved) {
            revert PeriodAlreadyApproved(facilityId, claim.period, previous);
        }

        bytes32 claimDigest = hashClaim(claim);
        address expectedOperator = registry.operatorOf(facilityId);
        address recovered = ECDSA.recover(claimDigest, operatorSignature);
        if (recovered != expectedOperator) revert BadOperatorSignature(recovered, expectedOperator);

        if (verification.claimDigest != claimDigest) revert VerificationDoesNotMatchClaim();
        if (verification.verdict > VERDICT_FLAGGED) revert InvalidVerdict(verification.verdict);
        if (verification.riskScore > 1000) revert InvalidRiskScore(verification.riskScore);

        uint8 valid = _countVerifierSignatures(hashVerification(verification), verifierSignatures);
        if (valid < verifierThreshold) revert InsufficientVerifierSignatures(valid, verifierThreshold);

        facilityNonce[facilityId] = claim.nonce + 1;
        passportId = ++passportCount;

        Passport storage p = _passports[passportId];
        p.facilityId = facilityId;
        p.period = claim.period;
        p.productionTonnes = claim.productionTonnes;
        p.directEmissionsKg = claim.directEmissionsKg;
        p.indirectEmissionsKg = claim.indirectEmissionsKg;
        p.shipmentsRoot = claim.shipmentsRoot;
        p.evidenceHash = claim.evidenceHash;
        p.claimDigest = claimDigest;
        p.riskScore = verification.riskScore;
        p.modelHash = verification.modelHash;
        p.reportHash = verification.reportHash;
        p.verifierSignatures = valid;
        p.status = verification.verdict == VERDICT_APPROVED ? Status.Approved : Status.Flagged;
        p.issuedAt = uint64(block.timestamp);

        passportOf[facilityId][claim.period] = passportId;

        emit PassportIssued(passportId, facilityId, claim.period, p.status, verification.riskScore, valid, verification.reportHash);
    }

    /// @notice Regulator (e.g. competent authority / accreditation body) withdraws a passport,
    ///         for instance after a site visit finds misreporting. Declarations made under it
    ///         remain on record so importers can be notified.
    function revokePassport(uint256 passportId, string calldata reason) external onlyRole(REGULATOR_ROLE) {
        Passport storage p = _existing(passportId);
        if (p.status == Status.Revoked) revert NotRevocable(passportId, p.status);
        p.status = Status.Revoked;
        p.revocationReason = reason;
        emit PassportRevoked(passportId, msg.sender, reason);
    }

    function getPassport(uint256 passportId) external view returns (Passport memory) {
        return _existing(passportId);
    }

    /// @notice Specific embedded emissions in kgCO2e per tonne of product (direct, indirect).
    function specificEmissions(uint256 passportId) external view returns (uint256 directKgPerT, uint256 indirectKgPerT) {
        Passport storage p = _existing(passportId);
        directKgPerT = p.directEmissionsKg / p.productionTonnes;
        indirectKgPerT = p.indirectEmissionsKg / p.productionTonnes;
    }

    // ------------------------------------------------------------------ shipments (selective disclosure)

    /// @notice Leaf = double-hashed (importer, commitment), compatible with OpenZeppelin
    ///         StandardMerkleTree. `commitment` is keccak256 of the salted shipment record, so the
    ///         chain never learns quantities or intensities of individual shipments.
    function shipmentLeaf(address importer, bytes32 commitment) public pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(importer, commitment))));
    }

    function verifyShipment(uint256 passportId, address importer, bytes32 commitment, bytes32[] calldata proof)
        public
        view
        returns (bool)
    {
        Passport storage p = _passports[passportId];
        if (p.status != Status.Approved) return false;
        return MerkleProof.verifyCalldata(proof, p.shipmentsRoot, shipmentLeaf(importer, commitment));
    }

    /// @notice Importer records that it used this shipment's embedded-emission data in its
    ///         CBAM declaration. Bound to msg.sender and usable once.
    function declareShipment(uint256 passportId, bytes32 commitment, bytes32[] calldata proof) external {
        if (!verifyShipment(passportId, msg.sender, commitment, proof)) revert InvalidShipmentProof();
        bytes32 leaf = shipmentLeaf(msg.sender, commitment);
        if (declaredUnder[leaf] != 0) revert ShipmentAlreadyDeclared(leaf, declaredUnder[leaf]);
        declaredUnder[leaf] = passportId;
        declarationCount++;
        emit ShipmentDeclared(passportId, msg.sender, commitment, leaf);
    }

    // ------------------------------------------------------------------ internals

    function _countVerifierSignatures(bytes32 digest, bytes[] calldata signatures) private view returns (uint8 valid) {
        uint256 n = signatures.length;
        address[] memory seen = new address[](n);
        for (uint256 i = 0; i < n; i++) {
            (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, signatures[i]);
            if (err != ECDSA.RecoverError.NoError || !hasRole(VERIFIER_ROLE, signer)) continue;
            bool duplicate = false;
            for (uint256 j = 0; j < valid; j++) {
                if (seen[j] == signer) {
                    duplicate = true;
                    break;
                }
            }
            if (duplicate) continue;
            seen[valid] = signer;
            valid++;
        }
    }

    function _existing(uint256 passportId) private view returns (Passport storage p) {
        p = _passports[passportId];
        if (p.status == Status.None) revert UnknownPassport(passportId);
    }
}
