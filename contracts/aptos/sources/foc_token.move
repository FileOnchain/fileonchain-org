/// FOCAT — the FileOnChain protocol token on Aptos, as a Fungible Asset with
/// primary stores. Denominates anchor tips, propose/challenge bonds, and
/// validator stakes for `fileonchain::anchor_registry`.
///
/// Supply is minted once to the publisher at `init_module` (mirroring the
/// fixed-supply EVM FileOnChainAttestationToken); `mint` stays admin-gated for
/// testnets. Protocol parameters on Aptos are administered by the account
/// that executes EVM governance decisions — see docs/governance.md.
module fileonchain::foc_token {
    use std::option;
    use std::signer;
    use std::string;
    use aptos_framework::fungible_asset::{Self, BurnRef, MintRef, Metadata};
    use aptos_framework::object::{Self, Object};
    use aptos_framework::primary_fungible_store;

    const ASSET_SYMBOL: vector<u8> = b"FOCAT";
    /// 8 decimals; 1 FOCAT = 100_000_000 base units.
    const DECIMALS: u8 = 8;
    /// 1B FOCAT minted to the publisher.
    const INITIAL_SUPPLY: u64 = 100_000_000_000_000_000;

    /// Caller is not the token admin.
    const E_NOT_ADMIN: u64 = 1;
    /// Caller is not an approved bridge.
    const E_NOT_BRIDGE: u64 = 2;

    /// Held under the metadata object; `mint` survives for testnet faucets.
    struct Managed has key {
        mint_ref: MintRef,
        burn_ref: BurnRef,
    }

    /// Bridge allowlist under @fileonchain. The same FOCAT exists on every
    /// runtime; approved bridges move supply by burning here and minting on
    /// the destination (and vice versa). Admin-managed — the admin executes
    /// EVM governance decisions (docs/governance.md).
    struct Bridges has key {
        approved: aptos_std::smart_table::SmartTable<address, bool>,
    }

    fun init_module(admin: &signer) {
        let constructor_ref = &object::create_named_object(admin, ASSET_SYMBOL);
        primary_fungible_store::create_primary_store_enabled_fungible_asset(
            constructor_ref,
            option::none(),
            string::utf8(b"File On Chain Attestation Token"),
            string::utf8(ASSET_SYMBOL),
            DECIMALS,
            string::utf8(b""),
            string::utf8(b"https://fileonchain.org"),
        );
        let mint_ref = fungible_asset::generate_mint_ref(constructor_ref);
        let burn_ref = fungible_asset::generate_burn_ref(constructor_ref);
        primary_fungible_store::mint(&mint_ref, signer::address_of(admin), INITIAL_SUPPLY);
        move_to(&object::generate_signer(constructor_ref), Managed { mint_ref, burn_ref });
        move_to(admin, Bridges { approved: aptos_std::smart_table::new() });
    }

    #[view]
    public fun metadata(): Object<Metadata> {
        object::address_to_object<Metadata>(
            object::create_object_address(&@fileonchain, ASSET_SYMBOL)
        )
    }

    #[view]
    public fun balance(owner: address): u64 {
        primary_fungible_store::balance(owner, metadata())
    }

    /// Admin-gated mint (testnet faucet; the initial supply already minted).
    public entry fun mint(admin: &signer, to: address, amount: u64) acquires Managed {
        assert!(signer::address_of(admin) == @fileonchain, E_NOT_ADMIN);
        let managed = borrow_global<Managed>(object::object_address(&metadata()));
        primary_fungible_store::mint(&managed.mint_ref, to, amount);
    }

    // ------------------------------------------------------------------
    // Bridging (admin-approved bridges move supply between chains)
    // ------------------------------------------------------------------

    public entry fun set_bridge(admin: &signer, bridge: address, enabled: bool) acquires Bridges {
        assert!(signer::address_of(admin) == @fileonchain, E_NOT_ADMIN);
        let bridges = borrow_global_mut<Bridges>(@fileonchain);
        aptos_std::smart_table::upsert(&mut bridges.approved, bridge, enabled);
    }

    #[view]
    public fun is_bridge(bridge: address): bool acquires Bridges {
        let bridges = borrow_global<Bridges>(@fileonchain);
        *aptos_std::smart_table::borrow_with_default(&bridges.approved, bridge, &false)
    }

    fun assert_bridge(caller: &signer) acquires Bridges {
        assert!(is_bridge(signer::address_of(caller)), E_NOT_BRIDGE);
    }

    /// Mint arriving supply to `to` (destination side of a transfer).
    public entry fun bridge_mint(bridge: &signer, to: address, amount: u64) acquires Bridges, Managed {
        assert_bridge(bridge);
        let managed = borrow_global<Managed>(object::object_address(&metadata()));
        primary_fungible_store::mint(&managed.mint_ref, to, amount);
    }

    /// Burn departing supply from the bridge's own store (source side —
    /// the user transfers to the bridge first).
    public entry fun bridge_burn(bridge: &signer, amount: u64) acquires Bridges, Managed {
        assert_bridge(bridge);
        let managed = borrow_global<Managed>(object::object_address(&metadata()));
        primary_fungible_store::burn(&managed.burn_ref, signer::address_of(bridge), amount);
    }

    #[test_only]
    public fun init_for_test(admin: &signer) {
        init_module(admin);
    }
}
