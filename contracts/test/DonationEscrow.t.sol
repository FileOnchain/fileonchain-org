// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/DonationEscrow.sol";

contract DonationEscrowTest is Test {
  DonationEscrow internal escrow;
  address internal treasury = makeAddr("treasury");
  address internal alice = makeAddr("alice");

  bytes32 internal constant CID_HASH = keccak256("bafy...cid");
  bytes32 internal constant CHAIN_TARGET = bytes32("evm:1");

  function setUp() public {
    escrow = new DonationEscrow(treasury);
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
    DonationEscrow badEscrow = new DonationEscrow(address(bad));

    vm.deal(alice, 1 ether);
    vm.prank(alice);
    vm.expectRevert(bytes("DonationEscrow: treasury transfer failed"));
    badEscrow.donate{value: 0.1 ether}(DonationEscrow.Recipient.Platform, bytes32(0), "");
  }

  function test_SetTreasury() public {
    vm.prank(treasury);
    escrow.setTreasury(makeAddr("new-treasury"));
    assertEq(escrow.treasury(), makeAddr("new-treasury"));
  }

  function test_RevertWhen_SetTreasuryByNonTreasury() public {
    vm.prank(alice);
    vm.expectRevert(bytes("DonationEscrow: not treasury"));
    escrow.setTreasury(makeAddr("new-treasury"));
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