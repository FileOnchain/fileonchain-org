// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {TransparentUpgradeableProxy} from
  "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import {FileRegistry} from "../src/FileRegistry.sol";
import {CachePayments, IERC20} from "../src/CachePayments.sol";
import {DonationEscrow} from "../src/DonationEscrow.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

/// @notice Deploys the v1 suite: the anchor-only FileRegistry plus the
/// adjacent retrieval services (CachePayments, DonationEscrow) and MockUSDC
/// on testnets. No token, no staking, no governance — anchoring is free
/// beyond gas, and hosted services charge in credits/USDC.
///
/// Every contract deploys behind an OZ TransparentUpgradeableProxy whose
/// auto-created ProxyAdmin is owned by ADMIN_ADDRESS (default: deployer).
///
/// Env vars:
///   PRIVATE_KEY       optional deployer key; when unset, broadcast uses the
///                     keystore account passed via `--account <name>`
///   TREASURY_ADDRESS  required; CachePayments/DonationEscrow treasury
///   ADMIN_ADDRESS     optional; proxy-admin + registry owner (default: deployer)
///   USDC_ADDRESS      optional; deploys MockUSDC when unset (testnets only)
///
/// On a known mainnet chain id the script refuses unsafe configs before
/// broadcasting anything: USDC_ADDRESS must be a deployed token (never
/// MockUSDC), and ADMIN_ADDRESS + TREASURY_ADDRESS must be contracts (a
/// Safe multisig) distinct from the deployer. See
/// docs/deploy/release-plan.md.
/// Run with: `forge script script/Deploy.s.sol --rpc-url $RPC --broadcast`
contract Deploy is Script {
  // Exposed for wiring assertions in Deploy.t.sol (proxy addresses).
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

  /// @dev Mainnet chain ids this script may target (docs/deploy/evm.md).
  /// Anything not listed is treated as a testnet or local chain.
  function isKnownMainnet(uint256 chainId) public pure returns (bool) {
    return chainId == 1 // Ethereum
      || chainId == 8453 // Base
      || chainId == 10 // Optimism
      || chainId == 42_161 // Arbitrum One
      || chainId == 137 // Polygon
      || chainId == 56 // BNB Smart Chain
      || chainId == 43_114 // Avalanche C-Chain
      || chainId == 324 // zkSync Era
      || chainId == 534_352 // Scroll
      || chainId == 59_144 // Linea
      || chainId == 5000 // Mantle
      || chainId == 81_457 // Blast
      || chainId == 42_220 // Celo
      || chainId == 870; // Autonomys Auto EVM
  }

  /// @notice Reverts when a mainnet deploy would leave upgrade or treasury
  /// power on a single key, or wire CachePayments to a mock token.
  /// No-op on testnets. Public so tests can exercise it without env vars.
  function assertSafeConfig(address deployer, address admin, address treasury, address usdc) public view {
    if (!isKnownMainnet(block.chainid)) return;
    require(usdc != address(0), "Deploy: USDC_ADDRESS required on mainnet");
    require(usdc.code.length > 0, "Deploy: USDC_ADDRESS has no code");
    require(admin != deployer, "Deploy: ADMIN_ADDRESS must not be the deployer on mainnet");
    require(admin.code.length > 0, "Deploy: ADMIN_ADDRESS must be a multisig contract on mainnet");
    require(treasury != deployer, "Deploy: TREASURY_ADDRESS must not be the deployer on mainnet");
    require(treasury.code.length > 0, "Deploy: TREASURY_ADDRESS must be a multisig contract on mainnet");
  }

  function run() external {
    uint256 pk = vm.envOr("PRIVATE_KEY", uint256(0));
    address treasury = vm.envAddress("TREASURY_ADDRESS");
    address usdc = vm.envOr("USDC_ADDRESS", address(0));
    // No PRIVATE_KEY → msg.sender is the keystore account forge unlocked
    // via --account, and the no-arg broadcast signs with it.
    address deployer = pk != 0 ? vm.addr(pk) : msg.sender;
    address admin = vm.envOr("ADMIN_ADDRESS", deployer);
    assertSafeConfig(deployer, admin, treasury, usdc);

    if (pk != 0) vm.startBroadcast(pk);
    else vm.startBroadcast();

    registry = FileRegistry(
      _proxy(
        "FileRegistry",
        address(new FileRegistry()),
        admin,
        abi.encodeCall(FileRegistry.initialize, (admin))
      )
    );

    if (usdc == address(0)) {
      MockUSDC mockUsdc = new MockUSDC();
      usdc = address(mockUsdc);
      console.log("MockUSDC deployed at:", usdc);
    }

    cache = CachePayments(
      _proxy(
        "CachePayments",
        address(new CachePayments()),
        admin,
        abi.encodeCall(CachePayments.initialize, (IERC20(usdc), treasury))
      )
    );

    escrow = DonationEscrow(
      _proxy(
        "DonationEscrow",
        address(new DonationEscrow()),
        admin,
        abi.encodeCall(DonationEscrow.initialize, (treasury))
      )
    );

    vm.stopBroadcast();
  }
}
