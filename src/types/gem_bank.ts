export type GemBank = {
  "version": "0.1.0",
  "name": "gem_bank",
  "instructions": [
    {
      "name": "initBank",
      "accounts": [
        {
          "name": "bank",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "bankManager",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": []
    },
    {
      "name": "setBankFlags",
      "accounts": [
        {
          "name": "bank",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "bankManager",
          "isMut": false,
          "isSigner": true
        }
      ],
      "args": [
        {
          "name": "flags",
          "type": "u32"
        }
      ]
    },
    {
      "name": "initVault",
      "accounts": [
        {
          "name": "bank",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "vault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "creator",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "owner",
          "type": "publicKey"
        },
        {
          "name": "name",
          "type": "string"
        }
      ]
    },
    {
      "name": "setVaultLock",
      "accounts": [
        {
          "name": "bank",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "bankManager",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "vault",
          "isMut": true,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "vaultLock",
          "type": "bool"
        }
      ]
    },
    {
      "name": "updateVaultOwner",
      "accounts": [
        {
          "name": "bank",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "vault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "owner",
          "isMut": false,
          "isSigner": true
        }
      ],
      "args": [
        {
          "name": "newOwner",
          "type": "publicKey"
        }
      ]
    },
    {
      "name": "depositGem",
      "accounts": [
        {
          "name": "bank",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "vault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "owner",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "authority",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "gemBox",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "gemDepositReceipt",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "gemSource",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "gemMint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "gemRarity",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "rent",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "bumpAuth",
          "type": "u8"
        },
        {
          "name": "bumpRarity",
          "type": "u8"
        },
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "withdrawGem",
      "accounts": [
        {
          "name": "bank",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "vault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "owner",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "authority",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "gemBox",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "gemDepositReceipt",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "gemDestination",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "gemMint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "gemRarity",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "receiver",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "associatedTokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "rent",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "bumpAuth",
          "type": "u8"
        },
        {
          "name": "bumpGemBox",
          "type": "u8"
        },
        {
          "name": "bumpGdr",
          "type": "u8"
        },
        {
          "name": "bumpRarity",
          "type": "u8"
        },
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "addToWhitelist",
      "accounts": [
        {
          "name": "bank",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "bankManager",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "addressToWhitelist",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "whitelistProof",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "whitelistType",
          "type": "u8"
        }
      ]
    },
    {
      "name": "removeFromWhitelist",
      "accounts": [
        {
          "name": "bank",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "bankManager",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "fundsReceiver",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "addressToRemove",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "whitelistProof",
          "isMut": true,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "bump",
          "type": "u8"
        }
      ]
    },
    {
      "name": "updateBankManager",
      "accounts": [
        {
          "name": "bank",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "bankManager",
          "isMut": false,
          "isSigner": true
        }
      ],
      "args": [
        {
          "name": "newManager",
          "type": "publicKey"
        }
      ]
    },
    {
      "name": "recordRarityPoints",
      "accounts": [
        {
          "name": "bank",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "bankManager",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "rarityConfigs",
          "type": {
            "vec": {
              "defined": "RarityConfig"
            }
          }
        }
      ]
    },
    {
      "name": "withdrawTokensAuth",
      "accounts": [
        {
          "name": "bank",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "vault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "owner",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "authority",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "vaultAta",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "recipientAta",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "mint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "associatedTokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "rent",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "bank",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "version",
            "type": "u16"
          },
          {
            "name": "bankManager",
            "docs": [
              "sole control over gem whitelist, un/locking the vaults, and bank flags",
              "can update itself to another Pubkey"
            ],
            "type": "publicKey"
          },
          {
            "name": "flags",
            "type": "u32"
          },
          {
            "name": "whitelistedCreators",
            "docs": [
              "only gems allowed will be those that have EITHER a:",
              "1) creator from this list"
            ],
            "type": "u32"
          },
          {
            "name": "whitelistedMints",
            "docs": [
              "OR",
              "2) mint from this list"
            ],
            "type": "u32"
          },
          {
            "name": "vaultCount",
            "docs": [
              "total vault count registered with this bank"
            ],
            "type": "u64"
          },
          {
            "name": "reserved",
            "docs": [
              "reserved for future updates, has to be /8"
            ],
            "type": {
              "array": [
                "u8",
                64
              ]
            }
          }
        ]
      }
    },
    {
      "name": "gemDepositReceipt",
      "docs": [
        "GDR is necessary to locate all gem boxes for a given bank/vault",
        "see fetchAllGdrPDAs() in TS client"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "docs": [
              "each gem gox sits inside a single vault"
            ],
            "type": "publicKey"
          },
          {
            "name": "gemBoxAddress",
            "docs": [
              "the token account that actually holds the deposited gem(s)"
            ],
            "type": "publicKey"
          },
          {
            "name": "gemMint",
            "docs": [
              "the following is really stored for convenience, so we don't have to fetch gem account separately"
            ],
            "type": "publicKey"
          },
          {
            "name": "gemCount",
            "docs": [
              "number of gems deposited into this GDR",
              "in theory, if each gem is actually an NFT this number would be 1",
              "but the vault is generic enough to support fungible tokens as well, so this can be >1"
            ],
            "type": "u64"
          },
          {
            "name": "reserved",
            "docs": [
              "reserved for future updates, has to be /8"
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "rarity",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "points",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "vault",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bank",
            "docs": [
              "each vault is registered with a single bank, used for indexing"
            ],
            "type": "publicKey"
          },
          {
            "name": "owner",
            "docs": [
              "responsible for signing deposits / withdrawals into the vault",
              "(!) NOTE: does NOT un/lock the vault - the bank manager does that",
              "can update itself to another Pubkey"
            ],
            "type": "publicKey"
          },
          {
            "name": "creator",
            "docs": [
              "pubkey used to create the vault, baked into vault's PDA - NOT CHANGEABLE"
            ],
            "type": "publicKey"
          },
          {
            "name": "authority",
            "docs": [
              "signs off on any token transfers out of the gem boxes controlled by the vault"
            ],
            "type": "publicKey"
          },
          {
            "name": "authoritySeed",
            "type": "publicKey"
          },
          {
            "name": "authorityBumpSeed",
            "type": {
              "array": [
                "u8",
                1
              ]
            }
          },
          {
            "name": "locked",
            "docs": [
              "when the vault is locked, no gems can move in/out of it"
            ],
            "type": "bool"
          },
          {
            "name": "name",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "gemBoxCount",
            "docs": [
              "total number of token mints stored in the vault (gem box per mint)"
            ],
            "type": "u64"
          },
          {
            "name": "gemCount",
            "docs": [
              "gem_boxes can store >1 token, see detailed explanation on GDR"
            ],
            "type": "u64"
          },
          {
            "name": "rarityPoints",
            "docs": [
              "each gem has a rarity of 1 if not specified",
              "thus worst case, when rarities aren't enabled, this is == gem_count"
            ],
            "type": "u64"
          },
          {
            "name": "reserved",
            "docs": [
              "reserved for future updates, has to be /8"
            ],
            "type": {
              "array": [
                "u8",
                64
              ]
            }
          }
        ]
      }
    },
    {
      "name": "whitelistProof",
      "docs": [
        "whitelists are used to control what gems can/can't go into the vault",
        "currently 2 types of vault lists are supported: by mint and by creator",
        "if the whitelist PDA exists, then the mint/creator is considered accepted",
        "if at least 1 whitelist PDA exists total, then all deposit attempts will start getting checked"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "whitelistType",
            "type": "u8"
          },
          {
            "name": "whitelistedAddress",
            "type": "publicKey"
          },
          {
            "name": "bank",
            "type": "publicKey"
          }
        ]
      }
    }
  ],
  "types": [
    {
      "name": "RarityConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "publicKey"
          },
          {
            "name": "rarityPoints",
            "type": "u16"
          }
        ]
      }
    }
  ]
};

