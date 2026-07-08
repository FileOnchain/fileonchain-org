#[test_only]
module fileonchain::foc_token_tests {
    use std::signer;
    use aptos_framework::account;
    use fileonchain::foc_token;

    const FOCAT: u64 = 100_000_000; // 1 FOCAT, 8 decimals

    fun setup(admin: &signer): signer {
        account::create_account_for_test(signer::address_of(admin));
        foc_token::init_for_test(admin);
        account::create_signer_for_test(@0xB41D6E)
    }

    #[test(admin = @fileonchain)]
    fun bridge_mints_and_burns(admin: &signer) {
        let bridge = setup(admin);
        foc_token::set_bridge(admin, @0xB41D6E, true);
        assert!(foc_token::is_bridge(@0xB41D6E), 0);

        // Destination side: arriving supply mints to the recipient.
        foc_token::bridge_mint(&bridge, @0xA11CE, 5 * FOCAT);
        assert!(foc_token::balance(@0xA11CE) == 5 * FOCAT, 1);

        // Source side: departing supply burns from the bridge's own store.
        foc_token::bridge_mint(&bridge, @0xB41D6E, 3 * FOCAT);
        foc_token::bridge_burn(&bridge, 3 * FOCAT);
        assert!(foc_token::balance(@0xB41D6E) == 0, 2);
    }

    #[test(admin = @fileonchain)]
    #[expected_failure(abort_code = 2, location = fileonchain::foc_token)]
    fun unapproved_bridge_cannot_mint(admin: &signer) {
        let bridge = setup(admin);
        foc_token::bridge_mint(&bridge, @0xA11CE, FOCAT);
    }

    #[test(admin = @fileonchain)]
    #[expected_failure(abort_code = 2, location = fileonchain::foc_token)]
    fun revoked_bridge_cannot_burn(admin: &signer) {
        let bridge = setup(admin);
        foc_token::set_bridge(admin, @0xB41D6E, true);
        foc_token::bridge_mint(&bridge, @0xB41D6E, FOCAT);
        foc_token::set_bridge(admin, @0xB41D6E, false);
        foc_token::bridge_burn(&bridge, FOCAT);
    }

    #[test(admin = @fileonchain, other = @0x0714E4)]
    #[expected_failure(abort_code = 1, location = fileonchain::foc_token)]
    fun non_admin_cannot_set_bridge(admin: &signer, other: &signer) {
        setup(admin);
        foc_token::set_bridge(other, @0xB41D6E, true);
    }
}
