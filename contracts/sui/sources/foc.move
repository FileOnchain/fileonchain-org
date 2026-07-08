/// FOC — the FileOnChain protocol token on Sui, a `Coin<FOC>` created via
/// the one-time witness. Denominates anchor tips, propose/challenge bonds,
/// and validator stakes for `fileonchain::anchor_registry`.
///
/// The `TreasuryCap` goes to the publisher (the admin account that executes
/// EVM governance decisions — see docs/governance.md); supply is minted
/// from it (`sui client call ... coin::mint_and_transfer`) rather than at
/// init, since `init` cannot know the distribution.
module fileonchain::foc {
    use sui::coin;

    public struct FOC has drop {}

    // create_currency is deprecated in favor of coin_registry, but remains
    // the API wallets and explorers index today; revisit when coin_registry
    // is the ecosystem default.
    #[allow(deprecated_usage)]
    fun init(witness: FOC, ctx: &mut TxContext) {
        let (treasury, metadata) = coin::create_currency(
            witness,
            8, // 1 FOC = 100_000_000 base units
            b"FOC",
            b"FileOnChain",
            b"FileOnChain protocol token: anchor tips, bonds, and validator stakes.",
            option::none(),
            ctx,
        );
        transfer::public_freeze_object(metadata);
        transfer::public_transfer(treasury, ctx.sender());
    }

    #[test_only]
    public fun init_for_test(ctx: &mut TxContext) {
        init(FOC {}, ctx);
    }
}