export const IDL: GemBank = {
  "version": "0.1.0",
  "name": "gem_bank",
  "instructions": [
    {
      "name": "initBank",
      "accounts": [
        {
          "name": "bank",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "bankManager",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": []
    },
    {
      "name": "setBankFlags",
      "accounts": [
        {
          "name": "bank",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "bankManager",
          "isMut": false,
          "isSigner": true
        }
      ],
      "args": [
        {
          "name": "flags",
          "type": "u32"
        }
      ]
    },
    {
      "name": "initVault",
      "accounts": [
        {
          "name": "bank",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "vault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "creator",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "owner",
          "type": "publicKey"
        },
        {
          "name": "name",
          "type": "string"
        }
      ]
    },
    {
      "name": "setVaultLock",
      "accounts": [
        {
          "name": "bank",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "bankManager",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "vault",
          "isMut": true,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "vaultLock",
          "type": "bool"
        }
      ]
    },
    {
      "name": "updateVaultOwner",
      "accounts": [
        {
          "name": "bank",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "vault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "owner",
          "isMut": false,
          "isSigner": true
        }
      ],
      "args": [
        {
          "name": "newOwner",
          "type": "publicKey"
        }
      ]
    },
    {
      "name": "depositGem",
      "accounts": [
        {
          "name": "bank",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "vault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "owner",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "authority",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "gemBox",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "gemDepositReceipt",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "gemSource",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "gemMint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "gemRarity",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "rent",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "bumpAuth",
          "type": "u8"
        },
        {
          "name": "bumpRarity",
          "type": "u8"
        },
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "withdrawGem",
      "accounts": [
        {
          "name": "bank",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "vault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "owner",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "authority",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "gemBox",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "gemDepositReceipt",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "gemDestination",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "gemMint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "gemRarity",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "receiver",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "associatedTokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "rent",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "bumpAuth",
          "type": "u8"
        },
        {
          "name": "bumpGemBox",
          "type": "u8"
        },
        {
          "name": "bumpGdr",
          "type": "u8"
        },
        {
          "name": "bumpRarity",
          "type": "u8"
        },
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "addToWhitelist",
      "accounts": [
        {
          "name": "bank",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "bankManager",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "addressToWhitelist",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "whitelistProof",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "whitelistType",
          "type": "u8"
        }
      ]
    },
    {
      "name": "removeFromWhitelist",
      "accounts": [
        {
          "name": "bank",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "bankManager",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "fundsReceiver",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "addressToRemove",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "whitelistProof",
          "isMut": true,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "bump",
          "type": "u8"
        }
      ]
    },
    {
      "name": "updateBankManager",
      "accounts": [
        {
          "name": "bank",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "bankManager",
          "isMut": false,
          "isSigner": true
        }
      ],
      "args": [
        {
          "name": "newManager",
          "type": "publicKey"
        }
      ]
    },
    {
      "name": "recordRarityPoints",
      "accounts": [
        {
          "name": "bank",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "bankManager",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "rarityConfigs",
          "type": {
            "vec": {
              "defined": "RarityConfig"
            }
          }
        }
      ]
    },
    {
      "name": "withdrawTokensAuth",
      "accounts": [
        {
          "name": "bank",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "vault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "owner",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "authority",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "vaultAta",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "recipientAta",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "mint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "associatedTokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "rent",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "bank",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "version",
            "type": "u16"
          },
          {
            "name": "bankManager",
            "docs": [
              "sole control over gem whitelist, un/locking the vaults, and bank flags",
              "can update itself to another Pubkey"
            ],
            "type": "publicKey"
          },
          {
            "name": "flags",
            "type": "u32"
          },
          {
            "name": "whitelistedCreators",
            "docs": [
              "only gems allowed will be those that have EITHER a:",
              "1) creator from this list"
            ],
            "type": "u32"
          },
          {
            "name": "whitelistedMints",
            "docs": [
              "OR",
              "2) mint from this list"
            ],
            "type": "u32"
          },
          {
            "name": "vaultCount",
            "docs": [
              "total vault count registered with this bank"
            ],
            "type": "u64"
          },
          {
            "name": "reserved",
            "docs": [
              "reserved for future updates, has to be /8"
            ],
            "type": {
              "array": [
                "u8",
                64
              ]
            }
          }
        ]
      }
    },
    {
      "name": "gemDepositReceipt",
      "docs": [
        "GDR is necessary to locate all gem boxes for a given bank/vault",
        "see fetchAllGdrPDAs() in TS client"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "docs": [
              "each gem gox sits inside a single vault"
            ],
            "type": "publicKey"
          },
          {
            "name": "gemBoxAddress",
            "docs": [
              "the token account that actually holds the deposited gem(s)"
            ],
            "type": "publicKey"
          },
          {
            "name": "gemMint",
            "docs": [
              "the following is really stored for convenience, so we don't have to fetch gem account separately"
            ],
            "type": "publicKey"
          },
          {
            "name": "gemCount",
            "docs": [
              "number of gems deposited into this GDR",
              "in theory, if each gem is actually an NFT this number would be 1",
              "but the vault is generic enough to support fungible tokens as well, so this can be >1"
            ],
            "type": "u64"
          },
          {
            "name": "reserved",
            "docs": [
              "reserved for future updates, has to be /8"
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "rarity",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "points",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "vault",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bank",
            "docs": [
              "each vault is registered with a single bank, used for indexing"
            ],
            "type": "publicKey"
          },
          {
            "name": "owner",
            "docs": [
              "responsible for signing deposits / withdrawals into the vault",
              "(!) NOTE: does NOT un/lock the vault - the bank manager does that",
              "can update itself to another Pubkey"
            ],
            "type": "publicKey"
          },
          {
            "name": "creator",
            "docs": [
              "pubkey used to create the vault, baked into vault's PDA - NOT CHANGEABLE"
            ],
            "type": "publicKey"
          },
          {
            "name": "authority",
            "docs": [
              "signs off on any token transfers out of the gem boxes controlled by the vault"
            ],
            "type": "publicKey"
          },
          {
            "name": "authoritySeed",
            "type": "publicKey"
          },
          {
            "name": "authorityBumpSeed",
            "type": {
              "array": [
                "u8",
                1
              ]
            }
          },
          {
            "name": "locked",
            "docs": [
              "when the vault is locked, no gems can move in/out of it"
            ],
            "type": "bool"
          },
          {
            "name": "name",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "gemBoxCount",
            "docs": [
              "total number of token mints stored in the vault (gem box per mint)"
            ],
            "type": "u64"
          },
          {
            "name": "gemCount",
            "docs": [
              "gem_boxes can store >1 token, see detailed explanation on GDR"
            ],
            "type": "u64"
          },
          {
            "name": "rarityPoints",
            "docs": [
              "each gem has a rarity of 1 if not specified",
              "thus worst case, when rarities aren't enabled, this is == gem_count"
            ],
            "type": "u64"
          },
          {
            "name": "reserved",
            "docs": [
              "reserved for future updates, has to be /8"
            ],
            "type": {
              "array": [
                "u8",
                64
              ]
            }
          }
        ]
      }
    },
    {
      "name": "whitelistProof",
      "docs": [
        "whitelists are used to control what gems can/can't go into the vault",
        "currently 2 types of vault lists are supported: by mint and by creator",
        "if the whitelist PDA exists, then the mint/creator is considered accepted",
        "if at least 1 whitelist PDA exists total, then all deposit attempts will start getting checked"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "whitelistType",
            "type": "u8"
          },
          {
            "name": "whitelistedAddress",
            "type": "publicKey"
          },
          {
            "name": "bank",
            "type": "publicKey"
          }
        ]
      }
    }
  ],
  "types": [
    {
      "name": "RarityConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "publicKey"
          },
          {
            "name": "rarityPoints",
            "type": "u16"
          }
        ]
      }
    }
  ]
};
