// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/// @title FileRegistry
/// @notice Minimal anchor registry: an event carrier for FileOnChain's
/// versioned anchor payloads, plus an optional first-write CID record.
///
/// The registry is deliberately economic-free. Anchoring costs nothing
/// beyond gas: no token, no tips, no bonds, no challenge windows. What an
/// anchor proves is exactly what the chain proves — that this payload was
/// written by this address in this block — and independent verification
/// happens off-chain against the transaction receipt and the payload
/// vocabulary (see the FileOnChain evidence-package spec).
///
/// Two write paths:
/// - `anchorChunk` — pure event emission. Chunk anchors, manifest anchors,
///   and any other payload ride here; all linkage lives in the payload.
///   (The name is kept for compatibility with existing deployments.)
/// - `anchorCID` — event emission plus a first-write-wins record, so a
///   file-level anchor can be read back on-chain without an indexer.
///   Subsequent anchors of the same CID still emit events (independent
///   attestations by other submitters) but do not overwrite the record.
contract FileRegistry is Initializable, OwnableUpgradeable {
  struct CIDRecord {
    bytes32 contentHash; // SHA-256 of the original content
    string uri; // anchor payload or storage pointer
    uint64 timestamp;
    address submitter;
  }

  event ChunkAnchored(
    bytes32 indexed cidHash, bytes32 indexed contentHash, address indexed submitter, string uri, uint64 timestamp
  );
  event CIDAnchored(
    bytes32 indexed cidHash, bytes32 indexed contentHash, address indexed submitter, string uri, uint64 timestamp
  );

  /// @dev First-write-wins record per CID hash (keccak256 of the CID string).
  mapping(bytes32 => CIDRecord) private _records;

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    _disableInitializers();
  }

  function initialize(address initialOwner) external initializer {
    __Ownable_init(initialOwner);
  }

  /// @notice Emit an anchor payload as an event — chunks, manifests, or any
  /// other payload from the vocabulary. Free beyond gas; nothing is stored.
  function anchorChunk(bytes32 cidHash, bytes32 contentHash, string calldata uri) external {
    emit ChunkAnchored(cidHash, contentHash, msg.sender, uri, uint64(block.timestamp));
  }

  /// @notice Anchor a file-level CID. The first anchor of a CID stores a
  /// readable record; every anchor (including repeats by other submitters)
  /// emits an event.
  function anchorCID(bytes32 cidHash, bytes32 contentHash, string calldata uri) external {
    if (_records[cidHash].timestamp == 0) {
      _records[cidHash] =
        CIDRecord({contentHash: contentHash, uri: uri, timestamp: uint64(block.timestamp), submitter: msg.sender});
    }
    emit CIDAnchored(cidHash, contentHash, msg.sender, uri, uint64(block.timestamp));
  }

  /// @notice The first-write record for a CID hash; zeroed when never anchored.
  function getCIDRecord(bytes32 cidHash) external view returns (CIDRecord memory) {
    return _records[cidHash];
  }

  /// @notice Whether a CID hash has a stored record.
  function isCIDAnchored(bytes32 cidHash) external view returns (bool) {
    return _records[cidHash].timestamp != 0;
  }
}
