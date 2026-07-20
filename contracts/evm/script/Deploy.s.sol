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
///   USDC_ADDRESS      optional; deploys MockUSDC when unset
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

  function run() external {
    uint256 pk = vm.envOr("PRIVATE_KEY", uint256(0));
    address treasury = vm.envAddress("TREASURY_ADDRESS");
    address usdc = vm.envOr("USDC_ADDRESS", address(0));
    // No PRIVATE_KEY → msg.sender is the keystore account forge unlocked
    // via --account, and the no-arg broadcast signs with it.
    address deployer = pk != 0 ? vm.addr(pk) : msg.sender;
    address admin = vm.envOr("ADMIN_ADDRESS", deployer);

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
