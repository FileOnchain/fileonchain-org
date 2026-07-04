// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title DonationEscrow
/// @notice Receives native-token donations for the FileOnChain platform.
/// Three recipient categories: Platform (flat), PerCID (funds a specific
/// CID's pinning), PerChain (funds a chain's public cache layer).
contract DonationEscrow {
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

  // ---------------------------------------------------------------------
  // Storage
  // ---------------------------------------------------------------------

  address public treasury;
  mapping(bytes32 => uint256) public cidDonations;
  mapping(bytes32 => uint256) public chainDonations;

  // ---------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------

  constructor(address _treasury) {
    require(_treasury != address(0), "DonationEscrow: zero treasury");
    treasury = _treasury;
  }

  // ---------------------------------------------------------------------
  // Owner
  // ---------------------------------------------------------------------

  function setTreasury(address newTreasury) external {
    require(msg.sender == treasury, "DonationEscrow: not treasury");
    emit TreasuryUpdated(treasury, newTreasury);
    treasury = newTreasury;
  }

  // ---------------------------------------------------------------------
  // Donations
  // ---------------------------------------------------------------------

  /// @notice Donate native tokens. The full amount is forwarded to the
  /// treasury. The `target` parameter is the bytes32 CID hash (PerCID) or
  /// the bytes32 encoding of the chain id (PerChain).
  function donate(Recipient recipientType, bytes32 target, string calldata memo) external payable {
    require(msg.value > 0, "DonationEscrow: zero amount");
    (bool ok,) = treasury.call{value: msg.value}("");
    require(ok, "DonationEscrow: treasury transfer failed");

    if (recipientType == Recipient.PerCID) {
      cidDonations[target] += msg.value;
    } else if (recipientType == Recipient.PerChain) {
      chainDonations[target] += msg.value;
    }

    emit Donated(msg.sender, treasury, msg.value, recipientType, target, memo, block.timestamp);
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
}