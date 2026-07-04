// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/FileRegistry.sol";

contract FileRegistryTest is Test {
  FileRegistry internal registry;
  address internal owner = address(this);
  address internal alice = makeAddr("alice");
  address internal bob = makeAddr("bob");

  bytes32 internal constant CID_A = keccak256("bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi");
  bytes32 internal constant CID_B = keccak256("bafybeibv3zaicqsdwfmq5dym6ipxzl5qxksirv3d3uyzjqhs2dtx3w3c3q");
  bytes32 internal constant CONTENT_A = keccak256("hello world");
  bytes32 internal constant CONTENT_B = keccak256("goodbye world");

  function setUp() public {
    registry = new FileRegistry();
  }

  function test_OwnerIsConstructorCaller() public view {
    assertEq(registry.owner(), owner);
  }

  function test_AnchorCIDStoresMetadata() public {
    vm.expectEmit(true, true, true, true);
    emit FileRegistry.CIDAnchored(CID_A, CONTENT_A, alice, uint64(block.timestamp));

    vm.prank(alice);
    bytes32 txHash = registry.anchorCID(CID_A, CONTENT_A, "ipfs://bafy.../file");
    assertTrue(txHash != bytes32(0), "txHash should be non-zero");

    FileRegistry.CIDRecord memory rec = registry.getCIDRecord(CID_A);
    assertEq(rec.contentHash, CONTENT_A);
    assertEq(rec.submitter, alice);
    assertEq(rec.blockNumber, block.number);
    assertEq(rec.timestamp, block.timestamp);
    assertEq(rec.uri, "ipfs://bafy.../file");
  }

  function test_RevertWhen_DoubleAnchor() public {
    registry.anchorCID(CID_A, CONTENT_A, "");
    vm.expectRevert(bytes("FileRegistry: already anchored"));
    registry.anchorCID(CID_A, CONTENT_B, "");
  }

  function test_GetTxByCIDRoundtrip() public {
    bytes32 txHash = registry.anchorCID(CID_A, CONTENT_A, "");
    assertEq(registry.getTxByCID(CID_A), txHash);
    assertEq(registry.getCIDByTx(txHash), CID_A);
  }

  function test_OwnershipTransfer() public {
    registry.transferOwnership(alice);
    assertEq(registry.owner(), alice);
    vm.expectRevert(bytes("FileRegistry: not owner"));
    registry.transferOwnership(bob);
  }

  function test_RevertWhen_TransferToZero() public {
    vm.expectRevert(bytes("FileRegistry: zero owner"));
    registry.transferOwnership(address(0));
  }

  function testFuzz_AnchorCID(bytes32 cidHash, bytes32 contentHash, string calldata uri) public {
    vm.assume(cidHash != bytes32(0));
    registry.anchorCID(cidHash, contentHash, uri);
    FileRegistry.CIDRecord memory rec = registry.getCIDRecord(cidHash);
    assertEq(rec.contentHash, contentHash);
    assertEq(rec.uri, uri);
  }
}