// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/// @title DonationEscrow
/// @notice Receives native-token donations for the FileOnChain platform.
/// Three recipient categories: Platform (flat), PerCID (funds a specific
/// CID's pinning), PerChain (funds a chain's public cache layer).
/// Deployed behind an OZ TransparentUpgradeableProxy; the ProxyAdmin is
/// owned by the deploy-time admin address.
contract DonationEscrow is Initializable {
  // ---------------------------------------------------------------------
  // Types
  // ---------------------------------------------------------------------

  enum Recipient {
    Platform,
    PerCID,
    PerChain
  }

  // ---------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------

  event Donated(
    address indexed donor,
    address indexed recipient,
    uint256 amount,
    Recipient indexed recipientType,
    bytes32 target,
    string memo,
    uint256 timestamp
  );

  event TreasuryUpdated(address indexed previous, address indexed next);
  event TreasuryTransferStarted(address indexed current, address indexed pending);
  event PausedSet(bool paused);

  // ---------------------------------------------------------------------
  // Storage
  // ---------------------------------------------------------------------

  address public treasury;
  mapping(bytes32 => uint256) public cidDonations;
  mapping(bytes32 => uint256) public chainDonations;

  // ---------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    _disableInitializers();
  }

  function initialize(address _treasury) external initializer {
    require(_treasury != address(0), "DonationEscrow: zero treasury");
    treasury = _treasury;
  }

  // ---------------------------------------------------------------------
  // Owner
  // ---------------------------------------------------------------------

  /// @notice Start a two-step treasury transfer. The new treasury takes
  /// effect only after `acceptTreasury` is called by `newTreasury`.
  function setTreasury(address newTreasury) external {
    require(msg.sender == treasury, "DonationEscrow: not treasury");
    require(newTreasury != address(0), "DonationEscrow: zero treasury");
    pendingTreasury = newTreasury;
    emit TreasuryTransferStarted(treasury, newTreasury);
  }

  /// @notice Complete the treasury transfer started by `setTreasury`.
  function acceptTreasury() external {
    require(msg.sender == pendingTreasury, "DonationEscrow: not pending treasury");
    emit TreasuryUpdated(treasury, msg.sender);
    treasury = msg.sender;
    pendingTreasury = address(0);
  }

  /// @notice Emergency pause for new donations. Reads stay available.
  function setPaused(bool _paused) external {
    require(msg.sender == treasury, "DonationEscrow: not treasury");
    paused = _paused;
    emit PausedSet(_paused);
  }

  // ---------------------------------------------------------------------
  // Donations
  // ---------------------------------------------------------------------

  /// @notice Donate native tokens. The full amount is forwarded to the
  /// treasury. The `target` parameter is the bytes32 CID hash (PerCID) or
  /// the bytes32 encoding of the chain id (PerChain).
  function donate(Recipient recipientType, bytes32 target, string calldata memo) external payable {
    require(!paused, "DonationEscrow: paused");
    require(msg.value > 0, "DonationEscrow: zero amount");

    // Checks-effects-interactions: update the ledgers and emit before the
    // external call so a reentering treasury sees consistent totals.
    if (recipientType == Recipient.PerCID) {
      cidDonations[target] += msg.value;
    } else if (recipientType == Recipient.PerChain) {
      chainDonations[target] += msg.value;
    }

    emit Donated(msg.sender, treasury, msg.value, recipientType, target, memo, block.timestamp);

    (bool ok,) = treasury.call{value: msg.value}("");
    require(ok, "DonationEscrow: treasury transfer failed");
  }

  // ---------------------------------------------------------------------
  // Views
  // ---------------------------------------------------------------------

  function cidDonationTotal(bytes32 cidHash) external view returns (uint256) {
    return cidDonations[cidHash];
  }

  function chainDonationTotal(bytes32 chainIdHash) external view returns (uint256) {
    return chainDonations[chainIdHash];
  }

  // ---------------------------------------------------------------------
  // Storage (appended — never reorder; this contract lives behind a proxy)
  // ---------------------------------------------------------------------

  /// @notice Pending recipient of a two-step treasury transfer.
  address public pendingTreasury;
  /// @notice Emergency pause: blocks `donate` while true.
  bool public paused;

  /// @dev Reserved storage to keep future upgrades layout-safe.
  /// Was uint256[48]; pendingTreasury + paused pack into one slot.
  uint256[47] private __gap;
}
