// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/FileOnChainAttestationToken.sol";
import {ProxyDeployer} from "./utils/ProxyDeployer.sol";

contract FileOnChainAttestationTokenTest is Test, ProxyDeployer {
  FileOnChainAttestationToken internal token;

  address internal alice;
  uint256 internal alicePk;
  address internal bob = makeAddr("bob");
  address internal bridge = makeAddr("bridge");

  uint256 internal constant SUPPLY = 1_000_000_000e18;
  uint256 internal constant MINT_LIMIT = 1_000e18;
  uint256 internal constant BURN_LIMIT = 500e18;

  function setUp() public {
    (alice, alicePk) = makeAddrAndKey("alice");
    token = deployToken(address(this), SUPPLY, address(this));
  }

  function grantBridge() internal {
    token.setBridgeLimits(bridge, MINT_LIMIT, BURN_LIMIT);
  }

  // ---------------------------------------------------------------------
  // Metadata / initialization
  // ---------------------------------------------------------------------

  function test_Metadata() public view {
    assertEq(token.name(), "File On Chain Attestation Token");
    assertEq(token.symbol(), "FOCAT");
    assertEq(token.decimals(), 18);
  }

  function test_FixedSupplyMintedToHolder() public view {
    assertEq(token.totalSupply(), SUPPLY);
    assertEq(token.balanceOf(address(this)), SUPPLY);
  }

  function test_RevertWhen_ZeroHolderWithSupply() public {
    address implementation = address(new FileOnChainAttestationToken());
    vm.expectRevert(bytes("FOCAT: zero holder"));
    deployProxy(
      implementation,
      abi.encodeCall(FileOnChainAttestationToken.initialize, (address(0), SUPPLY, address(this)))
    );
  }

  function test_RemoteChainInitializesWithZeroSupply() public {
    // Remote deployments mint nothing — supply arrives through bridges.
    FileOnChainAttestationToken remote = deployToken(address(0), 0, address(this));
    assertEq(remote.totalSupply(), 0);
  }

  function test_RevertWhen_InitializeTwice() public {
    vm.expectRevert();
    token.initialize(address(this), SUPPLY, address(this));
  }

  function test_RevertWhen_ImplementationInitialized() public {
    // _disableInitializers in the constructor locks the raw implementation.
    FileOnChainAttestationToken implementation = new FileOnChainAttestationToken();
    vm.expectRevert();
    implementation.initialize(address(this), SUPPLY, address(this));
  }

  // ---------------------------------------------------------------------
  // Bridging (ERC-7802 with xERC20-style rate limits)
  // ---------------------------------------------------------------------

  function test_SetBridgeLimits() public {
    vm.expectEmit(true, true, true, true);
    emit FileOnChainAttestationToken.BridgeLimitsSet(bridge, MINT_LIMIT, BURN_LIMIT);
    grantBridge();
    assertEq(token.mintingMaxLimitOf(bridge), MINT_LIMIT);
    assertEq(token.burningMaxLimitOf(bridge), BURN_LIMIT);
    assertEq(token.mintingCurrentLimitOf(bridge), MINT_LIMIT);
    assertEq(token.burningCurrentLimitOf(bridge), BURN_LIMIT);
  }

  function test_RevertWhen_SetBridgeLimitsNotOwner() public {
    vm.prank(alice);
    vm.expectRevert();
    token.setBridgeLimits(bridge, 1, 1);
  }

  function test_CrosschainMintWithinLimit() public {
    grantBridge();
    vm.expectEmit(true, true, true, true);
    emit IERC7802.CrosschainMint(alice, 400e18, bridge);
    vm.prank(bridge);
    token.crosschainMint(alice, 400e18);

    assertEq(token.balanceOf(alice), 400e18);
    assertEq(token.totalSupply(), SUPPLY + 400e18);
    assertEq(token.mintingCurrentLimitOf(bridge), MINT_LIMIT - 400e18);
  }

  function test_RevertWhen_MintExceedsLimit() public {
    grantBridge();
    vm.prank(bridge);
    vm.expectRevert(bytes("FOCAT: mint limit exceeded"));
    token.crosschainMint(alice, MINT_LIMIT + 1);
  }

  function test_RevertWhen_UnapprovedBridgeMints() public {
    vm.prank(alice); // never granted limits
    vm.expectRevert(bytes("FOCAT: mint limit exceeded"));
    token.crosschainMint(alice, 1);
  }

  function test_CrosschainBurnFromSelf() public {
    grantBridge();
    token.transfer(bridge, 300e18);

    vm.expectEmit(true, true, true, true);
    emit IERC7802.CrosschainBurn(bridge, 300e18, bridge);
    vm.prank(bridge);
    token.crosschainBurn(bridge, 300e18);

    assertEq(token.balanceOf(bridge), 0);
    assertEq(token.totalSupply(), SUPPLY - 300e18);
    assertEq(token.burningCurrentLimitOf(bridge), BURN_LIMIT - 300e18);
  }

  function test_CrosschainBurnFromHolderSpendsAllowance() public {
    grantBridge();
    token.transfer(alice, 300e18);
    vm.prank(alice);
    token.approve(bridge, 200e18);

    vm.prank(bridge);
    token.crosschainBurn(alice, 200e18);
    assertEq(token.balanceOf(alice), 100e18);
    assertEq(token.allowance(alice, bridge), 0);

    // Without allowance the burn behaves like transferFrom and reverts.
    vm.prank(bridge);
    vm.expectRevert();
    token.crosschainBurn(alice, 100e18);
  }

  function test_RevertWhen_BurnExceedsLimit() public {
    grantBridge();
    token.transfer(bridge, BURN_LIMIT + 1);
    vm.prank(bridge);
    vm.expectRevert(bytes("FOCAT: burn limit exceeded"));
    token.crosschainBurn(bridge, BURN_LIMIT + 1);
  }

  function test_LimitsReplenishLinearly() public {
    grantBridge();
    vm.prank(bridge);
    token.crosschainMint(alice, MINT_LIMIT); // exhaust the mint limit
    assertEq(token.mintingCurrentLimitOf(bridge), 0);

    // Half the window restores half the limit; a full window restores all.
    // (vm.getBlockTimestamp: via_ir may CSE plain block.timestamp across warps.)
    vm.warp(vm.getBlockTimestamp() + 12 hours);
    assertEq(token.mintingCurrentLimitOf(bridge), MINT_LIMIT / 2);
    vm.warp(vm.getBlockTimestamp() + 12 hours);
    assertEq(token.mintingCurrentLimitOf(bridge), MINT_LIMIT);

    // Replenished capacity is spendable again.
    vm.prank(bridge);
    token.crosschainMint(alice, MINT_LIMIT);
  }

  function test_RevokedBridgeCannotMint() public {
    grantBridge();
    token.setBridgeLimits(bridge, 0, 0);
    vm.prank(bridge);
    vm.expectRevert(bytes("FOCAT: mint limit exceeded"));
    token.crosschainMint(alice, 1);
  }

  function test_SupportsIERC7802() public view {
    assertTrue(token.supportsInterface(type(IERC7802).interfaceId));
    assertFalse(token.supportsInterface(0xdeadbeef));
  }

  // ---------------------------------------------------------------------
  // Votes / permit (unchanged behavior behind the proxy)
  // ---------------------------------------------------------------------

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
