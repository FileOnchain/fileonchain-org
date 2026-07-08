/**
 * ABI for contracts/evm/src/PlatformRegistry.sol — generated from the Foundry build
 * output (contracts/evm/out). Regenerate after changing the contract:
 * cd contracts/evm && forge build, then re-run the extraction (see packages/sdk-evm/scripts/extract-abis.mjs).
 */
export const platformRegistryAbi = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "_maxPlatformFeeBps",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getPlatform",
    "inputs": [
      {
        "name": "platformId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct PlatformRegistry.Platform",
        "components": [
          {
            "name": "owner",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "treasury",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "feeBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "active",
            "type": "bool",
            "internalType": "bool"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "isActivePlatform",
    "inputs": [
      {
        "name": "platformId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "maxPlatformFeeBps",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "nextPlatformId",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "owner",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "registerPlatform",
    "inputs": [
      {
        "name": "platformOwner",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "treasury",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "feeBps",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "outputs": [
      {
        "name": "platformId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "renounceOwnership",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setMaxPlatformFeeBps",
    "inputs": [
      {
        "name": "newMax",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setPlatformActive",
    "inputs": [
      {
        "name": "platformId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "active",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "transferOwnership",
    "inputs": [
      {
        "name": "newOwner",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "transferPlatformOwnership",
    "inputs": [
      {
        "name": "platformId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "newOwner",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "updatePlatform",
    "inputs": [
      {
        "name": "platformId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "treasury",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "feeBps",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "MaxPlatformFeeBpsUpdated",
    "inputs": [
      {
        "name": "previous",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      },
      {
        "name": "next",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OwnershipTransferred",
    "inputs": [
      {
        "name": "previousOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "newOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PlatformRegistered",
    "inputs": [
      {
        "name": "platformId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "owner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "treasury",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "feeBps",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PlatformStatusChanged",
    "inputs": [
      {
        "name": "platformId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "active",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PlatformUpdated",
    "inputs": [
      {
        "name": "platformId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "treasury",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "feeBps",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "OwnableInvalidOwner",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "OwnableUnauthorizedAccount",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ]
  }
] as const;
