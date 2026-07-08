// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../src/FileOnChainToken.sol";
import "../src/ValidatorStaking.sol";

contract ValidatorStakingTest is Test {
  FileOnChainToken internal token;
  ValidatorStaking internal staking;

  address internal registry = makeAddr("registry");
  address internal alice = makeAddr("alice");
  address internal bob = makeAddr("bob");
  address internal carol = makeAddr("carol");

  uint256 internal constant MIN_STAKE = 1_000e18;
  uint64 internal constant UNBONDING = 7 days;

  function setUp() public {
    token = new FileOnChainToken(address(this), 1_000_000_000e18);
    staking = new ValidatorStaking(IERC20(address(token)), MIN_STAKE, UNBONDING);
    staking.setRegistry(registry);

    token.transfer(alice, 100_000e18);
    token.transfer(bob, 100_000e18);
    token.transfer(carol, 100_000e18);
    token.transfer(registry, 100_000e18);
    vm.prank(alice);
    token.approve(address(staking), type(uint256).max);
    vm.prank(bob);
    token.approve(address(staking), type(uint256).max);
    vm.prank(carol);
    token.approve(address(staking), type(uint256).max);
    vm.prank(registry);
    token.approve(address(staking), type(uint256).max);
  }

  // ---------------------------------------------------------------------
  // Constructor / wiring
  // ---------------------------------------------------------------------

  function test_RevertWhen_ConstructorInvalid() public {
    vm.expectRevert(bytes("ValidatorStaking: zero token"));
    new ValidatorStaking(IERC20(address(0)), MIN_STAKE, UNBONDING);
    vm.expectRevert(bytes("ValidatorStaking: zero min stake"));
    new ValidatorStaking(IERC20(address(token)), 0, UNBONDING);
  }

  function test_SetRegistryOnceOnly() public {
    ValidatorStaking fresh = new ValidatorStaking(IERC20(address(token)), MIN_STAKE, UNBONDING);
    vm.expectRevert(bytes("ValidatorStaking: zero registry"));
    fresh.setRegistry(address(0));
    fresh.setRegistry(registry);
    vm.expectRevert(bytes("ValidatorStaking: registry set"));
    fresh.setRegistry(alice);
  }

  function test_RevertWhen_SetRegistryNotOwner() public {
    ValidatorStaking fresh = new ValidatorStaking(IERC20(address(token)), MIN_STAKE, UNBONDING);
    vm.prank(alice);
    vm.expectRevert();
    fresh.setRegistry(registry);
  }

  function test_ParamSetters() public {
    staking.setMinStake(2_000e18);
    assertEq(staking.minStake(), 2_000e18);
    vm.expectRevert(bytes("ValidatorStaking: zero min stake"));
    staking.setMinStake(0);

    staking.setUnbondingSeconds(3 days);
    assertEq(staking.unbondingSeconds(), 3 days);

    vm.startPrank(alice);
    vm.expectRevert();
    staking.setMinStake(1);
    vm.expectRevert();
    staking.setUnbondingSeconds(1);
    vm.stopPrank();
  }

  // ---------------------------------------------------------------------
  // Stake / activation
  // ---------------------------------------------------------------------

  function test_StakeBelowMinIsInactive() public {
    vm.prank(alice);
    staking.stake(MIN_STAKE - 1);
    assertFalse(staking.isActiveValidator(alice));
    assertEq(staking.activeValidatorCount(), 0);
    assertEq(staking.stakeOf(alice), MIN_STAKE - 1);
    assertEq(staking.totalStaked(), MIN_STAKE - 1);
  }

  function test_StakeActivatesAtMin() public {
    vm.prank(alice);
    staking.stake(MIN_STAKE - 1);
    vm.prank(alice);
    staking.stake(1); // top-up crosses the threshold
    assertTrue(staking.isActiveValidator(alice));
    assertEq(staking.activeValidatorCount(), 1);
    assertEq(staking.validatorAt(0), alice);
  }

  function test_RevertWhen_StakeZero() public {
    vm.prank(alice);
    vm.expectRevert(bytes("ValidatorStaking: zero amount"));
    staking.stake(0);
  }

  // ---------------------------------------------------------------------
  // Unstake / unbonding
  // ---------------------------------------------------------------------

  function test_RequestUnstakeDeactivatesAndSwapPops() public {
    vm.prank(alice);
    staking.stake(MIN_STAKE);
    vm.prank(bob);
    staking.stake(MIN_STAKE);
    vm.prank(carol);
    staking.stake(MIN_STAKE);
    assertEq(staking.activeValidatorCount(), 3);

    // Removing the first entry swaps the last one into its slot.
    vm.prank(alice);
    staking.requestUnstake(1); // drops below min
    assertFalse(staking.isActiveValidator(alice));
    assertEq(staking.activeValidatorCount(), 2);
    assertEq(staking.validatorAt(0), carol);
    assertEq(staking.validatorAt(1), bob);
  }

  function test_RevertWhen_UnstakeMoreThanStaked() public {
    vm.prank(alice);
    staking.stake(MIN_STAKE);
    vm.prank(alice);
    vm.expectRevert(bytes("ValidatorStaking: bad amount"));
    staking.requestUnstake(MIN_STAKE + 1);
  }

  function test_WithdrawUnstakedAfterCooldown() public {
    vm.prank(alice);
    staking.stake(MIN_STAKE);
    vm.prank(alice);
    staking.requestUnstake(MIN_STAKE);

    vm.prank(alice);
    vm.expectRevert(bytes("ValidatorStaking: still unbonding"));
    staking.withdrawUnstaked();

    vm.warp(block.timestamp + UNBONDING);
    uint256 before = token.balanceOf(alice);
    vm.prank(alice);
    staking.withdrawUnstaked();
    assertEq(token.balanceOf(alice), before + MIN_STAKE);
  }

  function test_RevertWhen_NothingUnbonding() public {
    vm.prank(alice);
    vm.expectRevert(bytes("ValidatorStaking: nothing unbonding"));
    staking.withdrawUnstaked();
  }

  function test_NewUnstakeRequestRestartsCooldown() public {
    vm.startPrank(alice);
    staking.stake(2 * MIN_STAKE);
    staking.requestUnstake(MIN_STAKE / 2);
    vm.warp(block.timestamp + UNBONDING - 1);
    staking.requestUnstake(MIN_STAKE / 2); // merges + restarts the clock
    vm.expectRevert(bytes("ValidatorStaking: still unbonding"));
    staking.withdrawUnstaked();
    vm.warp(block.timestamp + UNBONDING);
    staking.withdrawUnstaked();
    vm.stopPrank();
    assertEq(staking.stakeOf(alice), MIN_STAKE);
  }

  // ---------------------------------------------------------------------
  // Rewards
  // ---------------------------------------------------------------------

  function test_RewardsProRata() public {
    vm.prank(alice);
    staking.stake(1_000e18);
    vm.prank(bob);
    staking.stake(3_000e18);

    vm.prank(registry);
    staking.notifyReward(400e18);

    assertEq(staking.pendingRewards(alice), 100e18);
    assertEq(staking.pendingRewards(bob), 300e18);

    uint256 before = token.balanceOf(alice);
    vm.prank(alice);
    staking.claimRewards();
    assertEq(token.balanceOf(alice), before + 100e18);
    assertEq(staking.pendingRewards(alice), 0);
  }

  function test_LateStakerEarnsNothingFromEarlierRewards() public {
    vm.prank(alice);
    staking.stake(1_000e18);
    vm.prank(registry);
    staking.notifyReward(100e18);

    vm.prank(bob);
    staking.stake(1_000e18);
    assertEq(staking.pendingRewards(bob), 0);

    vm.prank(registry);
    staking.notifyReward(100e18);
    assertEq(staking.pendingRewards(alice), 150e18);
    assertEq(staking.pendingRewards(bob), 50e18);
  }

  function test_RevertWhen_ClaimNothing() public {
    vm.prank(alice);
    vm.expectRevert(bytes("ValidatorStaking: nothing to claim"));
    staking.claimRewards();
  }

  function test_RevertWhen_NotifyRewardGuards() public {
    vm.prank(alice);
    vm.expectRevert(bytes("ValidatorStaking: not registry"));
    staking.notifyReward(1e18);

    vm.startPrank(registry);
    vm.expectRevert(bytes("ValidatorStaking: zero amount"));
    staking.notifyReward(0);
    vm.expectRevert(bytes("ValidatorStaking: no stake"));
    staking.notifyReward(1e18);
    vm.stopPrank();
  }

  function testFuzz_RewardsProRata(uint256 stakeA, uint256 stakeB, uint256 reward) public {
    stakeA = bound(stakeA, 1e18, 1_000_000e18);
    stakeB = bound(stakeB, 1e18, 1_000_000e18);
    reward = bound(reward, 1e18, 1_000_000e18);
    deal(address(token), alice, stakeA);
    deal(address(token), bob, stakeB);

    vm.prank(alice);
    staking.stake(stakeA);
    vm.prank(bob);
    staking.stake(stakeB);
    deal(address(token), registry, reward);
    vm.prank(registry);
    staking.notifyReward(reward);

    uint256 total = staking.pendingRewards(alice) + staking.pendingRewards(bob);
    assertLe(total, reward);
    // Accumulator floor rounding strands at most ~totalStaked/PRECISION wei.
    assertGe(total + (stakeA + stakeB) / 1e12 + 2, reward);
  }

  // ---------------------------------------------------------------------
  // Slashing
  // ---------------------------------------------------------------------

  function test_SlashActiveStake() public {
    vm.prank(alice);
    staking.stake(MIN_STAKE);
    vm.prank(registry);
    uint256 slashed = staking.slash(alice, 100e18, carol);
    assertEq(slashed, 100e18);
    assertEq(staking.stakeOf(alice), MIN_STAKE - 100e18);
    assertEq(token.balanceOf(carol), 100_000e18 + 100e18);
    assertFalse(staking.isActiveValidator(alice)); // dropped below min
  }

  function test_SlashSpillsIntoUnbonding() public {
    vm.startPrank(alice);
    staking.stake(2 * MIN_STAKE);
    staking.requestUnstake(MIN_STAKE);
    vm.stopPrank();

    // Slash more than the active stake: remainder comes from unbonding.
    vm.prank(registry);
    uint256 slashed = staking.slash(alice, MIN_STAKE + 500e18, carol);
    assertEq(slashed, MIN_STAKE + 500e18);
    assertEq(staking.stakeOf(alice), 0);
    assertEq(staking.stakeInfo(alice).unbondingAmount, MIN_STAKE - 500e18);
  }

  function test_SlashCapsAtAvailable() public {
    vm.prank(alice);
    staking.stake(MIN_STAKE);
    vm.prank(registry);
    uint256 slashed = staking.slash(alice, 10 * MIN_STAKE, carol);
    assertEq(slashed, MIN_STAKE);
    assertEq(staking.stakeOf(alice), 0);
  }

  function test_SlashNothingStakedReturnsZero() public {
    vm.prank(registry);
    uint256 slashed = staking.slash(alice, 100e18, carol);
    assertEq(slashed, 0);
  }

  function test_RevertWhen_SlashGuards() public {
    vm.prank(alice);
    vm.expectRevert(bytes("ValidatorStaking: not registry"));
    staking.slash(bob, 1e18, alice);

    vm.prank(registry);
    vm.expectRevert(bytes("ValidatorStaking: zero beneficiary"));
    staking.slash(bob, 1e18, address(0));
  }
}
