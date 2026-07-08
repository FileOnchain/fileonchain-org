// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IVotes} from "@openzeppelin/contracts/governance/utils/IVotes.sol";
import {IGovernor} from "@openzeppelin/contracts/governance/IGovernor.sol";
import "../src/FOCATToken.sol";
import "../src/ValidatorStaking.sol";
import "../src/PlatformRegistry.sol";
import "../src/FileRegistry.sol";
import "../src/governance/FileOnChainTimelock.sol";
import "../src/governance/FileOnChainGovernor.sol";

contract GovernanceTest is Test {
  FOCATToken internal token;
  FileOnChainTimelock internal timelock;
  FileOnChainGovernor internal governor;
  ValidatorStaking internal staking;
  PlatformRegistry internal platforms;
  FileRegistry internal registry;

  address internal voter = makeAddr("voter");

  uint256 internal constant SUPPLY = 1_000_000_000e18;
  uint256 internal constant MIN_DELAY = 2 days;
  uint48 internal constant VOTING_DELAY = 7_200;
  uint32 internal constant VOTING_PERIOD = 50_400;
  uint256 internal constant PROPOSAL_THRESHOLD = 100_000e18;

  function setUp() public {
    token = new FOCATToken(voter, SUPPLY);
    timelock = new FileOnChainTimelock(MIN_DELAY, new address[](0), new address[](0), address(this));
    governor = new FileOnChainGovernor(
      IVotes(address(token)), timelock, VOTING_DELAY, VOTING_PERIOD, PROPOSAL_THRESHOLD
    );
    timelock.grantRole(timelock.PROPOSER_ROLE(), address(governor));
    timelock.grantRole(timelock.CANCELLER_ROLE(), address(governor));
    timelock.grantRole(timelock.EXECUTOR_ROLE(), address(0));

    staking = new ValidatorStaking(IERC20(address(token)), 1_000e18, 7 days);
    platforms = new PlatformRegistry(2_500);
    registry = new FileRegistry(IERC20(address(token)), staking, platforms, address(timelock));
    staking.setRegistry(address(registry));
    staking.transferOwnership(address(timelock));
    platforms.transferOwnership(address(timelock));
    registry.transferOwnership(address(timelock));
    timelock.renounceRole(timelock.DEFAULT_ADMIN_ROLE(), address(this));

    vm.prank(voter);
    token.delegate(voter);
    vm.roll(vm.getBlockNumber() + 1); // checkpoint the delegation before proposing
  }

  function proposeSetFeeSplit()
    internal
    returns (uint256 proposalId, address[] memory targets, uint256[] memory values, bytes[] memory calldatas)
  {
    targets = new address[](1);
    targets[0] = address(registry);
    values = new uint256[](1);
    calldatas = new bytes[](1);
    calldatas[0] = abi.encodeCall(FileRegistry.setFeeSplit, (7_000, 2_000, 1_000));
    vm.prank(voter);
    proposalId = governor.propose(targets, values, calldatas, "rebalance fee split");
  }

  function test_EndToEndParameterChange() public {
    (uint256 id, address[] memory targets, uint256[] memory values, bytes[] memory calldatas) =
      proposeSetFeeSplit();
    assertEq(uint8(governor.state(id)), uint8(IGovernor.ProposalState.Pending));

    vm.roll(vm.getBlockNumber() + VOTING_DELAY + 1);
    assertEq(uint8(governor.state(id)), uint8(IGovernor.ProposalState.Active));
    vm.prank(voter);
    governor.castVote(id, 1); // For

    vm.roll(vm.getBlockNumber() + VOTING_PERIOD + 1);
    assertEq(uint8(governor.state(id)), uint8(IGovernor.ProposalState.Succeeded));

    governor.queue(targets, values, calldatas, keccak256(bytes("rebalance fee split")));
    assertEq(uint8(governor.state(id)), uint8(IGovernor.ProposalState.Queued));

    vm.warp(vm.getBlockTimestamp() + MIN_DELAY + 1);
    governor.execute(targets, values, calldatas, keccak256(bytes("rebalance fee split")));

    assertEq(registry.validatorBps(), 7_000);
    assertEq(registry.platformBps(), 2_000);
    assertEq(registry.protocolBps(), 1_000);
  }

  function test_DefeatedProposalCannotExecute() public {
    (uint256 id, address[] memory targets, uint256[] memory values, bytes[] memory calldatas) =
      proposeSetFeeSplit();

    vm.roll(vm.getBlockNumber() + VOTING_DELAY + 1);
    vm.prank(voter);
    governor.castVote(id, 0); // Against
    vm.roll(vm.getBlockNumber() + VOTING_PERIOD + 1);

    assertEq(uint8(governor.state(id)), uint8(IGovernor.ProposalState.Defeated));
    vm.expectRevert();
    governor.queue(targets, values, calldatas, keccak256(bytes("rebalance fee split")));
    assertEq(registry.validatorBps(), 6_000);
  }

  function test_RevertWhen_ProposerBelowThreshold() public {
    address pleb = makeAddr("pleb");
    address[] memory targets = new address[](1);
    targets[0] = address(registry);
    uint256[] memory values = new uint256[](1);
    bytes[] memory calldatas = new bytes[](1);
    calldatas[0] = abi.encodeCall(FileRegistry.setMinTip, (1));

    vm.prank(pleb);
    vm.expectRevert();
    governor.propose(targets, values, calldatas, "no stake no say");
  }

  function test_RevertWhen_FormerOwnerCallsSetters() public {
    // Ownership moved to the timelock: the deployer path is closed.
    vm.expectRevert();
    registry.setFeeSplit(7_000, 2_000, 1_000);
    vm.expectRevert();
    staking.setMinStake(1);
    vm.expectRevert();
    platforms.setMaxPlatformFeeBps(1);
  }

  function test_GovernorSettings() public view {
    assertEq(governor.votingDelay(), VOTING_DELAY);
    assertEq(governor.votingPeriod(), VOTING_PERIOD);
    assertEq(governor.proposalThreshold(), PROPOSAL_THRESHOLD);
    assertEq(governor.quorumNumerator(), 4);
    assertEq(address(governor.timelock()), address(timelock));
    assertEq(governor.name(), "FileOnChainGovernor");
  }
}
