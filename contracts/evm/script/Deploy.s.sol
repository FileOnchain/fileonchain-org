// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {IERC20 as OZIERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {FileOnChainToken} from "../src/FileOnChainToken.sol";
import {ValidatorStaking} from "../src/ValidatorStaking.sol";
import {PlatformRegistry} from "../src/PlatformRegistry.sol";
import {FileRegistry} from "../src/FileRegistry.sol";
import {CachePayments, IERC20} from "../src/CachePayments.sol";
import {DonationEscrow} from "../src/DonationEscrow.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

/// @notice Deploys the anchor protocol suite (FOC token, ValidatorStaking,
/// PlatformRegistry, FileRegistry) plus MockUSDC, CachePayments, and
/// DonationEscrow using env vars.
/// Run with: `forge script script/Deploy.s.sol --rpc-url $RPC --broadcast`
contract Deploy is Script {
  function run() external {
    uint256 pk = vm.envUint("PRIVATE_KEY");
    address treasury = vm.envAddress("TREASURY_ADDRESS");
    address platformTreasury = vm.envOr("PLATFORM_TREASURY_ADDRESS", treasury);
    uint256 initialSupply = vm.envOr("TOKEN_INITIAL_SUPPLY", uint256(1_000_000_000e18));
    address usdc = vm.envOr("USDC_ADDRESS", address(0));
    address deployer = vm.addr(pk);

    vm.startBroadcast(pk);

    FileOnChainToken token = new FileOnChainToken(deployer, initialSupply);
    console.log("FileOnChainToken deployed at:", address(token));

    ValidatorStaking staking = new ValidatorStaking(OZIERC20(address(token)), 1_000e18, 7 days);
    console.log("ValidatorStaking deployed at:", address(staking));

    PlatformRegistry platforms = new PlatformRegistry(2_500);
    console.log("PlatformRegistry deployed at:", address(platforms));

    FileRegistry registry = new FileRegistry(OZIERC20(address(token)), staking, platforms, treasury);
    console.log("FileRegistry deployed at:", address(registry));

    staking.setRegistry(address(registry));
    uint256 fileOnChainPlatformId = platforms.registerPlatform(deployer, platformTreasury, 2_500);
    console.log("FileOnChain platform id:", fileOnChainPlatformId);

    if (usdc == address(0)) {
      MockUSDC mockUsdc = new MockUSDC();
      usdc = address(mockUsdc);
      console.log("MockUSDC deployed at:", usdc);
    }

    CachePayments cache = new CachePayments(IERC20(usdc), treasury);
    console.log("CachePayments deployed at:", address(cache));

    DonationEscrow escrow = new DonationEscrow(treasury);
    console.log("DonationEscrow deployed at:", address(escrow));

    vm.stopBroadcast();
  }
}
