// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/PlatformRegistry.sol";
import {ProxyDeployer} from "./utils/ProxyDeployer.sol";

contract PlatformRegistryTest is Test, ProxyDeployer {
  PlatformRegistry internal platforms;

  address internal alice = makeAddr("alice");
  address internal bob = makeAddr("bob");
  address internal treasury = makeAddr("treasury");

  function setUp() public {
    platforms = deployPlatforms(2_500, address(this));
  }

  function test_InitializeSetsCap() public view {
    assertEq(platforms.maxPlatformFeeBps(), 2_500);
    assertEq(platforms.nextPlatformId(), 1);
  }

  function test_RevertWhen_InitializeCapTooHigh() public {
    address implementation = address(new PlatformRegistry());
    vm.expectRevert(bytes("PlatformRegistry: bps > 100%"));
    deployProxy(implementation, abi.encodeCall(PlatformRegistry.initialize, (10_001, address(this))));
  }

  // ---------------------------------------------------------------------
  // Registration (governed)
  // ---------------------------------------------------------------------

  function test_RegisterPlatform() public {
    vm.expectEmit(true, true, true, true);
    emit PlatformRegistry.PlatformRegistered(1, alice, treasury, 2_000);
    uint256 id = platforms.registerPlatform(alice, treasury, 2_000);
    assertEq(id, 1);
    assertEq(platforms.nextPlatformId(), 2);

    PlatformRegistry.Platform memory p = platforms.getPlatform(id);
    assertEq(p.owner, alice);
    assertEq(p.treasury, treasury);
    assertEq(p.feeBps, 2_000);
    assertTrue(p.active);
    assertTrue(platforms.isActivePlatform(id));

    assertEq(platforms.registerPlatform(bob, treasury, 100), 2);
  }

  function test_RevertWhen_RegisterInvalid() public {
    vm.expectRevert(bytes("PlatformRegistry: zero owner"));
    platforms.registerPlatform(address(0), treasury, 100);
    vm.expectRevert(bytes("PlatformRegistry: zero treasury"));
    platforms.registerPlatform(alice, address(0), 100);
    vm.expectRevert(bytes("PlatformRegistry: fee above cap"));
    platforms.registerPlatform(alice, treasury, 2_501);
  }

  function test_RevertWhen_RegisterNotOwner() public {
    vm.prank(alice);
    vm.expectRevert();
    platforms.registerPlatform(alice, treasury, 100);
  }

  // ---------------------------------------------------------------------
  // Status (governed)
  // ---------------------------------------------------------------------

  function test_SetPlatformActive() public {
    uint256 id = platforms.registerPlatform(alice, treasury, 100);
    vm.expectEmit(true, true, true, true);
    emit PlatformRegistry.PlatformStatusChanged(id, false);
    platforms.setPlatformActive(id, false);
    assertFalse(platforms.isActivePlatform(id));
    platforms.setPlatformActive(id, true);
    assertTrue(platforms.isActivePlatform(id));
  }

  function test_RevertWhen_SetActiveUnknown() public {
    vm.expectRevert(bytes("PlatformRegistry: unknown platform"));
    platforms.setPlatformActive(9, true);
  }

  function test_SetMaxPlatformFeeBps() public {
    platforms.setMaxPlatformFeeBps(5_000);
    assertEq(platforms.maxPlatformFeeBps(), 5_000);
    vm.expectRevert(bytes("PlatformRegistry: bps > 100%"));
    platforms.setMaxPlatformFeeBps(10_001);
    vm.prank(alice);
    vm.expectRevert();
    platforms.setMaxPlatformFeeBps(1);
  }

  // ---------------------------------------------------------------------
  // Platform owner updates
  // ---------------------------------------------------------------------

  function test_UpdatePlatform() public {
    uint256 id = platforms.registerPlatform(alice, treasury, 100);
    vm.prank(alice);
    vm.expectEmit(true, true, true, true);
    emit PlatformRegistry.PlatformUpdated(id, bob, 2_500);
    platforms.updatePlatform(id, bob, 2_500);

    PlatformRegistry.Platform memory p = platforms.getPlatform(id);
    assertEq(p.treasury, bob);
    assertEq(p.feeBps, 2_500);
  }

  function test_RevertWhen_UpdateInvalid() public {
    uint256 id = platforms.registerPlatform(alice, treasury, 100);

    vm.expectRevert(bytes("PlatformRegistry: not platform owner"));
    platforms.updatePlatform(id, bob, 100); // registry owner != platform owner

    vm.startPrank(alice);
    vm.expectRevert(bytes("PlatformRegistry: zero treasury"));
    platforms.updatePlatform(id, address(0), 100);
    vm.expectRevert(bytes("PlatformRegistry: fee above cap"));
    platforms.updatePlatform(id, bob, 2_501);
    vm.stopPrank();
  }

  function test_TransferPlatformOwnership() public {
    uint256 id = platforms.registerPlatform(alice, treasury, 100);
    vm.prank(alice);
    platforms.transferPlatformOwnership(id, bob);
    assertEq(platforms.getPlatform(id).owner, bob);

    vm.prank(alice);
    vm.expectRevert(bytes("PlatformRegistry: not platform owner"));
    platforms.transferPlatformOwnership(id, alice);

    vm.prank(bob);
    vm.expectRevert(bytes("PlatformRegistry: zero owner"));
    platforms.transferPlatformOwnership(id, address(0));
  }
}
