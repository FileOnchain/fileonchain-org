// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {ValidatorStaking} from "../src/ValidatorStaking.sol";
import {PlatformRegistry} from "../src/PlatformRegistry.sol";
import {FileRegistry} from "../src/FileRegistry.sol";
import {FileOnChainTimelock} from "../src/governance/FileOnChainTimelock.sol";

interface IOwnable {
  function owner() external view returns (address);
  function transferOwnership(address newOwner) external;
}

/// @notice Finishes a partially-completed Deploy.s.sol run (e.g. a tx ran
/// out of gas mid-script). Idempotent: reads the chain and only sends what
/// is missing — the staking registry hook, the FileOnChain platform (id 1),
/// ownership handovers to the timelock, and the deployer's timelock-admin
/// renounce. Safe to re-run until it logs only "ok" lines.
///
/// The wiring steps require the broadcaster to still hold the relevant
/// ownership; anything already handed to the timelock is skipped, and
/// anything owned by a third party is logged as a warning instead of
/// reverting the run.
///
/// Env vars (addresses from the original deploy logs — use the proxies):
///   TIMELOCK_ADDRESS, TOKEN_ADDRESS, STAKING_ADDRESS,
///   PLATFORM_REGISTRY_ADDRESS, REGISTRY_ADDRESS   required
///   PLATFORM_TREASURY_ADDRESS / TREASURY_ADDRESS  required only if
///                                                 platform 1 is missing
///   PRIVATE_KEY                                   optional; keystore
///                                                 --account otherwise
///
/// Run with generous gas headroom — forge's batch simulation underestimates
/// cold-storage calls (that is how deploys end up partial in the first
/// place). Frontier chains (Auto EVM / Chronos) also need the RPC proxy:
///   node script/frontier-rpc-proxy.mjs <upstream-url> 8546 &
///   forge script script/FinishDeploy.s.sol --rpc-url http://127.0.0.1:8546 \
///     --account deployer --broadcast --gas-estimate-multiplier 200
contract FinishDeploy is Script {
  function run() external {
    uint256 pk = vm.envOr("PRIVATE_KEY", uint256(0));
    FileOnChainTimelock timelock =
      FileOnChainTimelock(payable(vm.envAddress("TIMELOCK_ADDRESS")));
    address token = vm.envAddress("TOKEN_ADDRESS");
    ValidatorStaking staking = ValidatorStaking(vm.envAddress("STAKING_ADDRESS"));
    PlatformRegistry platforms = PlatformRegistry(vm.envAddress("PLATFORM_REGISTRY_ADDRESS"));
    FileRegistry registry = FileRegistry(vm.envAddress("REGISTRY_ADDRESS"));
    address sender = pk != 0 ? vm.addr(pk) : msg.sender;

    if (pk != 0) vm.startBroadcast(pk);
    else vm.startBroadcast();

    // Wiring first — both calls are onlyOwner, so they must run before the
    // ownership handovers below.
    if (staking.registry() == address(0)) {
      staking.setRegistry(address(registry));
      console.log("staking.setRegistry ->", address(registry));
    } else {
      console.log("ok: staking.registry already set");
    }

    if (!platforms.getPlatform(1).active) {
      address platformTreasury =
        vm.envOr("PLATFORM_TREASURY_ADDRESS", vm.envOr("TREASURY_ADDRESS", address(0)));
      require(
        platformTreasury != address(0),
        "platform 1 missing: set PLATFORM_TREASURY_ADDRESS or TREASURY_ADDRESS"
      );
      uint256 platformId = platforms.registerPlatform(sender, platformTreasury, 2_500);
      console.log("registered FileOnChain platform id:", platformId);
    } else {
      console.log("ok: platform 1 active");
    }

    _handOver("token", token, address(timelock), sender);
    _handOver("staking", address(staking), address(timelock), sender);
    _handOver("platforms", address(platforms), address(timelock), sender);
    _handOver("registry", address(registry), address(timelock), sender);

    // Renounce last: once the admin role is gone, only governance remains.
    bytes32 adminRole = timelock.DEFAULT_ADMIN_ROLE();
    if (timelock.hasRole(adminRole, sender)) {
      timelock.renounceRole(adminRole, sender);
      console.log("renounced timelock admin role");
    } else {
      console.log("ok: timelock admin role not held by sender");
    }

    vm.stopBroadcast();
  }

  function _handOver(string memory name, address target, address timelock, address sender)
    internal
  {
    address owner = IOwnable(target).owner();
    if (owner == timelock) {
      console.log(string.concat("ok: ", name, " owned by timelock"));
    } else if (owner == sender) {
      IOwnable(target).transferOwnership(timelock);
      console.log(string.concat(name, " ownership -> timelock"));
    } else {
      console.log(string.concat("WARN: ", name, " owned by neither sender nor timelock:"), owner);
    }
  }
}
