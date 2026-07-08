// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/CachePayments.sol";
import {ProxyDeployer} from "./utils/ProxyDeployer.sol";
import "../src/mocks/MockUSDC.sol";

contract CachePaymentsTest is Test, ProxyDeployer {
  MockUSDC internal usdc;
  CachePayments internal cache;
  address internal treasury = makeAddr("treasury");
  address internal alice = makeAddr("alice");
  address internal bob = makeAddr("bob");
  bytes32 internal constant FILE_A = keccak256("file-a");

  function setUp() public {
    usdc = new MockUSDC();
    cache = deployCache(usdc, treasury);
    usdc.mint(alice, 1_000_000_000); // 1000 USDC
    vm.prank(alice);
    usdc.approve(address(cache), type(uint256).max);
  }

  function test_ConstructorPricing() public view {
    assertEq(cache.priceSingle(), 1_000_000);
    assertEq(cache.priceFolder(), 5_000_000);
    assertEq(cache.pricePermanent(), 50_000_000);
  }

  function test_RevertWhen_InitializeZeroUSDC() public {
    address implementation = address(new CachePayments());
    vm.expectRevert(bytes("CachePayments: zero usdc"));
    deployProxy(
      implementation, abi.encodeCall(CachePayments.initialize, (IERC20(address(0)), treasury))
    );
  }

  function test_RevertWhen_InitializeZeroTreasury() public {
    address implementation = address(new CachePayments());
    vm.expectRevert(bytes("CachePayments: zero treasury"));
    deployProxy(implementation, abi.encodeCall(CachePayments.initialize, (usdc, address(0))));
  }

  function test_SetTreasury() public {
    address next = makeAddr("next-treasury");
    vm.expectEmit(true, true, false, true);
    emit CachePayments.TreasuryUpdated(treasury, next);

    vm.prank(treasury);
    cache.setTreasury(next);
    assertEq(cache.treasury(), next);
  }

  function test_RevertWhen_SetTreasuryByNonTreasury() public {
    vm.prank(alice);
    vm.expectRevert(bytes("CachePayments: not treasury"));
    cache.setTreasury(alice);
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

  function test_RevertWhen_USDCReturnsFalse() public {
    // A token that returns false instead of reverting must still trip the
    // "USDC transfer failed" require.
    FalseUSDC falseToken = new FalseUSDC();
    CachePayments falseCache = deployCache(IERC20(address(falseToken)), treasury);

    vm.prank(alice);
    vm.expectRevert(bytes("CachePayments: USDC transfer failed"));
    falseCache.payForCache(FILE_A, CachePayments.Tier.SingleFile, uint64(30 days));
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

  function test_RevertWhen_GrantToZeroAddress() public {
    vm.startPrank(alice);
    cache.payForCache(FILE_A, CachePayments.Tier.Permanent, 0);
    vm.expectRevert(bytes("CachePayments: zero grantee"));
    cache.grantAccess(FILE_A, address(0));
    vm.stopPrank();
  }

  function test_RevertWhen_RevokeByNonOwner() public {
    vm.startPrank(alice);
    cache.payForCache(FILE_A, CachePayments.Tier.Permanent, 0);
    cache.grantAccess(FILE_A, bob);
    vm.stopPrank();

    vm.prank(bob);
    vm.expectRevert(bytes("CachePayments: not owner"));
    cache.revokeAccess(FILE_A, bob);
  }

  function test_RevokeUnknownGranteeIsNoop() public {
    vm.startPrank(alice);
    cache.payForCache(FILE_A, CachePayments.Tier.Permanent, 0);
    cache.grantAccess(FILE_A, bob);
    // Charlie was never granted: the loop finds no match and must leave the
    // allow list untouched.
    cache.revokeAccess(FILE_A, makeAddr("charlie"));
    vm.stopPrank();

    assertEq(cache.allowListLength(FILE_A), 1);
    assertTrue(cache.isAllowed(FILE_A, bob));
  }

  function test_RevokeKeepsOtherGrantees() public {
    address charlie = makeAddr("charlie");
    vm.startPrank(alice);
    cache.payForCache(FILE_A, CachePayments.Tier.Permanent, 0);
    cache.grantAccess(FILE_A, bob);
    cache.grantAccess(FILE_A, charlie);
    cache.revokeAccess(FILE_A, bob); // swap-and-pop with charlie
    vm.stopPrank();

    assertEq(cache.allowListLength(FILE_A), 1);
    assertFalse(cache.isAllowed(FILE_A, bob));
    assertTrue(cache.isAllowed(FILE_A, charlie));
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

  function test_IsAllowed_InactiveEntry() public view {
    // FILE_A was never paid for: entry.active is false.
    assertFalse(cache.isAllowed(FILE_A, alice));
  }

  function test_IsAllowed_UserNotOnAllowList() public {
    vm.startPrank(alice);
    cache.payForCache(FILE_A, CachePayments.Tier.SingleFile, uint64(30 days));
    cache.grantAccess(FILE_A, bob);
    vm.stopPrank();

    // Active, unexpired, but charlie is neither owner nor on the list: the
    // allow-list scan must fall through to false.
    assertFalse(cache.isAllowed(FILE_A, makeAddr("charlie")));
  }

  function test_IsAllowed_PermanentEntryNeverExpires() public {
    vm.startPrank(alice);
    cache.payForCache(FILE_A, CachePayments.Tier.Permanent, 0);
    cache.grantAccess(FILE_A, bob);
    vm.stopPrank();

    vm.warp(block.timestamp + 3650 days);
    assertTrue(cache.isAllowed(FILE_A, bob), "permanent entry (expiresAt == 0) must never expire");
  }

  function test_IsAllowed_ExpiredEntryBlocksOwnerToo() public {
    vm.prank(alice);
    cache.payForCache(FILE_A, CachePayments.Tier.SingleFile, uint64(30 days));

    vm.warp(block.timestamp + 31 days);
    assertFalse(cache.isAllowed(FILE_A, alice), "expiry applies to the owner as well");
  }

  function test_AllowListLength() public {
    assertEq(cache.allowListLength(FILE_A), 0);
    vm.startPrank(alice);
    cache.payForCache(FILE_A, CachePayments.Tier.Permanent, 0);
    cache.grantAccess(FILE_A, bob);
    cache.grantAccess(FILE_A, makeAddr("charlie"));
    vm.stopPrank();
    assertEq(cache.allowListLength(FILE_A), 2);
  }

  function test_PayForCache_ChargesTierPrice() public {
    vm.startPrank(alice);
    uint256 before = usdc.balanceOf(treasury);
    cache.payForCache(FILE_A, CachePayments.Tier.Folder, uint64(30 days));
    assertEq(usdc.balanceOf(treasury) - before, 5_000_000, "Folder tier costs 5 USDC");

    before = usdc.balanceOf(treasury);
    cache.payForCache(keccak256("file-b"), CachePayments.Tier.Permanent, 0);
    assertEq(usdc.balanceOf(treasury) - before, 50_000_000, "Permanent tier costs 50 USDC");
    vm.stopPrank();
  }

  function test_SetPricesEmitsEvent() public {
    vm.expectEmit(false, false, false, true);
    emit CachePayments.PricesUpdated(2_000_000, 10_000_000, 100_000_000);
    vm.prank(treasury);
    cache.setPrices(2_000_000, 10_000_000, 100_000_000);
    assertEq(cache.priceFolder(), 10_000_000);
    assertEq(cache.pricePermanent(), 100_000_000);
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

/// @dev ERC-20 that signals failure by returning false rather than reverting.
/// Only transferFrom is needed — payForCache never reads balances.
contract FalseUSDC {
  function transferFrom(address, address, uint256) external pure returns (bool) {
    return false;
  }
}