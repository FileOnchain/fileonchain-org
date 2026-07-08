//! FOCAT — the FileOnChain protocol token on NEAR, a standard NEP-141
//! fungible token (with NEP-145 storage management and NEP-148 metadata)
//! built on near-contract-standards. Denominates anchor tips,
//! propose/challenge bonds, and validator stakes for the FileOnChain
//! registry contract: NEAR has no allowances, so every paid registry action
//! is initiated with `ft_transfer_call(registry, amount, msg)` and the
//! registry's `ft_on_transfer` routes it.
//!
//! Fixed supply minted to `owner_id` at init (mirroring the EVM
//! FileOnChainAttestationToken); the owner is the admin account that executes EVM
//! governance decisions — see docs/governance.md.

use near_contract_standards::fungible_token::metadata::{
    FungibleTokenMetadata, FungibleTokenMetadataProvider, FT_METADATA_SPEC,
};
use near_contract_standards::fungible_token::FungibleToken;
use near_contract_standards::storage_management::{
    StorageBalance, StorageBalanceBounds, StorageManagement,
};
use near_sdk::borsh::BorshSerialize;
use near_sdk::collections::LazyOption;
use near_sdk::json_types::U128;
use near_sdk::{
    near, AccountId, BorshStorageKey, NearToken, PanicOnDefault, PromiseOrValue,
};

#[derive(BorshSerialize, BorshStorageKey)]
#[borsh(crate = "near_sdk::borsh")]
enum StorageKey {
    FungibleToken,
    Metadata,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct FocToken {
    token: FungibleToken,
    metadata: LazyOption<FungibleTokenMetadata>,
}

#[near]
impl FocToken {
    /// Deploy with the full fixed supply owned by `owner_id`.
    #[init]
    pub fn new(owner_id: AccountId, total_supply: U128) -> Self {
        let metadata = FungibleTokenMetadata {
            spec: FT_METADATA_SPEC.to_string(),
            name: "File On Chain Attestation Token".to_string(),
            symbol: "FOCAT".to_string(),
            icon: None,
            reference: None,
            reference_hash: None,
            decimals: 18,
        };
        metadata.assert_valid();
        let mut token = FungibleToken::new(StorageKey::FungibleToken);
        token.internal_register_account(&owner_id);
        token.internal_deposit(&owner_id, total_supply.into());
        near_contract_standards::fungible_token::events::FtMint {
            owner_id: &owner_id,
            amount: total_supply,
            memo: Some("initial supply"),
        }
        .emit();
        Self {
            token,
            metadata: LazyOption::new(StorageKey::Metadata, Some(&metadata)),
        }
    }
}

near_contract_standards::impl_fungible_token_core!(FocToken, token);

// impl_fungible_token_storage! in near-contract-standards 5.28 still emits
// the pre-NearToken storage_withdraw signature, so delegate by hand.
#[near]
impl StorageManagement for FocToken {
    #[payable]
    fn storage_deposit(
        &mut self,
        account_id: Option<AccountId>,
        registration_only: Option<bool>,
    ) -> StorageBalance {
        self.token.storage_deposit(account_id, registration_only)
    }

    #[payable]
    fn storage_withdraw(&mut self, amount: Option<NearToken>) -> StorageBalance {
        self.token.storage_withdraw(amount)
    }

    #[payable]
    fn storage_unregister(&mut self, force: Option<bool>) -> bool {
        self.token.storage_unregister(force)
    }

    fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        self.token.storage_balance_bounds()
    }

    fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.token.storage_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenMetadataProvider for FocToken {
    fn ft_metadata(&self) -> FungibleTokenMetadata {
        self.metadata.get().unwrap()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_contract_standards::fungible_token::core::FungibleTokenCore;
    use near_contract_standards::storage_management::StorageManagement;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::{testing_env, NearToken};

    const SUPPLY: u128 = 1_000_000_000_000_000_000_000_000_000; // 1B FOCAT, 18 decimals

    fn context(predecessor: AccountId) -> VMContextBuilder {
        let mut builder = VMContextBuilder::new();
        builder.predecessor_account_id(predecessor);
        builder
    }

    #[test]
    fn new_mints_supply_to_owner() {
        testing_env!(context(accounts(0)).build());
        let contract = FocToken::new(accounts(0), U128(SUPPLY));
        assert_eq!(contract.ft_total_supply().0, SUPPLY);
        assert_eq!(contract.ft_balance_of(accounts(0)).0, SUPPLY);
        assert_eq!(contract.ft_metadata().symbol, "FOCAT");
        assert_eq!(contract.ft_metadata().decimals, 18);
    }

    #[test]
    fn transfer_moves_balances() {
        testing_env!(context(accounts(0)).build());
        let mut contract = FocToken::new(accounts(0), U128(SUPPLY));

        // The receiver registers storage first (NEP-145).
        testing_env!(context(accounts(1))
            .attached_deposit(NearToken::from_near(1))
            .build());
        contract.storage_deposit(None, None);

        testing_env!(context(accounts(0))
            .attached_deposit(NearToken::from_yoctonear(1))
            .build());
        contract.ft_transfer(accounts(1), U128(500), None);
        assert_eq!(contract.ft_balance_of(accounts(1)).0, 500);
        assert_eq!(contract.ft_balance_of(accounts(0)).0, SUPPLY - 500);
    }
}
