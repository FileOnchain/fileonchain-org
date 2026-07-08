// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {IERC20 as OZIERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IVotes} from "@openzeppelin/contracts/governance/utils/IVotes.sol";
import {FileOnChainToken} from "../src/FileOnChainToken.sol";
import {ValidatorStaking} from "../src/ValidatorStaking.sol";
import {PlatformRegistry} from "../src/PlatformRegistry.sol";
import {FileRegistry} from "../src/FileRegistry.sol";
import {FileOnChainTimelock} from "../src/governance/FileOnChainTimelock.sol";
import {FileOnChainGovernor} from "../src/governance/FileOnChainGovernor.sol";
import {CachePayments, IERC20} from "../src/CachePayments.sol";
import {DonationEscrow} from "../src/DonationEscrow.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

/// @notice Deploys the anchor protocol suite — FOC token, timelock +
/// governor, ValidatorStaking, PlatformRegistry, FileRegistry — plus
/// MockUSDC, CachePayments, and DonationEscrow, then hands every protocol
/// contract to the timelock (the governor is its only proposer and the
/// protocol treasury). Env vars:
///   PRIVATE_KEY                 required deployer key
///   TREASURY_ADDRESS            required; CachePayments/DonationEscrow treasury
///   PLATFORM_TREASURY_ADDRESS   optional; FileOnChain platform treasury (default: TREASURY_ADDRESS)
///   TOKEN_INITIAL_SUPPLY        optional; FOC supply minted to deployer (default 1e27)
///   TIMELOCK_MIN_DELAY          optional; seconds (default 2 days)
///   GOVERNOR_VOTING_DELAY       optional; blocks (default 7200 ~ 1 day)
///   GOVERNOR_VOTING_PERIOD      optional; blocks (default 50400 ~ 1 week)
///   GOVERNOR_PROPOSAL_THRESHOLD optional; FOC base units (default 100k FOC)
///   USDC_ADDRESS                optional; deploys MockUSDC when unset
/// Run with: `forge script script/Deploy.s.sol --rpc-url $RPC --broadcast`
contract Deploy is Script {
  // Exposed for wiring assertions in Deploy.t.sol.
  FileOnChainToken public token;
  FileOnChainTimelock public timelock;
  FileOnChainGovernor public governor;
  ValidatorStaking public staking;
  PlatformRegistry public platforms;
  FileRegistry public registry;
  CachePayments public cache;
  DonationEscrow public escrow;

  function run() external {
    uint256 pk = vm.envUint("PRIVATE_KEY");
    address treasury = vm.envAddress("TREASURY_ADDRESS");
    address platformTreasury = vm.envOr("PLATFORM_TREASURY_ADDRESS", treasury);
    uint256 initialSupply = vm.envOr("TOKEN_INITIAL_SUPPLY", uint256(1_000_000_000e18));
    uint256 timelockMinDelay = vm.envOr("TIMELOCK_MIN_DELAY", uint256(2 days));
    uint48 votingDelay = uint48(vm.envOr("GOVERNOR_VOTING_DELAY", uint256(7_200)));
    uint32 votingPeriod = uint32(vm.envOr("GOVERNOR_VOTING_PERIOD", uint256(50_400)));
    uint256 proposalThreshold = vm.envOr("GOVERNOR_PROPOSAL_THRESHOLD", uint256(100_000e18));
    address usdc = vm.envOr("USDC_ADDRESS", address(0));
    address deployer = vm.addr(pk);

    vm.startBroadcast(pk);

    token = new FileOnChainToken(deployer, initialSupply);
    console.log("FileOnChainToken deployed at:", address(token));

    timelock = new FileOnChainTimelock(timelockMinDelay, new address[](0), new address[](0), deployer);
    console.log("FileOnChainTimelock deployed at:", address(timelock));

    governor = new FileOnChainGovernor(
      IVotes(address(token)), timelock, votingDelay, votingPeriod, proposalThreshold
    );
    console.log("FileOnChainGovernor deployed at:", address(governor));

    // Governor proposes and cancels; anyone may execute after the delay.
    timelock.grantRole(timelock.PROPOSER_ROLE(), address(governor));
    timelock.grantRole(timelock.CANCELLER_ROLE(), address(governor));
    timelock.grantRole(timelock.EXECUTOR_ROLE(), address(0));

    staking = new ValidatorStaking(OZIERC20(address(token)), 1_000e18, 7 days);
    console.log("ValidatorStaking deployed at:", address(staking));

    platforms = new PlatformRegistry(2_500);
    console.log("PlatformRegistry deployed at:", address(platforms));

    // The timelock is the protocol treasury: tip shares accrue to it and
    // spending them is a governance proposal.
    registry = new FileRegistry(OZIERC20(address(token)), staking, platforms, address(timelock));
    console.log("FileRegistry deployed at:", address(registry));

    staking.setRegistry(address(registry));
    uint256 fileOnChainPlatformId = platforms.registerPlatform(deployer, platformTreasury, 2_500);
    console.log("FileOnChain platform id:", fileOnChainPlatformId);

    // Hand every protocol contract to governance, then drop the deployer's
    // timelock admin so only the governor path remains.
    staking.transferOwnership(address(timelock));
    platforms.transferOwnership(address(timelock));
    registry.transferOwnership(address(timelock));
    timelock.renounceRole(timelock.DEFAULT_ADMIN_ROLE(), deployer);

    if (usdc == address(0)) {
      MockUSDC mockUsdc = new MockUSDC();
      usdc = address(mockUsdc);
      console.log("MockUSDC deployed at:", usdc);
    }

    cache = new CachePayments(IERC20(usdc), treasury);
    console.log("CachePayments deployed at:", address(cache));

    escrow = new DonationEscrow(treasury);
    console.log("DonationEscrow deployed at:", address(escrow));

    vm.stopBroadcast();
  }
}
