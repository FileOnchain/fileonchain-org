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
    address treasury = makeAddr("treasury");
    vm.setEnv("TREASURY_ADDRESS", vm.toString(treasury));
    address deployer = vm.addr(vm.parseUint(PK));

    // No USDC_ADDRESS → the script deploys its own MockUSDC.
    vm.setEnv("USDC_ADDRESS", "0x0000000000000000000000000000000000000000");
    Deploy deploy = new Deploy();
    deploy.run();

    // Protocol wiring: registry hooks, governance ownership, open executor.
    FOCATToken token = deploy.token();
    FileOnChainTimelock timelock = deploy.timelock();
    FileOnChainGovernor governor = deploy.governor();
    ValidatorStaking staking = deploy.staking();
    PlatformRegistry platforms = deploy.platforms();
    FileRegistry registry = deploy.registry();

    assertEq(token.balanceOf(deployer), 1_000_000_000e18);
    assertEq(staking.registry(), address(registry));
    assertEq(registry.protocolTreasury(), address(timelock));
    assertEq(staking.owner(), address(timelock));
    assertEq(platforms.owner(), address(timelock));
    assertEq(registry.owner(), address(timelock));
    assertTrue(timelock.hasRole(timelock.PROPOSER_ROLE(), address(governor)));
    assertTrue(timelock.hasRole(timelock.CANCELLER_ROLE(), address(governor)));
    assertTrue(timelock.hasRole(timelock.EXECUTOR_ROLE(), address(0)));
    assertFalse(timelock.hasRole(timelock.DEFAULT_ADMIN_ROLE(), deployer));

    // FileOnChain is platform 1, owned by the deployer, treasury defaulted.
    PlatformRegistry.Platform memory p = platforms.getPlatform(1);
    assertEq(p.owner, deployer);
    assertEq(p.treasury, treasury);
    assertEq(p.feeBps, 2_500);
    assertTrue(p.active);

    // USDC_ADDRESS provided → the script reuses it.
    MockUSDC existing = new MockUSDC();
    vm.setEnv("USDC_ADDRESS", vm.toString(address(existing)));
    new Deploy().run();
  }
}
