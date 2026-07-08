// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/// @title ValidatorStaking
/// @notice Validators opt into the FileOnChain verification market by staking
/// FOCAT above `minStake`. Active validators are eligible for jury duty on
/// disputed anchors, earn the validator share of anchor tips pro-rata
/// (MasterChef-style accumulator), and are slashed by the registry when they
/// vote with the losing side of a dispute. Unbonding stake remains slashable
/// until withdrawn. Delegation is out of scope for v1.
/// Deployed behind an OZ TransparentUpgradeableProxy; the ProxyAdmin is
/// owned by the timelock.
contract ValidatorStaking is Initializable, OwnableUpgradeable {
  using SafeERC20 for IERC20;

  // ---------------------------------------------------------------------
  // Types
  // ---------------------------------------------------------------------

  struct StakeInfo {
    uint256 amount; // active stake
    uint256 rewardDebt; // MasterChef bookkeeping: amount * accRewardPerShare / PRECISION at last touch
    uint256 pendingRewards; // harvested but unclaimed rewards
    uint256 unbondingAmount; // stake in cooldown, still slashable
    uint64 unbondingEndsAt; // when unbondingAmount becomes withdrawable
  }

  // ---------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------

  event Staked(address indexed validator, uint256 amount, uint256 totalStake);
  event UnstakeRequested(address indexed validator, uint256 amount, uint64 unbondingEndsAt);
  event Unstaked(address indexed validator, uint256 amount);
  event RewardsClaimed(address indexed validator, uint256 amount);
  event RewardNotified(uint256 amount);
  event Slashed(address indexed validator, uint256 amount, address indexed beneficiary);
  event ValidatorActivated(address indexed validator);
  event ValidatorDeactivated(address indexed validator);
  event MinStakeUpdated(uint256 previous, uint256 next);
  event UnbondingSecondsUpdated(uint64 previous, uint64 next);
  event RegistrySet(address indexed registry);

  // ---------------------------------------------------------------------
  // Storage
  // ---------------------------------------------------------------------

  uint256 private constant PRECISION = 1e12;

  IERC20 public token;
  address public registry; // FileRegistry — only rewarder/slasher; set once
  uint256 public minStake; // governance param
  uint64 public unbondingSeconds; // governance param; should exceed challenge + vote windows

  address[] private _validators; // active set, sampled for juries
  mapping(address => uint256) private _validatorIndex; // 1-based; 0 = not active
  mapping(address => StakeInfo) private _stakes;
  uint256 public totalStaked; // sum of active stake (excludes unbonding)
  uint256 public accRewardPerShare; // scaled by PRECISION

  // ---------------------------------------------------------------------
  // Modifiers
  // ---------------------------------------------------------------------

  modifier onlyRegistry() {
    require(msg.sender == registry, "ValidatorStaking: not registry");
    _;
  }

  // ---------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    _disableInitializers();
  }

  function initialize(
    IERC20 _token,
    uint256 _minStake,
    uint64 _unbondingSeconds,
    address initialOwner
  ) external initializer {
    require(address(_token) != address(0), "ValidatorStaking: zero token");
    require(_minStake > 0, "ValidatorStaking: zero min stake");
    __Ownable_init(initialOwner);
    token = _token;
    minStake = _minStake;
    unbondingSeconds = _unbondingSeconds;
  }

  // ---------------------------------------------------------------------
  // Owner (timelock) parameters
  // ---------------------------------------------------------------------

  /// @notice One-shot wiring of the registry allowed to notify rewards and slash.
  function setRegistry(address newRegistry) external onlyOwner {
    require(registry == address(0), "ValidatorStaking: registry set");
    require(newRegistry != address(0), "ValidatorStaking: zero registry");
    registry = newRegistry;
    emit RegistrySet(newRegistry);
  }

  /// @notice Update the activation threshold. Existing validators are only
  /// re-evaluated the next time their stake changes.
  function setMinStake(uint256 newMinStake) external onlyOwner {
    require(newMinStake > 0, "ValidatorStaking: zero min stake");
    emit MinStakeUpdated(minStake, newMinStake);
    minStake = newMinStake;
  }

  function setUnbondingSeconds(uint64 newUnbondingSeconds) external onlyOwner {
    emit UnbondingSecondsUpdated(unbondingSeconds, newUnbondingSeconds);
    unbondingSeconds = newUnbondingSeconds;
  }

  // ---------------------------------------------------------------------
  // Staking
  // ---------------------------------------------------------------------

  function stake(uint256 amount) external {
    require(amount > 0, "ValidatorStaking: zero amount");
    StakeInfo storage s = _stakes[msg.sender];
    _harvest(s);
    token.safeTransferFrom(msg.sender, address(this), amount);
    s.amount += amount;
    totalStaked += amount;
    s.rewardDebt = (s.amount * accRewardPerShare) / PRECISION;
    _syncActivation(msg.sender, s);
    emit Staked(msg.sender, amount, s.amount);
  }

  /// @notice Move stake into the unbonding cooldown. A new request merges with
  /// any pending unbonding amount and restarts the cooldown clock.
  function requestUnstake(uint256 amount) external {
    StakeInfo storage s = _stakes[msg.sender];
    require(amount > 0 && amount <= s.amount, "ValidatorStaking: bad amount");
    _harvest(s);
    s.amount -= amount;
    totalStaked -= amount;
    s.rewardDebt = (s.amount * accRewardPerShare) / PRECISION;
    s.unbondingAmount += amount;
    s.unbondingEndsAt = uint64(block.timestamp) + unbondingSeconds;
    _syncActivation(msg.sender, s);
    emit UnstakeRequested(msg.sender, amount, s.unbondingEndsAt);
  }

  function withdrawUnstaked() external {
    StakeInfo storage s = _stakes[msg.sender];
    uint256 amount = s.unbondingAmount;
    require(amount > 0, "ValidatorStaking: nothing unbonding");
    require(block.timestamp >= s.unbondingEndsAt, "ValidatorStaking: still unbonding");
    s.unbondingAmount = 0;
    token.safeTransfer(msg.sender, amount);
    emit Unstaked(msg.sender, amount);
  }

  function claimRewards() external {
    StakeInfo storage s = _stakes[msg.sender];
    _harvest(s);
    uint256 amount = s.pendingRewards;
    require(amount > 0, "ValidatorStaking: nothing to claim");
    s.pendingRewards = 0;
    token.safeTransfer(msg.sender, amount);
    emit RewardsClaimed(msg.sender, amount);
  }

  // ---------------------------------------------------------------------
  // Registry hooks
  // ---------------------------------------------------------------------

  /// @notice Distribute a tip's validator share pro-rata across active stake.
  /// The registry must have approved `amount` beforehand. Reverts when nothing
  /// is staked — the registry routes the share to the protocol treasury instead.
  function notifyReward(uint256 amount) external onlyRegistry {
    require(amount > 0, "ValidatorStaking: zero amount");
    require(totalStaked > 0, "ValidatorStaking: no stake");
    token.safeTransferFrom(msg.sender, address(this), amount);
    accRewardPerShare += (amount * PRECISION) / totalStaked;
    emit RewardNotified(amount);
  }

  /// @notice Slash a validator's stake (active first, then unbonding) and send
  /// the proceeds to `beneficiary`. Returns the amount actually slashed.
  function slash(address who, uint256 amount, address beneficiary) external onlyRegistry returns (uint256) {
    require(beneficiary != address(0), "ValidatorStaking: zero beneficiary");
    StakeInfo storage s = _stakes[who];
    _harvest(s);

    uint256 fromActive = amount <= s.amount ? amount : s.amount;
    uint256 remainder = amount - fromActive;
    uint256 fromUnbonding = remainder <= s.unbondingAmount ? remainder : s.unbondingAmount;
    uint256 slashed = fromActive + fromUnbonding;
    if (slashed == 0) return 0;

    if (fromActive > 0) {
      s.amount -= fromActive;
      totalStaked -= fromActive;
    }
    if (fromUnbonding > 0) {
      s.unbondingAmount -= fromUnbonding;
    }
    s.rewardDebt = (s.amount * accRewardPerShare) / PRECISION;
    _syncActivation(who, s);
    token.safeTransfer(beneficiary, slashed);
    emit Slashed(who, slashed, beneficiary);
    return slashed;
  }

  // ---------------------------------------------------------------------
  // Views
  // ---------------------------------------------------------------------

  function activeValidatorCount() external view returns (uint256) {
    return _validators.length;
  }

  function validatorAt(uint256 index) external view returns (address) {
    return _validators[index];
  }

  function isActiveValidator(address who) public view returns (bool) {
    return _validatorIndex[who] != 0;
  }

  function stakeOf(address who) external view returns (uint256) {
    return _stakes[who].amount;
  }

  function stakeInfo(address who) external view returns (StakeInfo memory) {
    return _stakes[who];
  }

  function pendingRewards(address who) external view returns (uint256) {
    StakeInfo storage s = _stakes[who];
    return s.pendingRewards + (s.amount * accRewardPerShare) / PRECISION - s.rewardDebt;
  }

  // ---------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------

  // callers re-set rewardDebt after mutating s.amount
  function _harvest(StakeInfo storage s) internal {
    if (s.amount > 0) {
      uint256 accumulated = (s.amount * accRewardPerShare) / PRECISION;
      s.pendingRewards += accumulated - s.rewardDebt;
      s.rewardDebt = accumulated;
    }
  }

  function _syncActivation(address who, StakeInfo storage s) internal {
    bool active = _validatorIndex[who] != 0;
    bool shouldBeActive = s.amount >= minStake;
    if (shouldBeActive && !active) {
      _validators.push(who);
      _validatorIndex[who] = _validators.length; // 1-based
      emit ValidatorActivated(who);
    } else if (!shouldBeActive && active) {
      uint256 idx = _validatorIndex[who] - 1;
      uint256 lastIdx = _validators.length - 1;
      if (idx != lastIdx) {
        address last = _validators[lastIdx];
        _validators[idx] = last;
        _validatorIndex[last] = idx + 1;
      }
      _validators.pop();
      _validatorIndex[who] = 0;
      emit ValidatorDeactivated(who);
    }
  }

  /// @dev Reserved storage to keep future upgrades layout-safe.
  uint256[48] private __gap;
}
