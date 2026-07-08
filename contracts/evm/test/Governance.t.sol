// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IVotes} from "@openzeppelin/contracts/governance/utils/IVotes.sol";
import {IGovernor} from "@openzeppelin/contracts/governance/IGovernor.sol";
import "../src/FileOnChainAttestationToken.sol";
import "../src/ValidatorStaking.sol";
import "../src/PlatformRegistry.sol";
import "../src/FileRegistry.sol";
import "../src/governance/FileOnChainTimelock.sol";
import "../src/governance/FileOnChainGovernor.sol";
import {ProxyDeployer} from "./utils/ProxyDeployer.sol";
import {ProxyAdmin} from "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";
import {ITransparentUpgradeableProxy} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";

contract GovernanceTest is Test, ProxyDeployer {
  FileOnChainAttestationToken internal token;
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
    timelock = new FileOnChainTimelock(MIN_DELAY, new address[](0), new address[](0), address(this));
    proxyAdminOwner = address(timelock); // production wiring: timelock owns every ProxyAdmin
    token = deployToken(voter, SUPPLY, address(timelock));
    governor = new FileOnChainGovernor(
      IVotes(address(token)), timelock, VOTING_DELAY, VOTING_PERIOD, PROPOSAL_THRESHOLD
    );
    timelock.grantRole(timelock.PROPOSER_ROLE(), address(governor));
    timelock.grantRole(timelock.CANCELLER_ROLE(), address(governor));
    timelock.grantRole(timelock.EXECUTOR_ROLE(), address(0));

    staking = deployStaking(IERC20(address(token)), 1_000e18, 7 days, address(this));
    platforms = deployPlatforms(2_500, address(this));
    registry = deployRegistry(IERC20(address(token)), staking, platforms, address(timelock), address(this));
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

  function test_GovernanceUpgradesRegistryProxy() public {
    // Upgrades are governance proposals: the timelock owns each ProxyAdmin.
    address registryAdmin = address(uint160(uint256(vm.load(address(registry), adminSlot()))));
    assertEq(ProxyAdmin(registryAdmin).owner(), address(timelock));

    address newImplementation = address(new FileRegistry());
    address[] memory targets = new address[](1);
    targets[0] = registryAdmin;
    uint256[] memory values = new uint256[](1);
    bytes[] memory calldatas = new bytes[](1);
    calldatas[0] = abi.encodeCall(
      ProxyAdmin.upgradeAndCall,
      (ITransparentUpgradeableProxy(payable(address(registry))), newImplementation, "")
    );

    vm.prank(voter);
    uint256 id = governor.propose(targets, values, calldatas, "upgrade registry");
    vm.roll(vm.getBlockNumber() + VOTING_DELAY + 1);
    vm.prank(voter);
    governor.castVote(id, 1);
    vm.roll(vm.getBlockNumber() + VOTING_PERIOD + 1);
    governor.queue(targets, values, calldatas, keccak256(bytes("upgrade registry")));
    vm.warp(vm.getBlockTimestamp() + MIN_DELAY + 1);
    governor.execute(targets, values, calldatas, keccak256(bytes("upgrade registry")));

    // New implementation live, proxy state preserved.
    assertEq(
      address(uint160(uint256(vm.load(address(registry), implementationSlot())))), newImplementation
    );
    assertEq(registry.minTip(), 1e18);
    assertEq(registry.protocolTreasury(), address(timelock));
  }

  function test_RevertWhen_NonTimelockUpgrades() public {
    address registryAdmin = address(uint160(uint256(vm.load(address(registry), adminSlot()))));
    address newImplementation = address(new FileRegistry());
    vm.expectRevert();
    ProxyAdmin(registryAdmin).upgradeAndCall(
      ITransparentUpgradeableProxy(payable(address(registry))), newImplementation, ""
    );
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
