// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/FileRegistry.sol";
import "../src/CachePayments.sol";
import "../src/DonationEscrow.sol";
import "../src/mocks/MockUSDC.sol";

/// @notice Deploys FileRegistry, MockUSDC, CachePayments, and DonationEscrow
/// using env vars. Run with: `forge script script/Deploy.s.sol --rpc-url $RPC --broadcast`
contract Deploy is Script {
  function run() external {
    uint256 pk = vm.envUint("PRIVATE_KEY");
    address treasury = vm.envAddress("TREASURY_ADDRESS");
    address usdc = vm.envOr("USDC_ADDRESS", address(0));

    vm.startBroadcast(pk);

    FileRegistry registry = new FileRegistry();
    console.log("FileRegistry deployed at:", address(registry));

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