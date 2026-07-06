// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/mocks/MockUSDC.sol";

contract MockUSDCTest is Test {
  MockUSDC internal usdc;
  address internal alice = makeAddr("alice");
  address internal bob = makeAddr("bob");

  function setUp() public {
    usdc = new MockUSDC();
  }

  function test_Metadata() public view {
    assertEq(usdc.name(), "USD Coin");
    assertEq(usdc.symbol(), "USDC");
    assertEq(usdc.decimals(), 6);
  }

  function test_Mint() public {
    usdc.mint(alice, 5_000_000);
    assertEq(usdc.balanceOf(alice), 5_000_000);
    assertEq(usdc.totalSupply(), 5_000_000);
  }

  function test_Burn() public {
    usdc.mint(alice, 5_000_000);
    usdc.burn(alice, 2_000_000);
    assertEq(usdc.balanceOf(alice), 3_000_000);
    assertEq(usdc.totalSupply(), 3_000_000);
  }

  function test_RevertWhen_BurnExceedsBalance() public {
    usdc.mint(alice, 1_000_000);
    vm.expectRevert(bytes("MockUSDC: insufficient balance"));
    usdc.burn(alice, 2_000_000);
  }

  function test_Transfer() public {
    usdc.mint(alice, 5_000_000);
    vm.prank(alice);
    assertTrue(usdc.transfer(bob, 1_500_000));
    assertEq(usdc.balanceOf(alice), 3_500_000);
    assertEq(usdc.balanceOf(bob), 1_500_000);
  }

  function test_RevertWhen_TransferExceedsBalance() public {
    usdc.mint(alice, 1_000_000);
    vm.prank(alice);
    vm.expectRevert(bytes("MockUSDC: insufficient balance"));
    usdc.transfer(bob, 2_000_000);
  }

  function test_Approve() public {
    vm.prank(alice);
    assertTrue(usdc.approve(bob, 1_000_000));
    assertEq(usdc.allowance(alice, bob), 1_000_000);
  }

  function test_TransferFrom_DecrementsFiniteAllowance() public {
    usdc.mint(alice, 5_000_000);
    vm.prank(alice);
    usdc.approve(bob, 2_000_000);

    vm.prank(bob);
    assertTrue(usdc.transferFrom(alice, bob, 1_500_000));
    assertEq(usdc.allowance(alice, bob), 500_000);
    assertEq(usdc.balanceOf(bob), 1_500_000);
  }

  function test_TransferFrom_MaxAllowanceIsNotDecremented() public {
    usdc.mint(alice, 5_000_000);
    vm.prank(alice);
    usdc.approve(bob, type(uint256).max);

    vm.prank(bob);
    usdc.transferFrom(alice, bob, 1_000_000);
    assertEq(usdc.allowance(alice, bob), type(uint256).max, "infinite approval must stay infinite");
  }

  function test_RevertWhen_TransferFromExceedsAllowance() public {
    usdc.mint(alice, 5_000_000);
    vm.prank(alice);
    usdc.approve(bob, 1_000_000);

    vm.prank(bob);
    vm.expectRevert(bytes("MockUSDC: insufficient allowance"));
    usdc.transferFrom(alice, bob, 2_000_000);
  }

  function test_RevertWhen_TransferFromExceedsBalance() public {
    usdc.mint(alice, 1_000_000);
    vm.prank(alice);
    usdc.approve(bob, type(uint256).max);

    vm.prank(bob);
    vm.expectRevert(bytes("MockUSDC: insufficient balance"));
    usdc.transferFrom(alice, bob, 2_000_000);
  }
}
