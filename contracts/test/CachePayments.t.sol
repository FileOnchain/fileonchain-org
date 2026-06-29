// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/CachePayments.sol";
import "../src/mocks/MockUSDC.sol";

contract CachePaymentsTest is Test {
  MockUSDC internal usdc;
  CachePayments internal cache;
  address internal treasury = makeAddr("treasury");
  address internal alice = makeAddr("alice");
  address internal bob = makeAddr("bob");
  bytes32 internal constant FILE_A = keccak256("file-a");

  function setUp() public {
    usdc = new MockUSDC();
    cache = new CachePayments(usdc, treasury);
    usdc.mint(alice, 1_000_000_000); // 1000 USDC
    vm.prank(alice);
    usdc.approve(address(cache), type(uint256).max);
  }

  function test_ConstructorPricing() public view {
    assertEq(cache.priceSingle(), 1_000_000);
    assertEq(cache.priceFolder(), 5_000_000);
    assertEq(cache.pricePermanent(), 50_000_000);
  }

  function test_PayForCache_SingleFile() public {
    uint64 duration = 30 days;
    uint256 balBefore = usdc.balanceOf(treasury);

    vm.expectEmit(true, true, false, true);
    emit CachePayments.CachePaid(FILE_A, alice, CachePayments.Tier.SingleFile, uint64(block.timestamp) + duration);

    vm.prank(alice);
    cache.payForCache(FILE_A, CachePayments.Tier.SingleFile, duration);

    assertEq(usdc.balanceOf(treasury) - balBefore, 1_000_000, "treasury should receive 1 USDC");
    CachePayments.CacheEntry memory entry = cache.getEntry(FILE_A);
    assertTrue(entry.active);
    assertEq(entry.owner, alice);
    assertEq(entry.expiresAt, uint64(block.timestamp) + duration);
  }

  function test_PayForCache_Folder() public {
    vm.prank(alice);
    cache.payForCache(FILE_A, CachePayments.Tier.Folder, uint64(30 days));
    assertEq(cache.getEntry(FILE_A).expiresAt, uint64(block.timestamp) + 30 days);
  }

  function test_PayForCache_Permanent() public {
    vm.prank(alice);
    cache.payForCache(FILE_A, CachePayments.Tier.Permanent, 0);
    assertEq(cache.getEntry(FILE_A).expiresAt, 0, "Permanent should have expiresAt == 0");
  }

  function test_RevertWhen_USDCTransferFails() public {
    // Bob has USDC but never approved the contract to spend it
    usdc.mint(bob, 1_000_000);
    vm.prank(bob);
    vm.expectRevert(bytes("MockUSDC: insufficient allowance"));
    cache.payForCache(FILE_A, CachePayments.Tier.SingleFile, uint64(30 days));
  }

  function test_GrantAndRevokeAccess() public {
    vm.startPrank(alice);
    cache.payForCache(FILE_A, CachePayments.Tier.Permanent, 0);
    cache.grantAccess(FILE_A, bob);
    assertTrue(cache.isAllowed(FILE_A, bob), "bob should be allowed after grant");
    cache.revokeAccess(FILE_A, bob);
    assertFalse(cache.isAllowed(FILE_A, bob), "bob should not be allowed after revoke");
    vm.stopPrank();
  }

  function test_RevertWhen_GrantByNonOwner() public {
    vm.prank(alice);
    cache.payForCache(FILE_A, CachePayments.Tier.Permanent, 0);

    vm.prank(bob);
    vm.expectRevert(bytes("CachePayments: not owner"));
    cache.grantAccess(FILE_A, makeAddr("charlie"));
  }

  function test_OwnerAlwaysAllowed() public {
    vm.prank(alice);
    cache.payForCache(FILE_A, CachePayments.Tier.Permanent, 0);
    assertTrue(cache.isAllowed(FILE_A, alice));
  }

  function test_ExpiredEntryBlocksAccess() public {
    vm.startPrank(alice);
    cache.payForCache(FILE_A, CachePayments.Tier.SingleFile, uint64(30 days));
    cache.grantAccess(FILE_A, bob);
    vm.stopPrank();

    vm.warp(block.timestamp + 31 days);
    assertFalse(cache.isAllowed(FILE_A, bob), "expired entry should deny access");
  }

  function test_SetPricesOnlyByTreasury() public {
    vm.prank(alice);
    vm.expectRevert(bytes("CachePayments: not treasury"));
    cache.setPrices(2_000_000, 10_000_000, 100_000_000);

    vm.prank(treasury);
    cache.setPrices(2_000_000, 10_000_000, 100_000_000);
    assertEq(cache.priceSingle(), 2_000_000);
  }
}