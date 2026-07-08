// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/FileOnChainToken.sol";

contract FileOnChainTokenTest is Test {
  FileOnChainToken internal token;

  address internal alice;
  uint256 internal alicePk;
  address internal bob = makeAddr("bob");

  uint256 internal constant SUPPLY = 1_000_000_000e18;

  function setUp() public {
    (alice, alicePk) = makeAddrAndKey("alice");
    token = new FileOnChainToken(address(this), SUPPLY);
  }

  function test_Metadata() public view {
    assertEq(token.name(), "FileOnChain");
    assertEq(token.symbol(), "FOC");
    assertEq(token.decimals(), 18);
  }

  function test_FixedSupplyMintedToHolder() public view {
    assertEq(token.totalSupply(), SUPPLY);
    assertEq(token.balanceOf(address(this)), SUPPLY);
  }

  function test_RevertWhen_ZeroHolder() public {
    vm.expectRevert(bytes("FOCToken: zero holder"));
    new FileOnChainToken(address(0), SUPPLY);
  }

  function test_VotesTrackDelegation() public {
    token.transfer(alice, 100e18);
    assertEq(token.getVotes(alice), 0); // no votes until delegated

    vm.prank(alice);
    token.delegate(alice);
    assertEq(token.getVotes(alice), 100e18);

    // Transfers move voting power between delegated accounts.
    vm.prank(bob);
    token.delegate(bob);
    vm.prank(alice);
    token.transfer(bob, 40e18);
    assertEq(token.getVotes(alice), 60e18);
    assertEq(token.getVotes(bob), 40e18);
  }

  function test_PastVotesCheckpointed() public {
    // Explicit block literals: with via_ir the optimizer may treat a
    // block.number read as invariant across vm.roll within one test.
    token.transfer(alice, 100e18);
    vm.roll(5);
    vm.prank(alice);
    token.delegate(alice); // checkpoint at block 5

    vm.roll(15);
    vm.prank(alice);
    token.transfer(bob, 100e18); // checkpoint at block 15

    assertEq(token.getPastVotes(alice, 5), 100e18);
    assertEq(token.getVotes(alice), 0);
  }

  function test_Permit() public {
    token.transfer(alice, 100e18);
    uint256 deadline = block.timestamp + 1 hours;

    bytes32 structHash = keccak256(
      abi.encode(
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
        alice,
        bob,
        50e18,
        token.nonces(alice),
        deadline
      )
    );
    bytes32 digest = keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), structHash));
    (uint8 v, bytes32 r, bytes32 s) = vm.sign(alicePk, digest);

    token.permit(alice, bob, 50e18, deadline, v, r, s);
    assertEq(token.allowance(alice, bob), 50e18);
    assertEq(token.nonces(alice), 1);

    vm.prank(bob);
    token.transferFrom(alice, bob, 50e18);
    assertEq(token.balanceOf(bob), 50e18);
  }
}
