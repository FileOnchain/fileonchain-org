#[test_only]
module fileonchain::focat_tests {
    use sui::coin::Coin;
    use sui::test_scenario::{Self as ts};
    use fileonchain::focat::{Self, TokenAdminCap, TokenController, FOCAT};

    const ADMIN: address = @0xAD;
    const BRIDGE: address = @0xB41D6E;
    const ALICE: address = @0xA11CE;

    const FOCAT_UNIT: u64 = 100_000_000;

    fun setup(): ts::Scenario {
        let mut scenario = ts::begin(ADMIN);
        focat::init_for_test(scenario.ctx());
        scenario.next_tx(ADMIN);
        {
            let mut controller = scenario.take_shared<TokenController>();
            let cap = scenario.take_from_sender<TokenAdminCap>();
            focat::set_bridge(&mut controller, &cap, BRIDGE, true);
            scenario.return_to_sender(cap);
            ts::return_shared(controller);
        };
        scenario
    }

    #[test]
    fun bridge_mints_and_burns() {
        let mut scenario = setup();

        // Destination side: arriving supply mints to the recipient.
        scenario.next_tx(BRIDGE);
        {
            let mut controller = scenario.take_shared<TokenController>();
            assert!(focat::is_bridge(&controller, BRIDGE));
            focat::bridge_mint(&mut controller, 5 * FOCAT_UNIT, ALICE, scenario.ctx());
            focat::bridge_mint(&mut controller, 3 * FOCAT_UNIT, BRIDGE, scenario.ctx());
            ts::return_shared(controller);
        };
        scenario.next_tx(ALICE);
        {
            let minted = scenario.take_from_sender<Coin<FOCAT>>();
            assert!(minted.value() == 5 * FOCAT_UNIT);
            scenario.return_to_sender(minted);
        };

        // Source side: departing supply burns from the bridge's custody.
        scenario.next_tx(BRIDGE);
        {
            let mut controller = scenario.take_shared<TokenController>();
            let departing = scenario.take_from_sender<Coin<FOCAT>>();
            focat::bridge_burn(&mut controller, departing, scenario.ctx());
            ts::return_shared(controller);
        };
        scenario.end();
    }

    #[test]
    fun admin_mints_home_supply() {
        let mut scenario = setup();
        scenario.next_tx(ADMIN);
        {
            let mut controller = scenario.take_shared<TokenController>();
            let cap = scenario.take_from_sender<TokenAdminCap>();
            focat::admin_mint(&mut controller, &cap, 10 * FOCAT_UNIT, ALICE, scenario.ctx());
            scenario.return_to_sender(cap);
            ts::return_shared(controller);
        };
        scenario.next_tx(ALICE);
        {
            let minted = scenario.take_from_sender<Coin<FOCAT>>();
            assert!(minted.value() == 10 * FOCAT_UNIT);
            scenario.return_to_sender(minted);
        };
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = 1, location = fileonchain::focat)]
    fun unapproved_bridge_cannot_mint() {
        let mut scenario = setup();
        scenario.next_tx(ALICE);
        {
            let mut controller = scenario.take_shared<TokenController>();
            focat::bridge_mint(&mut controller, FOCAT_UNIT, ALICE, scenario.ctx());
            ts::return_shared(controller);
        };
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = 1, location = fileonchain::focat)]
    fun revoked_bridge_cannot_mint() {
        let mut scenario = setup();
        scenario.next_tx(ADMIN);
        {
            let mut controller = scenario.take_shared<TokenController>();
            let cap = scenario.take_from_sender<TokenAdminCap>();
            focat::set_bridge(&mut controller, &cap, BRIDGE, false);
            scenario.return_to_sender(cap);
            ts::return_shared(controller);
        };
        scenario.next_tx(BRIDGE);
        {
            let mut controller = scenario.take_shared<TokenController>();
            focat::bridge_mint(&mut controller, FOCAT_UNIT, ALICE, scenario.ctx());
            ts::return_shared(controller);
        };
        scenario.end();
    }
}
