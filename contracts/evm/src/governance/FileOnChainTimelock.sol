// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

/// @title FileOnChainTimelock
/// @notice Timelock that owns every protocol contract (FileRegistry,
/// ValidatorStaking, PlatformRegistry) and acts as the protocol treasury.
/// The FileOnChainGovernor is its only proposer; execution is open.
contract FileOnChainTimelock is TimelockController {
  constructor(
    uint256 minDelay,
    address[] memory proposers,
    address[] memory executors,
    address admin
  ) TimelockController(minDelay, proposers, executors, admin) {}
}
