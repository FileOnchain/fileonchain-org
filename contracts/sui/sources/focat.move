/// FOCAT — the FileOnChain protocol token on Sui, a `Coin<FOCAT>` created via
/// the one-time witness. Denominates anchor tips, propose/challenge bonds,
/// and validator stakes for `fileonchain::anchor_registry`.
///
/// The same FOCAT exists on every runtime, so the token is **bridgeable**:
/// the `TreasuryCap` lives inside a shared `TokenController` with an
/// admin-managed bridge allowlist — approved bridges burn departing supply
/// and mint arriving supply. The `TokenAdminCap` goes to the publisher (the
/// admin account that executes EVM governance decisions — see
/// docs/governance.md), which also mints any home-chain initial supply via
/// `admin_mint`. Package upgrades use Sui's native `UpgradeCap`, held by
/// the same admin.
module fileonchain::focat {
    use sui::coin::{Self, Coin, TreasuryCap};
    use sui::vec_set::{Self, VecSet};

    /// Caller is not an approved bridge.
    const E_NOT_BRIDGE: u64 = 1;

    public struct FOCAT has drop {}

    /// Gates bridge management and admin mints.
    public struct TokenAdminCap has key, store {
        id: UID,
    }

    /// Shared custody of the TreasuryCap so approved bridges can move
    /// supply between chains.
    public struct TokenController has key {
        id: UID,
        treasury: TreasuryCap<FOCAT>,
        bridges: VecSet<address>,
    }

    // create_currency is deprecated in favor of coin_registry, but remains
    // the API wallets and explorers index today; revisit when coin_registry
    // is the ecosystem default.
    #[allow(deprecated_usage)]
    fun init(witness: FOCAT, ctx: &mut TxContext) {
        let (treasury, metadata) = coin::create_currency(
            witness,
            8, // 1 FOCAT = 100_000_000 base units
            b"FOCAT",
            b"File On Chain Attestation Token",
            b"FileOnChain protocol token: anchor tips, bonds, and validator stakes.",
            option::none(),
            ctx,
        );
        transfer::public_freeze_object(metadata);
        transfer::share_object(TokenController {
            id: object::new(ctx),
            treasury,
            bridges: vec_set::empty(),
        });
        transfer::public_transfer(TokenAdminCap { id: object::new(ctx) }, ctx.sender());
    }

    // ------------------------------------------------------------------
    // Admin (the EVM-governance executor)
    // ------------------------------------------------------------------

    /// Mint home-chain initial supply (remote chains mint nothing — supply
    /// arrives through bridges).
    public entry fun admin_mint(
        controller: &mut TokenController,
        _cap: &TokenAdminCap,
        amount: u64,
        to: address,
        ctx: &mut TxContext,
    ) {
        coin::mint_and_transfer(&mut controller.treasury, amount, to, ctx);
    }

    public entry fun set_bridge(
        controller: &mut TokenController,
        _cap: &TokenAdminCap,
        bridge: address,
        enabled: bool,
    ) {
        if (enabled && !controller.bridges.contains(&bridge)) {
            controller.bridges.insert(bridge);
        } else if (!enabled && controller.bridges.contains(&bridge)) {
            controller.bridges.remove(&bridge);
        };
    }

    public fun is_bridge(controller: &TokenController, bridge: address): bool {
        controller.bridges.contains(&bridge)
    }

    // ------------------------------------------------------------------
    // Bridging (approved bridges move supply between chains)
    // ------------------------------------------------------------------

    /// Mint arriving supply to `to` (destination side of a transfer).
    public entry fun bridge_mint(
        controller: &mut TokenController,
        amount: u64,
        to: address,
        ctx: &mut TxContext,
    ) {
        assert!(controller.bridges.contains(&ctx.sender()), E_NOT_BRIDGE);
        coin::mint_and_transfer(&mut controller.treasury, amount, to, ctx);
    }

    /// Burn departing supply (source side — the bridge holds the coin the
    /// user handed over).
    public entry fun bridge_burn(controller: &mut TokenController, departing: Coin<FOCAT>, ctx: &TxContext) {
        assert!(controller.bridges.contains(&ctx.sender()), E_NOT_BRIDGE);
        coin::burn(&mut controller.treasury, departing);
    }

    #[test_only]
    public fun init_for_test(ctx: &mut TxContext) {
        init(FOCAT {}, ctx);
    }
}
