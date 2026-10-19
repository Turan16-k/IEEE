// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title FacilityRegistry
/// @notice Registry of CBAM / TR-ETS installations and the operator key that signs each
///         installation's emission claims. Registration is restricted to a registrar
///         (in production: the competent authority or an accredited verification body).
contract FacilityRegistry is AccessControl {
    bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");

    enum Sector {
        IronSteel,
        Cement,
        Aluminium,
        Fertiliser,
        Hydrogen,
        Electricity
    }

    struct Facility {
        string name;
        string installationId; // e.g. TR-ETS / MEDAS installation code
        string country; // ISO 3166-1 alpha-2
        Sector sector;
        string route; // production route, e.g. "EAF", "BF-BOF", "dry-kiln"
        address operatorKey; // key that signs monthly emission claims
        bool active;
    }

    uint256 public facilityCount;
    mapping(uint256 => Facility) private _facilities;

    event FacilityRegistered(uint256 indexed facilityId, string name, Sector sector, address operatorKey);
    event OperatorKeyRotated(uint256 indexed facilityId, address oldKey, address newKey);
    event FacilityStatusChanged(uint256 indexed facilityId, bool active);

    error UnknownFacility(uint256 facilityId);
    error ZeroAddress();

    constructor(address admin) {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(REGISTRAR_ROLE, admin);
    }

    function registerFacility(
        string calldata name,
        string calldata installationId,
        string calldata country,
        Sector sector,
        string calldata route,
        address operatorKey
    ) external onlyRole(REGISTRAR_ROLE) returns (uint256 facilityId) {
        if (operatorKey == address(0)) revert ZeroAddress();
        facilityId = ++facilityCount;
        _facilities[facilityId] = Facility(name, installationId, country, sector, route, operatorKey, true);
        emit FacilityRegistered(facilityId, name, sector, operatorKey);
    }

    /// @notice Rotate a compromised or expired operator key. Old claims stay valid; new
    ///         claims must be signed by the new key.
    function rotateOperatorKey(uint256 facilityId, address newKey) external onlyRole(REGISTRAR_ROLE) {
        if (newKey == address(0)) revert ZeroAddress();
        Facility storage f = _existing(facilityId);
        emit OperatorKeyRotated(facilityId, f.operatorKey, newKey);
        f.operatorKey = newKey;
    }

    function setActive(uint256 facilityId, bool active) external onlyRole(REGISTRAR_ROLE) {
        _existing(facilityId).active = active;
        emit FacilityStatusChanged(facilityId, active);
    }

    function getFacility(uint256 facilityId) external view returns (Facility memory) {
        if (facilityId == 0 || facilityId > facilityCount) revert UnknownFacility(facilityId);
        return _facilities[facilityId];
    }

    function operatorOf(uint256 facilityId) external view returns (address) {
        return _facilities[facilityId].operatorKey;
    }

    function isActive(uint256 facilityId) external view returns (bool) {
        return _facilities[facilityId].active;
    }

    function _existing(uint256 facilityId) private view returns (Facility storage f) {
        if (facilityId == 0 || facilityId > facilityCount) revert UnknownFacility(facilityId);
        f = _facilities[facilityId];
    }
}
