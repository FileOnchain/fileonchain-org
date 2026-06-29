// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title FileRegistry
/// @notice Anchors CID hashes from uploaded files to on-chain metadata.
/// Each CID can only be anchored once. The txHash returned is a deterministic
/// hash derived from state — production deployments would emit a real tx
/// receipt hash from the indexer instead.
contract FileRegistry {
  // ---------------------------------------------------------------------
  // Types
  // ---------------------------------------------------------------------

  struct CIDRecord {
    bytes32 contentHash; // SHA-256 of the original file
    string uri; // optional IPFS / Arweave pointer
    uint64 blockNumber;
    uint64 timestamp;
    address submitter;
  }

  // ---------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------

  event CIDAnchored(
    bytes32 indexed cidHash,
    bytes32 indexed contentHash,
    address indexed submitter,
    uint64 timestamp
  );

  event OwnershipTransferred(address indexed previous, address indexed next);

  // ---------------------------------------------------------------------
  // Storage
  // ---------------------------------------------------------------------

  address public owner;
  mapping(bytes32 => CIDRecord) public records;
  mapping(bytes32 => bytes32) public txToCID;
  mapping(bytes32 => bytes32) public cidToTx;

  // ---------------------------------------------------------------------
  // Modifiers
  // ---------------------------------------------------------------------

  modifier onlyOwner() {
    require(msg.sender == owner, "FileRegistry: not owner");
    _;
  }

  // ---------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------

  constructor() {
    owner = msg.sender;
    emit OwnershipTransferred(address(0), msg.sender);
  }

  // ---------------------------------------------------------------------
  // Owner
  // ---------------------------------------------------------------------

  function transferOwnership(address newOwner) external onlyOwner {
    require(newOwner != address(0), "FileRegistry: zero owner");
    emit OwnershipTransferred(owner, newOwner);
    owner = newOwner;
  }

  // ---------------------------------------------------------------------
  // Anchoring
  // ---------------------------------------------------------------------

  /// @notice Anchor a CID hash with metadata. Reverts if already anchored.
  /// @return txHash Deterministic pseudo-tx hash derived from CID, timestamp, and submitter.
  function anchorCID(
    bytes32 cidHash,
    bytes32 contentHash,
    string calldata uri
  ) external returns (bytes32 txHash) {
    require(records[cidHash].timestamp == 0, "FileRegistry: already anchored");
    records[cidHash] = CIDRecord({
      contentHash: contentHash,
      uri: uri,
      blockNumber: uint64(block.number),
      timestamp: uint64(block.timestamp),
      submitter: msg.sender
    });
    txHash = keccak256(abi.encodePacked(cidHash, block.timestamp, msg.sender));
    cidToTx[cidHash] = txHash;
    txToCID[txHash] = cidHash;
    emit CIDAnchored(cidHash, contentHash, msg.sender, uint64(block.timestamp));
  }

  // ---------------------------------------------------------------------
  // Views
  // ---------------------------------------------------------------------

  function getCIDRecord(bytes32 cidHash) external view returns (CIDRecord memory) {
    return records[cidHash];
  }

  function getTxByCID(bytes32 cidHash) external view returns (bytes32) {
    return cidToTx[cidHash];
  }

  function getCIDByTx(bytes32 txHash) external view returns (bytes32) {
    return txToCID[txHash];
  }
}