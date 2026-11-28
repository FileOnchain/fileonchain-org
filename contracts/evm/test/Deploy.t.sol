// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../script/Deploy.s.sol";
import {ProxyAdmin} from "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";
import {ERC1967Utils} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Utils.sol";

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

    FileRegistry registry = deploy.registry();
    assertEq(registry.owner(), deployer);

    // Every proxy's ProxyAdmin is owned by the admin (deployer by default).
    address[3] memory proxies =
      [address(registry), address(deploy.cache()), address(deploy.escrow())];
    for (uint256 i = 0; i < proxies.length; i++) {
      address proxyAdmin =
        address(uint160(uint256(vm.load(proxies[i], ERC1967Utils.ADMIN_SLOT))));
      assertEq(ProxyAdmin(proxyAdmin).owner(), deployer);
    }

    // The registry anchors without any token in the loop.
    registry.anchorCID(keccak256("cid"), sha256("bytes"), "payload");
    assertTrue(registry.isCIDAnchored(keccak256("cid")));

    // USDC_ADDRESS provided → the script reuses it.
    MockUSDC existing = new MockUSDC();
    vm.setEnv("USDC_ADDRESS", vm.toString(address(existing)));
    new Deploy().run();
  }

  // The mainnet guard is exercised directly (no env vars) so it cannot race
  // with test_Run_BothUSDCBranches over process-global env.
  function test_AssertSafeConfig_NoOpOnTestnets() public {
    Deploy deploy = new Deploy();
    vm.chainId(11_155_111);
    deploy.assertSafeConfig(address(1), address(1), address(1), address(0));
  }

  function test_AssertSafeConfig_MainnetRules() public {
    Deploy deploy = new Deploy();
    address deployer = makeAddr("deployer");
    address safe = address(new MockUSDC()); // any contract stands in for a Safe
    address usdc = address(new MockUSDC());
    address eoa = makeAddr("eoa");
    vm.chainId(8453);

    vm.expectRevert("Deploy: USDC_ADDRESS required on mainnet");
    deploy.assertSafeConfig(deployer, safe, safe, address(0));

    vm.expectRevert("Deploy: USDC_ADDRESS has no code");
    deploy.assertSafeConfig(deployer, safe, safe, eoa);

    vm.expectRevert("Deploy: ADMIN_ADDRESS must not be the deployer on mainnet");
    deploy.assertSafeConfig(deployer, deployer, safe, usdc);

    vm.expectRevert("Deploy: ADMIN_ADDRESS must be a multisig contract on mainnet");
    deploy.assertSafeConfig(deployer, eoa, safe, usdc);

    vm.expectRevert("Deploy: TREASURY_ADDRESS must not be the deployer on mainnet");
    deploy.assertSafeConfig(deployer, safe, deployer, usdc);

    vm.expectRevert("Deploy: TREASURY_ADDRESS must be a multisig contract on mainnet");
    deploy.assertSafeConfig(deployer, safe, eoa, usdc);

    deploy.assertSafeConfig(deployer, safe, safe, usdc);
  }

  function test_IsKnownMainnet() public {
    Deploy deploy = new Deploy();
    assertTrue(deploy.isKnownMainnet(1));
    assertTrue(deploy.isKnownMainnet(8453));
    assertTrue(deploy.isKnownMainnet(870));
    assertFalse(deploy.isKnownMainnet(11_155_111));
    assertFalse(deploy.isKnownMainnet(84_532));
    assertFalse(deploy.isKnownMainnet(8700));
    assertFalse(deploy.isKnownMainnet(31_337));
  }
}
