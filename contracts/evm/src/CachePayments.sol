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
  event TreasuryTransferStarted(address indexed current, address indexed pending);
  event PausedSet(bool paused);

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

  /// @notice Start a two-step treasury transfer. The new treasury takes
  /// effect only after `acceptTreasury` is called by `newTreasury`.
  function setTreasury(address newTreasury) external {
    require(msg.sender == treasury, "CachePayments: not treasury");
    require(newTreasury != address(0), "CachePayments: zero treasury");
    pendingTreasury = newTreasury;
    emit TreasuryTransferStarted(treasury, newTreasury);
  }

  /// @notice Complete the treasury transfer started by `setTreasury`.
  function acceptTreasury() external {
    require(msg.sender == pendingTreasury, "CachePayments: not pending treasury");
    emit TreasuryUpdated(treasury, msg.sender);
    treasury = msg.sender;
    pendingTreasury = address(0);
  }

  /// @notice Emergency pause for new payments. Access management and reads
  /// stay available while paused.
  function setPaused(bool _paused) external {
    require(msg.sender == treasury, "CachePayments: not treasury");
    paused = _paused;
    emit PausedSet(_paused);
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
    require(!paused, "CachePayments: paused");
    CacheEntry storage e = entries[entryId];
    // entryId is caller-chosen: only the first payer (or the existing owner
    // renewing) may write this entry, otherwise anyone could hijack it.
    bool renewal = e.owner == msg.sender;
    require(e.owner == address(0) || renewal, "CachePayments: not entry owner");

    uint64 expires;
    if (tier == Tier.Permanent || (renewal && e.expiresAt == 0)) {
      // Permanent stays permanent, even when renewed with a timed tier.
      expires = 0;
    } else {
      // Renewals extend from whichever is later: the current expiry or now.
      uint64 base = uint64(block.timestamp);
      if (e.expiresAt > base) base = e.expiresAt;
      expires = base + durationSeconds;
    }

    uint256 amount = _priceFor(tier);
    e.owner = msg.sender;
    e.fileId = entryId;
    e.expiresAt = expires;
    e.active = true;

    require(usdc.transferFrom(msg.sender, treasury, amount), "CachePayments: USDC transfer failed");

    emit CachePaid(entryId, msg.sender, tier, expires);
  }

  // ---------------------------------------------------------------------
  // Access
  // ---------------------------------------------------------------------

  function grantAccess(bytes32 entryId, address grantee) external {
    CacheEntry storage e = entries[entryId];
    require(e.owner == msg.sender, "CachePayments: not owner");
    require(grantee != address(0), "CachePayments: zero grantee");
    address[] storage list = e.allowList;
    uint256 len = list.length;
    // Idempotent: an address already on the list is not pushed again, so a
    // single revoke always removes it fully.
    for (uint256 i = 0; i < len; i++) {
      if (list[i] == grantee) return;
    }
    list.push(grantee);
    emit AccessGranted(entryId, grantee);
  }

  function revokeAccess(bytes32 entryId, address grantee) external {
    CacheEntry storage e = entries[entryId];
    require(e.owner == msg.sender, "CachePayments: not owner");
    address[] storage list = e.allowList;
    bool removed = false;
    // Remove every occurrence (duplicates may predate the idempotent grant).
    // After a swap-and-pop the swapped-in element is re-checked at index i.
    uint256 i = 0;
    while (i < list.length) {
      if (list[i] == grantee) {
        list[i] = list[list.length - 1];
        list.pop();
        removed = true;
      } else {
        i++;
      }
    }
    if (removed) emit AccessRevoked(entryId, grantee);
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

  // ---------------------------------------------------------------------
  // Storage (appended — never reorder; this contract lives behind a proxy)
  // ---------------------------------------------------------------------

  /// @notice Pending recipient of a two-step treasury transfer.
  address public pendingTreasury;
  /// @notice Emergency pause: blocks `payForCache` while true.
  bool public paused;

  /// @dev Reserved storage to keep future upgrades layout-safe.
  /// Was uint256[48]; pendingTreasury + paused pack into one slot.
  uint256[47] private __gap;
}
