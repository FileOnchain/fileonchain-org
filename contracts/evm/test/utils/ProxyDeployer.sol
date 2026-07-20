// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TransparentUpgradeableProxy} from
  "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import {ERC1967Utils} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Utils.sol";
import {FileRegistry} from "../../src/FileRegistry.sol";
import {CachePayments, IERC20 as CacheIERC20} from "../../src/CachePayments.sol";
import {DonationEscrow} from "../../src/DonationEscrow.sol";

/// @notice Test fixture mirror of the production deployment: every contract
/// lives behind an OZ TransparentUpgradeableProxy, so tests exercise
/// exactly what ships. `proxyAdminOwner` owns each proxy's auto-created
/// ProxyAdmin (ADMIN_ADDRESS in production).
abstract contract ProxyDeployer {
  address internal proxyAdminOwner = address(0xAD317);

  function deployProxy(address implementation, bytes memory data) internal returns (address) {
    return address(new TransparentUpgradeableProxy(implementation, proxyAdminOwner, data));
  }

  /// @dev EIP-1967 admin slot — tests read it with vm.load to find the
  /// ProxyAdmin contract auto-created for a proxy.
  function adminSlot() internal pure returns (bytes32) {
    return ERC1967Utils.ADMIN_SLOT;
  }

  /// @dev EIP-1967 implementation slot — for asserting upgrades landed.
  function implementationSlot() internal pure returns (bytes32) {
    return ERC1967Utils.IMPLEMENTATION_SLOT;
  }

  function deployRegistry(address owner_) internal returns (FileRegistry) {
    return FileRegistry(
      deployProxy(address(new FileRegistry()), abi.encodeCall(FileRegistry.initialize, (owner_)))
    );
  }

  function deployCache(CacheIERC20 usdc, address treasury) internal returns (CachePayments) {
    return CachePayments(
      deployProxy(address(new CachePayments()), abi.encodeCall(CachePayments.initialize, (usdc, treasury)))
    );
  }

  function deployEscrow(address treasury) internal returns (DonationEscrow) {
    return DonationEscrow(
      deployProxy(address(new DonationEscrow()), abi.encodeCall(DonationEscrow.initialize, (treasury)))
    );
  }
}
