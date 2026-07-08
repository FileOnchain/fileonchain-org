// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import {ERC20PermitUpgradeable} from
  "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PermitUpgradeable.sol";
import {ERC20VotesUpgradeable} from
  "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20VotesUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {NoncesUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/NoncesUpgradeable.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/// @notice ERC-7802 crosschain mint/burn surface, implemented by the token
/// so any governance-approved bridge can move FOCAT between chains.
interface IERC7802 {
  event CrosschainMint(address indexed to, uint256 amount, address indexed sender);
  event CrosschainBurn(address indexed from, uint256 amount, address indexed sender);

  function crosschainMint(address to, uint256 amount) external;
  function crosschainBurn(address from, uint256 amount) external;
}

/// @title FileOnChainAttestationToken
/// @notice FOCAT — the FileOnChain protocol token. Denominates anchor tips,
/// propose/challenge bonds, and validator stakes, and carries governance
/// voting power (ERC20Votes) for the FileOnChainGovernor.
///
/// The same token exists on every chain the FileRegistry deploys to, so it
/// is **bridgeable**: governance grants per-bridge mint/burn rate limits
/// (xERC20-style linear replenishment over one day) and approved bridges
/// move supply with the ERC-7802 `crosschainMint`/`crosschainBurn` pair —
/// burn on the source chain, mint on the destination. The initial supply
/// mints only on the home chain; remote deployments initialize with zero
/// supply and receive tokens exclusively through bridges. No bridge vendor
/// is hard-coded; limits are the blast-radius cap per bridge.
///
/// Deployed behind an OZ TransparentUpgradeableProxy (initializer style,
/// no constructor state); the ProxyAdmin is owned by the timelock.
contract FileOnChainAttestationToken is
  Initializable,
  ERC20Upgradeable,
  ERC20PermitUpgradeable,
  ERC20VotesUpgradeable,
  OwnableUpgradeable,
  IERC7802
{
  // ---------------------------------------------------------------------
  // Types
  // ---------------------------------------------------------------------

  /// @dev xERC20-style rate limits: `remaining` replenishes linearly toward
  /// `max` over LIMIT_REPLENISH_DURATION.
  struct BridgeLimits {
    uint256 maxMint;
    uint256 maxBurn;
    uint256 mintRemaining;
    uint256 burnRemaining;
    uint64 lastUpdated;
  }

  // ---------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------

  event BridgeLimitsSet(address indexed bridge, uint256 mintLimit, uint256 burnLimit);

  // ---------------------------------------------------------------------
  // Storage
  // ---------------------------------------------------------------------

  /// @notice Window over which a bridge's spent limits replenish in full.
  uint256 public constant LIMIT_REPLENISH_DURATION = 1 days;

  mapping(address => BridgeLimits) private _bridges;

  // ---------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    _disableInitializers();
  }

  /// @notice Initialize the proxy. `initialSupply` is minted to
  /// `initialHolder` on the home chain only — pass 0 on remote chains,
  /// where supply arrives exclusively through approved bridges.
  function initialize(
    address initialHolder,
    uint256 initialSupply,
    address initialOwner
  ) external initializer {
    __ERC20_init("File On Chain Attestation Token", "FOCAT");
    __ERC20Permit_init("File On Chain Attestation Token");
    __ERC20Votes_init();
    __Ownable_init(initialOwner);
    if (initialSupply > 0) {
      require(initialHolder != address(0), "FOCAT: zero holder");
      _mint(initialHolder, initialSupply);
    }
  }

  // ---------------------------------------------------------------------
  // Bridge management (owner = timelock)
  // ---------------------------------------------------------------------

  /// @notice Grant (or update) a bridge's mint/burn rate limits. Setting
  /// both to zero revokes the bridge. Limits restart full.
  function setBridgeLimits(address bridge, uint256 mintLimit, uint256 burnLimit) external onlyOwner {
    require(bridge != address(0), "FOCAT: zero bridge");
    _bridges[bridge] = BridgeLimits({
      maxMint: mintLimit,
      maxBurn: burnLimit,
      mintRemaining: mintLimit,
      burnRemaining: burnLimit,
      lastUpdated: uint64(block.timestamp)
    });
    emit BridgeLimitsSet(bridge, mintLimit, burnLimit);
  }

  // ---------------------------------------------------------------------
  // ERC-7802 crosschain supply movement (approved bridges only)
  // ---------------------------------------------------------------------

  /// @inheritdoc IERC7802
  function crosschainMint(address to, uint256 amount) external {
    _consumeMintLimit(msg.sender, amount);
    _mint(to, amount);
    emit CrosschainMint(to, amount, msg.sender);
  }

  /// @inheritdoc IERC7802
  /// @dev Burns from `from`; a bridge burning tokens it does not hold needs
  /// an allowance from the holder, exactly like transferFrom.
  function crosschainBurn(address from, uint256 amount) external {
    _consumeBurnLimit(msg.sender, amount);
    if (from != msg.sender) {
      _spendAllowance(from, msg.sender, amount);
    }
    _burn(from, amount);
    emit CrosschainBurn(from, amount, msg.sender);
  }

  // ---------------------------------------------------------------------
  // Bridge limit views
  // ---------------------------------------------------------------------

  function mintingMaxLimitOf(address bridge) external view returns (uint256) {
    return _bridges[bridge].maxMint;
  }

  function burningMaxLimitOf(address bridge) external view returns (uint256) {
    return _bridges[bridge].maxBurn;
  }

  function mintingCurrentLimitOf(address bridge) public view returns (uint256) {
    BridgeLimits storage limits = _bridges[bridge];
    return _currentLimit(limits.mintRemaining, limits.maxMint, limits.lastUpdated);
  }

  function burningCurrentLimitOf(address bridge) public view returns (uint256) {
    BridgeLimits storage limits = _bridges[bridge];
    return _currentLimit(limits.burnRemaining, limits.maxBurn, limits.lastUpdated);
  }

  function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
    return interfaceId == type(IERC7802).interfaceId || interfaceId == type(IERC165).interfaceId;
  }

  // ---------------------------------------------------------------------
  // Internal — limit accounting
  // ---------------------------------------------------------------------

  function _currentLimit(uint256 remaining, uint256 max, uint64 lastUpdated) internal view returns (uint256) {
    if (remaining >= max) return max;
    uint256 replenished = (max * (block.timestamp - lastUpdated)) / LIMIT_REPLENISH_DURATION;
    uint256 current = remaining + replenished;
    return current > max ? max : current;
  }

  function _consumeMintLimit(address bridge, uint256 amount) internal {
    uint256 current = mintingCurrentLimitOf(bridge);
    require(current >= amount, "FOCAT: mint limit exceeded");
    BridgeLimits storage limits = _bridges[bridge];
    limits.mintRemaining = current - amount;
    limits.burnRemaining = burningCurrentLimitOf(bridge);
    limits.lastUpdated = uint64(block.timestamp);
  }

  function _consumeBurnLimit(address bridge, uint256 amount) internal {
    uint256 current = burningCurrentLimitOf(bridge);
    require(current >= amount, "FOCAT: burn limit exceeded");
    BridgeLimits storage limits = _bridges[bridge];
    limits.burnRemaining = current - amount;
    limits.mintRemaining = mintingCurrentLimitOf(bridge);
    limits.lastUpdated = uint64(block.timestamp);
  }

  // ---------------------------------------------------------------------
  // Required overrides (ERC20Votes checkpoints on every transfer)
  // ---------------------------------------------------------------------

  function _update(
    address from,
    address to,
    uint256 value
  ) internal override(ERC20Upgradeable, ERC20VotesUpgradeable) {
    super._update(from, to, value);
  }

  function nonces(
    address owner
  ) public view override(ERC20PermitUpgradeable, NoncesUpgradeable) returns (uint256) {
    return super.nonces(owner);
  }

  /// @dev Reserved storage to keep future upgrades layout-safe.
  uint256[48] private __gap;
}
