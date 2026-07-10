// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {IERC20 as OZIERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IVotes} from "@openzeppelin/contracts/governance/utils/IVotes.sol";
import {TransparentUpgradeableProxy} from
  "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import {FileOnChainAttestationToken} from "../src/FileOnChainAttestationToken.sol";
import {ValidatorStaking} from "../src/ValidatorStaking.sol";
import {PlatformRegistry} from "../src/PlatformRegistry.sol";
import {FileRegistry} from "../src/FileRegistry.sol";
import {FileOnChainTimelock} from "../src/governance/FileOnChainTimelock.sol";
import {FileOnChainGovernor} from "../src/governance/FileOnChainGovernor.sol";
import {CachePayments, IERC20} from "../src/CachePayments.sol";
import {DonationEscrow} from "../src/DonationEscrow.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

/// @notice Deploys the anchor protocol suite — FOCAT token, timelock +
/// governor, ValidatorStaking, PlatformRegistry, FileRegistry — plus
/// MockUSDC, CachePayments, and DonationEscrow, then hands every protocol
/// contract to the timelock (the governor is its only proposer and the
/// protocol treasury).
///
/// Every protocol contract deploys behind an OZ TransparentUpgradeableProxy
/// whose auto-created ProxyAdmin is owned by the timelock, so upgrades are
/// governance proposals. Governor and Timelock themselves stay immutable —
/// a governor migration is a proposer-role rotation on the timelock.
///
/// Env vars:
///   PRIVATE_KEY                 optional deployer key; when unset, broadcast
///                               uses the keystore account passed via
///                               `--account <name>` (cast wallet import)
///   TREASURY_ADDRESS            required; CachePayments/DonationEscrow treasury
///   PLATFORM_TREASURY_ADDRESS   optional; FileOnChain platform treasury (default: TREASURY_ADDRESS)
///   TOKEN_INITIAL_SUPPLY        optional; FOCAT minted to deployer (default 1e27).
///                               Set 0 on remote chains — supply arrives via bridges.
///   TIMELOCK_MIN_DELAY          optional; seconds (default 2 days)
///   GOVERNOR_VOTING_DELAY       optional; blocks (default 7200 ~ 1 day)
///   GOVERNOR_VOTING_PERIOD      optional; blocks (default 50400 ~ 1 week)
///   GOVERNOR_PROPOSAL_THRESHOLD optional; FOCAT base units (default 100k FOCAT)
///   USDC_ADDRESS                optional; deploys MockUSDC when unset
/// Run with: `forge script script/Deploy.s.sol --rpc-url $RPC --broadcast`
contract Deploy is Script {
  // Exposed for wiring assertions in Deploy.t.sol (proxy addresses).
  FileOnChainAttestationToken public token;
  FileOnChainTimelock public timelock;
  FileOnChainGovernor public governor;
  ValidatorStaking public staking;
  PlatformRegistry public platforms;
  FileRegistry public registry;
  CachePayments public cache;
  DonationEscrow public escrow;

  /// @dev Deploy `implementation` behind a transparent proxy whose
  /// ProxyAdmin is owned by `proxyAdminOwner`, running `initData`.
  function _proxy(
    string memory name,
    address implementation,
    address proxyAdminOwner,
    bytes memory initData
  ) internal returns (address proxyAddress) {
    proxyAddress = address(new TransparentUpgradeableProxy(implementation, proxyAdminOwner, initData));
    console.log(string.concat(name, " proxy deployed at:"), proxyAddress);
    console.log(string.concat(name, " implementation at:"), implementation);
  }

  function run() external {
    uint256 pk = vm.envOr("PRIVATE_KEY", uint256(0));
    address treasury = vm.envAddress("TREASURY_ADDRESS");
    address platformTreasury = vm.envOr("PLATFORM_TREASURY_ADDRESS", treasury);
    uint256 initialSupply = vm.envOr("TOKEN_INITIAL_SUPPLY", uint256(1_000_000_000e18));
    uint256 timelockMinDelay = vm.envOr("TIMELOCK_MIN_DELAY", uint256(2 days));
    uint48 votingDelay = uint48(vm.envOr("GOVERNOR_VOTING_DELAY", uint256(7_200)));
    uint32 votingPeriod = uint32(vm.envOr("GOVERNOR_VOTING_PERIOD", uint256(50_400)));
    uint256 proposalThreshold = vm.envOr("GOVERNOR_PROPOSAL_THRESHOLD", uint256(100_000e18));
    address usdc = vm.envOr("USDC_ADDRESS", address(0));
    // No PRIVATE_KEY → msg.sender is the keystore account forge unlocked
    // via --account, and the no-arg broadcast signs with it.
    address deployer = pk != 0 ? vm.addr(pk) : msg.sender;

    if (pk != 0) vm.startBroadcast(pk);
    else vm.startBroadcast();

    // Governance first: the timelock owns every ProxyAdmin from birth.
    timelock = new FileOnChainTimelock(timelockMinDelay, new address[](0), new address[](0), deployer);
    console.log("FileOnChainTimelock deployed at:", address(timelock));

    token = FileOnChainAttestationToken(
      _proxy(
        "FileOnChainAttestationToken",
        address(new FileOnChainAttestationToken()),
        address(timelock),
        abi.encodeCall(
          FileOnChainAttestationToken.initialize, (deployer, initialSupply, address(timelock))
        )
      )
    );

    governor = new FileOnChainGovernor(
      IVotes(address(token)), timelock, votingDelay, votingPeriod, proposalThreshold
    );
    console.log("FileOnChainGovernor deployed at:", address(governor));

    // Governor proposes and cancels; anyone may execute after the delay.
    timelock.grantRole(timelock.PROPOSER_ROLE(), address(governor));
    timelock.grantRole(timelock.CANCELLER_ROLE(), address(governor));
    timelock.grantRole(timelock.EXECUTOR_ROLE(), address(0));

    // Protocol contracts initialize owned by the deployer for wiring, then
    // hand over to the timelock below.
    staking = ValidatorStaking(
      _proxy(
        "ValidatorStaking",
        address(new ValidatorStaking()),
        address(timelock),
        abi.encodeCall(
          ValidatorStaking.initialize, (OZIERC20(address(token)), 1_000e18, 7 days, deployer)
        )
      )
    );

    platforms = PlatformRegistry(
      _proxy(
        "PlatformRegistry",
        address(new PlatformRegistry()),
        address(timelock),
        abi.encodeCall(PlatformRegistry.initialize, (2_500, deployer))
      )
    );

    // The timelock is the protocol treasury: tip shares accrue to it and
    // spending them is a governance proposal.
    registry = FileRegistry(
      _proxy(
        "FileRegistry",
        address(new FileRegistry()),
        address(timelock),
        abi.encodeCall(
          FileRegistry.initialize,
          (OZIERC20(address(token)), staking, platforms, address(timelock), deployer)
        )
      )
    );

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

    cache = CachePayments(
      _proxy(
        "CachePayments",
        address(new CachePayments()),
        address(timelock),
        abi.encodeCall(CachePayments.initialize, (IERC20(usdc), treasury))
      )
    );

    escrow = DonationEscrow(
      _proxy(
        "DonationEscrow",
        address(new DonationEscrow()),
        address(timelock),
        abi.encodeCall(DonationEscrow.initialize, (treasury))
      )
    );

    vm.stopBroadcast();
  }
}
