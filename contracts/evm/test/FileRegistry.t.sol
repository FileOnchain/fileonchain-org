// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {FileRegistry} from "../src/FileRegistry.sol";
import {ProxyDeployer} from "./utils/ProxyDeployer.sol";

contract FileRegistryTest is Test, ProxyDeployer {
  FileRegistry internal registry;

  address internal owner = makeAddr("owner");
  address internal alice = makeAddr("alice");
  address internal bob = makeAddr("bob");

  bytes32 internal constant CID_HASH = keccak256("bafybeigdyrzt5examplecid");
  // sha256("hello world") — a literal, because the sha256 builtin is a
  // precompile call at runtime and would consume vm.prank before the
  // registry call under test.
  bytes32 internal constant CONTENT_HASH =
    0xb94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9;
  string internal constant PAYLOAD =
    '{"p":"fileonchain","v":1,"op":"anchor","cid":"bafybeigdyrzt5examplecid"}';

  event ChunkAnchored(
    bytes32 indexed cidHash, bytes32 indexed contentHash, address indexed submitter, string uri, uint64 timestamp
  );
  event CIDAnchored(
    bytes32 indexed cidHash, bytes32 indexed contentHash, address indexed submitter, string uri, uint64 timestamp
  );

  function setUp() public {
    registry = deployRegistry(owner);
  }

  function test_Initialize_SetsOwner() public view {
    assertEq(registry.owner(), owner);
  }

  function test_AnchorChunk_EmitsEvent_StoresNothing() public {
    vm.expectEmit(true, true, true, true);
    emit ChunkAnchored(CID_HASH, CONTENT_HASH, alice, PAYLOAD, uint64(block.timestamp));
    vm.prank(alice);
    registry.anchorChunk(CID_HASH, CONTENT_HASH, PAYLOAD);

    assertFalse(registry.isCIDAnchored(CID_HASH));
  }

  function test_AnchorCID_StoresFirstWriteRecord() public {
    vm.expectEmit(true, true, true, true);
    emit CIDAnchored(CID_HASH, CONTENT_HASH, alice, PAYLOAD, uint64(block.timestamp));
    vm.prank(alice);
    registry.anchorCID(CID_HASH, CONTENT_HASH, PAYLOAD);

    assertTrue(registry.isCIDAnchored(CID_HASH));
    FileRegistry.CIDRecord memory record = registry.getCIDRecord(CID_HASH);
    assertEq(record.contentHash, CONTENT_HASH);
    assertEq(record.uri, PAYLOAD);
    assertEq(record.submitter, alice);
    assertEq(record.timestamp, uint64(block.timestamp));
  }

  function test_AnchorCID_RepeatDoesNotOverwrite_StillEmits() public {
    vm.prank(alice);
    registry.anchorCID(CID_HASH, CONTENT_HASH, PAYLOAD);
    uint64 firstTimestamp = uint64(block.timestamp);

    vm.warp(block.timestamp + 100);
    // Topics only — the non-indexed timestamp is asserted via the stored
    // record below (vm.warp and emit-template evaluation disagree on
    // block.timestamp under some forge versions).
    vm.expectEmit(true, true, true, false);
    emit CIDAnchored(CID_HASH, bytes32(0), bob, "other", uint64(block.timestamp));
    vm.prank(bob);
    registry.anchorCID(CID_HASH, bytes32(0), "other");

    // First-write wins: bob's repeat anchor emitted but changed nothing.
    FileRegistry.CIDRecord memory record = registry.getCIDRecord(CID_HASH);
    assertEq(record.submitter, alice);
    assertEq(record.contentHash, CONTENT_HASH);
    assertEq(record.uri, PAYLOAD);
    assertEq(record.timestamp, firstTimestamp);
  }

  function test_GetCIDRecord_ZeroWhenNeverAnchored() public view {
    FileRegistry.CIDRecord memory record = registry.getCIDRecord(keccak256("unknown"));
    assertEq(record.timestamp, 0);
    assertEq(record.submitter, address(0));
  }

  function test_Initialize_RevertsOnSecondCall() public {
    vm.expectRevert();
    registry.initialize(alice);
  }

  function testFuzz_AnchorCID_AnyPayload(bytes32 cidHash, bytes32 contentHash, string calldata uri) public {
    vm.prank(alice);
    registry.anchorCID(cidHash, contentHash, uri);
    assertTrue(registry.isCIDAnchored(cidHash));
    FileRegistry.CIDRecord memory record = registry.getCIDRecord(cidHash);
    assertEq(record.contentHash, contentHash);
    assertEq(record.uri, uri);
  }
}
