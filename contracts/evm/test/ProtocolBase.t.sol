// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../src/FileOnChainAttestationToken.sol";
import "../src/ValidatorStaking.sol";
import "../src/PlatformRegistry.sol";
import "../src/FileRegistry.sol";

/// @notice Shared fixture for the anchor-protocol tests: token, staking with
/// six active validators, a registered platform, and a wired FileRegistry.
abstract contract ProtocolBase is Test {
  FileOnChainAttestationToken internal token;
  ValidatorStaking internal staking;
  PlatformRegistry internal platforms;
  FileRegistry internal registry;

  address internal protocolTreasury = makeAddr("protocolTreasury");
  address internal platformOwner = makeAddr("platformOwner");
  address internal platformTreasury = makeAddr("platformTreasury");
  address internal alice = makeAddr("alice"); // proposer
  address internal bob = makeAddr("bob"); // challenger

  uint256 internal constant PLATFORM_ID = 1;
  uint256 internal constant MIN_STAKE = 1_000e18;
  uint256 internal constant STAKE = 1_000e18;
  uint256 internal constant TIP = 100e18;
  uint256 internal constant PROPOSE_BOND = 100e18;
  uint256 internal constant CHALLENGE_BOND = 100e18;

  bytes32 internal constant CID_A = keccak256("bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi");
  bytes32 internal constant CID_B = keccak256("bafybeibv3zaicqsdwfmq5dym6ipxzl5qxksirv3d3uyzjqhs2dtx3w3c3q");
  bytes32 internal constant CONTENT_A = keccak256("hello world");
  bytes32 internal constant CONTENT_B = keccak256("goodbye world");

  address[6] internal validators;

  function setUp() public virtual {
    token = new FileOnChainAttestationToken(address(this), 1_000_000_000e18);
    staking = new ValidatorStaking(IERC20(address(token)), MIN_STAKE, 7 days);
    platforms = new PlatformRegistry(2_500);
    registry = new FileRegistry(IERC20(address(token)), staking, platforms, protocolTreasury);
    staking.setRegistry(address(registry));
    platforms.registerPlatform(platformOwner, platformTreasury, 2_500);

    token.transfer(alice, 10_000e18);
    token.transfer(bob, 10_000e18);
    for (uint256 i = 0; i < validators.length; i++) {
      validators[i] = makeAddr(string(abi.encodePacked("validator", vm.toString(i))));
      token.transfer(validators[i], 10_000e18);
      vm.startPrank(validators[i]);
      token.approve(address(staking), type(uint256).max);
      staking.stake(STAKE);
      vm.stopPrank();
    }
    vm.prank(alice);
    token.approve(address(registry), type(uint256).max);
    vm.prank(bob);
    token.approve(address(registry), type(uint256).max);
  }

  function proposeDefault() internal returns (uint256 proposalId) {
    vm.prank(alice);
    proposalId = registry.proposeAnchor(CID_A, CONTENT_A, "ipfs://bafy.../file", PLATFORM_ID, TIP);
  }

  function warpPastChallengeWindow() internal {
    vm.warp(block.timestamp + registry.challengeWindowSeconds() + 1);
  }

  function warpPastVoteWindow() internal {
    vm.warp(block.timestamp + registry.voteWindowSeconds() + 1);
  }
}
