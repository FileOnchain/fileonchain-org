// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/// @title PlatformRegistry
/// @notice Registered integrators (the FileOnChain app, partner APIs, MCP
/// clients, ...) that originate anchor proposals. Each platform has a fee
/// share in bps, capped by `maxPlatformFeeBps`; the FileRegistry pays the
/// platform's cut of every verified anchor tip to its treasury. Registration
/// is governance-gated in v1 (owner = timelock); permissionless registration
/// with bonds is a documented follow-up.
/// Deployed behind an OZ TransparentUpgradeableProxy; the ProxyAdmin is
/// owned by the timelock.
contract PlatformRegistry is Initializable, OwnableUpgradeable {
  // ---------------------------------------------------------------------
  // Types
  // ---------------------------------------------------------------------

  struct Platform {
    address owner; // may rotate treasury / feeBps
    address treasury; // receives the platform share of tips
    uint16 feeBps; // requested share, <= maxPlatformFeeBps
    bool active; // inactive platforms cannot originate proposals
  }

  // ---------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------

  event PlatformRegistered(
    uint256 indexed platformId, address indexed owner, address indexed treasury, uint16 feeBps
  );
  event PlatformUpdated(uint256 indexed platformId, address indexed treasury, uint16 feeBps);
  event PlatformStatusChanged(uint256 indexed platformId, bool active);
  event MaxPlatformFeeBpsUpdated(uint16 previous, uint16 next);

  // ---------------------------------------------------------------------
  // Storage
  // ---------------------------------------------------------------------

  uint256 public nextPlatformId;
  mapping(uint256 => Platform) private _platforms;
  uint16 public maxPlatformFeeBps; // governance param

  // ---------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    _disableInitializers();
  }

  function initialize(uint16 _maxPlatformFeeBps, address initialOwner) external initializer {
    require(_maxPlatformFeeBps <= 10_000, "PlatformRegistry: bps > 100%");
    __Ownable_init(initialOwner);
    maxPlatformFeeBps = _maxPlatformFeeBps;
    nextPlatformId = 1;
  }

  // ---------------------------------------------------------------------
  // Owner (timelock)
  // ---------------------------------------------------------------------

  function registerPlatform(
    address platformOwner,
    address treasury,
    uint16 feeBps
  ) external onlyOwner returns (uint256 platformId) {
    require(platformOwner != address(0), "PlatformRegistry: zero owner");
    require(treasury != address(0), "PlatformRegistry: zero treasury");
    require(feeBps <= maxPlatformFeeBps, "PlatformRegistry: fee above cap");
    platformId = nextPlatformId++;
    _platforms[platformId] = Platform({owner: platformOwner, treasury: treasury, feeBps: feeBps, active: true});
    emit PlatformRegistered(platformId, platformOwner, treasury, feeBps);
  }

  function setPlatformActive(uint256 platformId, bool active) external onlyOwner {
    Platform storage p = _platforms[platformId];
    require(p.owner != address(0), "PlatformRegistry: unknown platform");
    p.active = active;
    emit PlatformStatusChanged(platformId, active);
  }

  function setMaxPlatformFeeBps(uint16 newMax) external onlyOwner {
    require(newMax <= 10_000, "PlatformRegistry: bps > 100%");
    emit MaxPlatformFeeBpsUpdated(maxPlatformFeeBps, newMax);
    maxPlatformFeeBps = newMax;
  }

  // ---------------------------------------------------------------------
  // Platform owner
  // ---------------------------------------------------------------------

  function updatePlatform(uint256 platformId, address treasury, uint16 feeBps) external {
    Platform storage p = _platforms[platformId];
    require(p.owner == msg.sender, "PlatformRegistry: not platform owner");
    require(treasury != address(0), "PlatformRegistry: zero treasury");
    require(feeBps <= maxPlatformFeeBps, "PlatformRegistry: fee above cap");
    p.treasury = treasury;
    p.feeBps = feeBps;
    emit PlatformUpdated(platformId, treasury, feeBps);
  }

  function transferPlatformOwnership(uint256 platformId, address newOwner) external {
    Platform storage p = _platforms[platformId];
    require(p.owner == msg.sender, "PlatformRegistry: not platform owner");
    require(newOwner != address(0), "PlatformRegistry: zero owner");
    p.owner = newOwner;
  }

  // ---------------------------------------------------------------------
  // Views
  // ---------------------------------------------------------------------

  function getPlatform(uint256 platformId) external view returns (Platform memory) {
    return _platforms[platformId];
  }

  function isActivePlatform(uint256 platformId) external view returns (bool) {
    return _platforms[platformId].active;
  }

  /// @dev Reserved storage to keep future upgrades layout-safe.
  uint256[48] private __gap;
}
