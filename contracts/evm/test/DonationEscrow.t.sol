// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/DonationEscrow.sol";
import {ProxyDeployer} from "./utils/ProxyDeployer.sol";

contract DonationEscrowTest is Test, ProxyDeployer {
  DonationEscrow internal escrow;
  address internal treasury = makeAddr("treasury");
  address internal alice = makeAddr("alice");

  bytes32 internal constant CID_HASH = keccak256("bafy...cid");
  bytes32 internal constant CHAIN_TARGET = bytes32("evm:1");

  function setUp() public {
    escrow = deployEscrow(treasury);
  }

  function test_Donate_Platform() public {
    uint256 treasuryBefore = treasury.balance;
    vm.expectEmit(true, true, true, true);
    emit DonationEscrow.Donated(alice, treasury, 1 ether, DonationEscrow.Recipient.Platform, bytes32(0), "tip", block.timestamp);

    vm.deal(alice, 10 ether);
    vm.prank(alice);
    escrow.donate{value: 1 ether}(DonationEscrow.Recipient.Platform, bytes32(0), "tip");

    assertEq(treasury.balance - treasuryBefore, 1 ether);
  }

  function test_Donate_PerCID_Accumulates() public {
    vm.deal(alice, 10 ether);
    vm.startPrank(alice);
    escrow.donate{value: 0.5 ether}(DonationEscrow.Recipient.PerCID, CID_HASH, "for cid");
    escrow.donate{value: 0.25 ether}(DonationEscrow.Recipient.PerCID, CID_HASH, "more");
    vm.stopPrank();

    assertEq(escrow.cidDonations(CID_HASH), 0.75 ether);
  }

  function test_Donate_PerChain_Accumulates() public {
    vm.deal(alice, 10 ether);
    vm.prank(alice);
    escrow.donate{value: 2 ether}(DonationEscrow.Recipient.PerChain, CHAIN_TARGET, "for base");

    assertEq(escrow.chainDonations(CHAIN_TARGET), 2 ether);
  }

  function test_RevertWhen_ZeroAmount() public {
    vm.prank(alice);
    vm.expectRevert(bytes("DonationEscrow: zero amount"));
    escrow.donate(DonationEscrow.Recipient.Platform, bytes32(0), "empty");
  }

  function test_RevertWhen_TreasuryRejects() public {
    // Use a contract that always reverts on receive
    BadReceiver bad = new BadReceiver();
    DonationEscrow badEscrow = deployEscrow(address(bad));

    vm.deal(alice, 1 ether);
    vm.prank(alice);
    vm.expectRevert(bytes("DonationEscrow: treasury transfer failed"));
    badEscrow.donate{value: 0.1 ether}(DonationEscrow.Recipient.Platform, bytes32(0), "");
  }

  function test_RevertWhen_InitializeZeroTreasury() public {
    address implementation = address(new DonationEscrow());
    vm.expectRevert(bytes("DonationEscrow: zero treasury"));
    deployProxy(implementation, abi.encodeCall(DonationEscrow.initialize, (address(0))));
  }

  function test_DonationTotalViews() public {
    vm.deal(alice, 10 ether);
    vm.startPrank(alice);
    escrow.donate{value: 0.5 ether}(DonationEscrow.Recipient.PerCID, CID_HASH, "for cid");
    escrow.donate{value: 2 ether}(DonationEscrow.Recipient.PerChain, CHAIN_TARGET, "for base");
    vm.stopPrank();

    assertEq(escrow.cidDonationTotal(CID_HASH), 0.5 ether);
    assertEq(escrow.chainDonationTotal(CHAIN_TARGET), 2 ether);
    assertEq(escrow.cidDonationTotal(keccak256("other-cid")), 0);
    assertEq(escrow.chainDonationTotal(bytes32("evm:8453")), 0);
  }

  function test_PlatformDonationTouchesNoTargetTotals() public {
    vm.deal(alice, 1 ether);
    vm.prank(alice);
    escrow.donate{value: 1 ether}(DonationEscrow.Recipient.Platform, CID_HASH, "tip");

    // Platform donations skip both per-target ledgers even when a target is
    // passed along.
    assertEq(escrow.cidDonationTotal(CID_HASH), 0);
    assertEq(escrow.chainDonationTotal(CID_HASH), 0);
  }

  function test_SetTreasury_TwoStep() public {
    address next = makeAddr("new-treasury");
    vm.expectEmit(true, true, false, true);
    emit DonationEscrow.TreasuryTransferStarted(treasury, next);

    vm.prank(treasury);
    escrow.setTreasury(next);
    assertEq(escrow.treasury(), treasury, "treasury must not change until accepted");
    assertEq(escrow.pendingTreasury(), next);

    vm.prank(alice);
    vm.expectRevert(bytes("DonationEscrow: not pending treasury"));
    escrow.acceptTreasury();

    vm.expectEmit(true, true, false, true);
    emit DonationEscrow.TreasuryUpdated(treasury, next);
    vm.prank(next);
    escrow.acceptTreasury();
    assertEq(escrow.treasury(), next);
    assertEq(escrow.pendingTreasury(), address(0), "pending must be cleared");
  }

  function test_RevertWhen_SetTreasuryByNonTreasury() public {
    vm.prank(alice);
    vm.expectRevert(bytes("DonationEscrow: not treasury"));
    escrow.setTreasury(makeAddr("new-treasury"));
  }

  function test_RevertWhen_SetTreasuryZeroAddress() public {
    vm.prank(treasury);
    vm.expectRevert(bytes("DonationEscrow: zero treasury"));
    escrow.setTreasury(address(0));
  }

  function test_SetPaused_BlocksDonate() public {
    vm.expectEmit(false, false, false, true);
    emit DonationEscrow.PausedSet(true);
    vm.prank(treasury);
    escrow.setPaused(true);
    assertTrue(escrow.paused());

    vm.deal(alice, 1 ether);
    vm.prank(alice);
    vm.expectRevert(bytes("DonationEscrow: paused"));
    escrow.donate{value: 1 ether}(DonationEscrow.Recipient.Platform, bytes32(0), "tip");

    vm.prank(treasury);
    escrow.setPaused(false);
    vm.prank(alice);
    escrow.donate{value: 1 ether}(DonationEscrow.Recipient.Platform, bytes32(0), "tip");
    assertEq(treasury.balance, 1 ether, "unpause must restore donations");
  }

  function test_RevertWhen_SetPausedByNonTreasury() public {
    vm.prank(alice);
    vm.expectRevert(bytes("DonationEscrow: not treasury"));
    escrow.setPaused(true);
  }

  function test_ReenteringTreasuryCannotCorruptTotals() public {
    ReentrantTreasury mock = new ReentrantTreasury();
    DonationEscrow reEscrow = deployEscrow(address(mock));
    mock.arm(reEscrow, CID_HASH);

    vm.deal(alice, 1 ether);
    vm.prank(alice);
    reEscrow.donate{value: 1 ether}(DonationEscrow.Recipient.PerCID, CID_HASH, "outer");

    // CEI: the ledger already held the outer donation when the treasury's
    // receive() reentered.
    assertEq(mock.observedMidCallTotal(), 1 ether, "outer donation must be recorded before the external call");
    // Outer 1 ether + reentrant 0.5 ether both accounted, nothing lost.
    assertEq(reEscrow.cidDonationTotal(CID_HASH), 1.5 ether);
  }

  function testFuzz_DonateAmount(uint96 amount) public {
    vm.assume(amount > 0);
    vm.deal(alice, amount);
    vm.prank(alice);
    escrow.donate{value: amount}(DonationEscrow.Recipient.Platform, bytes32(0), "");
    assertEq(treasury.balance, amount);
  }
}

contract BadReceiver {
  receive() external payable {
    revert("nope");
  }
}

/// @dev Treasury that reenters `donate` from its receive() hook — proves the
/// ledgers are written before the external transfer (CEI) and stay
/// consistent under reentry. Reenters once to avoid infinite recursion.
contract ReentrantTreasury {
  DonationEscrow internal escrow;
  bytes32 internal target;
  bool internal reentered;
  uint256 public observedMidCallTotal;

  function arm(DonationEscrow _escrow, bytes32 _target) external {
    escrow = _escrow;
    target = _target;
  }

  receive() external payable {
    if (!reentered && address(escrow) != address(0)) {
      reentered = true;
      observedMidCallTotal = escrow.cidDonationTotal(target);
      escrow.donate{value: msg.value / 2}(DonationEscrow.Recipient.PerCID, target, "reenter");
    }
  }
}