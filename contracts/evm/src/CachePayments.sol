// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

interface IERC20 {
  function transferFrom(address from, address to, uint256 amount) external returns (bool);
  function balanceOf(address account) external view returns (uint256);
}

/// @title CachePayments
/// @notice Paid private cache layer for files and folders. Charges USDC for
/// single file, folder, and permanent tiers. Owners can grant and revoke
/// address-based access to their cached entries.
/// Deployed behind an OZ TransparentUpgradeableProxy; the ProxyAdmin is
/// owned by the deploy-time admin address.
contract CachePayments is Initializable {
  // ---------------------------------------------------------------------
  // Types
  // ---------------------------------------------------------------------

  enum Tier {
    SingleFile,
    Folder,
    Permanent
  }

  struct CacheEntry {
    address owner;
    bytes32 fileId; // entry id (file or folder)
    uint64 expiresAt; // 0 = permanent
    bool active;
    address[] allowList;
  }

  // ---------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------

  event CachePaid(bytes32 indexed entryId, address indexed payer, Tier tier, uint64 expiresAt);
  event AccessGranted(bytes32 indexed entryId, address indexed grantee);
  event AccessRevoked(bytes32 indexed entryId, address indexed grantee);
  event PricesUpdated(uint256 single, uint256 folder, uint256 permanent);
  event TreasuryUpdated(address indexed previous, address indexed next);

  // ---------------------------------------------------------------------
  // Storage
  // ---------------------------------------------------------------------

  IERC20 public usdc;
  uint256 public priceSingle; // 1 USDC
  uint256 public priceFolder; // 5 USDC
  uint256 public pricePermanent; // 50 USDC
  address public treasury;

  mapping(bytes32 => CacheEntry) public entries;

  // ---------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    _disableInitializers();
  }

  function initialize(IERC20 _usdc, address _treasury) external initializer {
    require(address(_usdc) != address(0), "CachePayments: zero usdc");
    require(_treasury != address(0), "CachePayments: zero treasury");
    usdc = _usdc;
    treasury = _treasury;
    priceSingle = 1_000_000; // 1 USDC, 6 decimals
    priceFolder = 5_000_000; // 5 USDC
    pricePermanent = 50_000_000; // 50 USDC
  }

  // ---------------------------------------------------------------------
  // Owner
  // ---------------------------------------------------------------------

  function setTreasury(address newTreasury) external {
    require(msg.sender == treasury, "CachePayments: not treasury");
    emit TreasuryUpdated(treasury, newTreasury);
    treasury = newTreasury;
  }

  function setPrices(uint256 single, uint256 folder, uint256 permanent) external {
    require(msg.sender == treasury, "CachePayments: not treasury");
    priceSingle = single;
    priceFolder = folder;
    pricePermanent = permanent;
    emit PricesUpdated(single, folder, permanent);
  }

  // ---------------------------------------------------------------------
  // Payments
  // ---------------------------------------------------------------------

  /// @notice Pay for a cache entry. The caller must have approved the
  /// contract to spend `amount` USDC. `durationSeconds` is ignored when the
  /// tier is Permanent.
  function payForCache(bytes32 entryId, Tier tier, uint64 durationSeconds) external {
    uint256 amount = _priceFor(tier);
    require(usdc.transferFrom(msg.sender, treasury, amount), "CachePayments: USDC transfer failed");

    uint64 expires = tier == Tier.Permanent ? 0 : uint64(block.timestamp) + durationSeconds;
    CacheEntry storage e = entries[entryId];
    e.owner = msg.sender;
    e.fileId = entryId;
    e.expiresAt = expires;
    e.active = true;

    emit CachePaid(entryId, msg.sender, tier, expires);
  }

  // ---------------------------------------------------------------------
  // Access
  // ---------------------------------------------------------------------

  function grantAccess(bytes32 entryId, address grantee) external {
    CacheEntry storage e = entries[entryId];
    require(e.owner == msg.sender, "CachePayments: not owner");
    require(grantee != address(0), "CachePayments: zero grantee");
    e.allowList.push(grantee);
    emit AccessGranted(entryId, grantee);
  }

  function revokeAccess(bytes32 entryId, address grantee) external {
    CacheEntry storage e = entries[entryId];
    require(e.owner == msg.sender, "CachePayments: not owner");
    address[] storage list = e.allowList;
    uint256 len = list.length;
    for (uint256 i = 0; i < len; i++) {
      if (list[i] == grantee) {
        list[i] = list[len - 1];
        list.pop();
        emit AccessRevoked(entryId, grantee);
        return;
      }
    }
  }

  function isAllowed(bytes32 entryId, address user) external view returns (bool) {
    CacheEntry storage e = entries[entryId];
    if (!e.active) return false;
    if (e.expiresAt != 0 && e.expiresAt < block.timestamp) return false;
    if (e.owner == user) return true;
    address[] storage list = e.allowList;
    uint256 len = list.length;
    for (uint256 i = 0; i < len; i++) {
      if (list[i] == user) return true;
    }
    return false;
  }

  function allowListLength(bytes32 entryId) external view returns (uint256) {
    return entries[entryId].allowList.length;
  }

  function getEntry(bytes32 entryId) external view returns (CacheEntry memory) {
    return entries[entryId];
  }

  // ---------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------

  function _priceFor(Tier tier) internal view returns (uint256) {
    if (tier == Tier.SingleFile) return priceSingle;
    if (tier == Tier.Folder) return priceFolder;
    return pricePermanent;
  }

  /// @dev Reserved storage to keep future upgrades layout-safe.
  uint256[48] private __gap;
}
