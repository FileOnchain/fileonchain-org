// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "../CachePayments.sol";

/// @notice Minimal USDC mock for tests. Not for production.
contract MockUSDC is IERC20 {
  string public name = "USD Coin";
  string public symbol = "USDC";
  uint8 public decimals = 6;

  mapping(address => uint256) public balanceOf;
  mapping(address => mapping(address => uint256)) public allowance;
  uint256 public totalSupply;

  event Transfer(address indexed from, address indexed to, uint256 value);
  event Approval(address indexed owner, address indexed spender, uint256 value);

  function mint(address to, uint256 amount) external {
    balanceOf[to] += amount;
    totalSupply += amount;
    emit Transfer(address(0), to, amount);
  }

  function burn(address from, uint256 amount) external {
    require(balanceOf[from] >= amount, "MockUSDC: insufficient balance");
    balanceOf[from] -= amount;
    totalSupply -= amount;
    emit Transfer(from, address(0), amount);
  }

  function transfer(address to, uint256 amount) external returns (bool) {
    _transfer(msg.sender, to, amount);
    return true;
  }

  function transferFrom(address from, address to, uint256 amount) external returns (bool) {
    uint256 allowed = allowance[from][msg.sender];
    if (allowed != type(uint256).max) {
      require(allowed >= amount, "MockUSDC: insufficient allowance");
      allowance[from][msg.sender] = allowed - amount;
    }
    _transfer(from, to, amount);
    return true;
  }

  function approve(address spender, uint256 amount) external returns (bool) {
    allowance[msg.sender][spender] = amount;
    emit Approval(msg.sender, spender, amount);
    return true;
  }

  function _transfer(address from, address to, uint256 amount) internal {
    require(balanceOf[from] >= amount, "MockUSDC: insufficient balance");
    balanceOf[from] -= amount;
    balanceOf[to] += amount;
    emit Transfer(from, to, amount);
  }
}