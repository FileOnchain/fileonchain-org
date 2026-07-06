// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../script/Deploy.s.sol";

contract DeployTest is Test {
  // anvil default key #1 — test-only, never funded anywhere real
  string internal constant PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

  // Both branches live in one test: vm.setEnv is process-global and forge
  // runs tests in parallel, so split tests would race on USDC_ADDRESS.
  function test_Run_BothUSDCBranches() public {
    vm.setEnv("PRIVATE_KEY", PK);
    vm.setEnv("TREASURY_ADDRESS", vm.toString(makeAddr("treasury")));

    // No USDC_ADDRESS → the script deploys its own MockUSDC.
    vm.setEnv("USDC_ADDRESS", "0x0000000000000000000000000000000000000000");
    new Deploy().run();

    // USDC_ADDRESS provided → the script reuses it.
    MockUSDC existing = new MockUSDC();
    vm.setEnv("USDC_ADDRESS", vm.toString(address(existing)));
    new Deploy().run();
  }
}
