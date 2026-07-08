#[test_only]
module fileonchain::anchor_registry_tests {
    use std::string::{Self, String};
    use sui::clock::{Self, Clock};
    use sui::coin;
    use sui::random::{Self, Random};
    use sui::test_scenario::{Self as ts, Scenario};
    use fileonchain::anchor_registry::{Self as reg, AnchorRegistry, AdminCap};
    use fileonchain::focat::FOCAT;

    const ADMIN: address = @0xAD;
    const ALICE: address = @0xA11CE;
    const BOB: address = @0xB0B;
    const CAROL: address = @0xCA401;

    const FOCAT_UNIT: u64 = 100_000_000;
    const TIP: u64 = 100 * 100_000_000;
    const BOND: u64 = 100 * 100_000_000;
    const STAKE: u64 = 1_000 * 100_000_000;
    const JUROR_SLASH: u64 = 50 * 100_000_000;
    const CHALLENGE_WINDOW_MS: u64 = 86_400_000;
    const VOTE_WINDOW_MS: u64 = 172_800_000;

    const VALIDATORS: vector<address> = vector[@0x101, @0x102, @0x103, @0x104, @0x105, @0x106];

    fun cid_a(): String {
        string::utf8(b"bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi")
    }

    fun setup(): (Scenario, Clock) {
        let mut scenario = ts::begin(ADMIN);
        reg::init_for_test(scenario.ctx());
        scenario.next_tx(@0x0);
        random::create_for_testing(scenario.ctx());
        scenario.next_tx(ADMIN);
        let clock = clock::create_for_testing(scenario.ctx());

        // Six staked validators so a jury of five can always be drawn.
        let mut i = 0;
        while (i < VALIDATORS.length()) {
            let validator = VALIDATORS[i];
            scenario.next_tx(validator);
            let mut registry = scenario.take_shared<AnchorRegistry>();
            reg::stake(&mut registry, coin::mint_for_testing<FOCAT>(STAKE, scenario.ctx()), scenario.ctx());
            ts::return_shared(registry);
            i = i + 1;
        };
        (scenario, clock)
    }

    fun propose_as(scenario: &mut Scenario, clock: &Clock, who: address, tip: u64) {
        scenario.next_tx(who);
        let mut registry = scenario.take_shared<AnchorRegistry>();
        reg::propose_anchor(
            &mut registry,
            coin::mint_for_testing<FOCAT>(tip + BOND, scenario.ctx()),
            cid_a(),
            b"contenthash",
            string::utf8(b"ipfs://bafy.../file"),
            1,
            tip,
            clock,
            scenario.ctx(),
        );
        ts::return_shared(registry);
    }

    fun challenge_as(scenario: &mut Scenario, clock: &Clock, who: address, proposal_id: u64) {
        scenario.next_tx(who);
        let mut registry = scenario.take_shared<AnchorRegistry>();
        let r = scenario.take_shared<Random>();
        reg::challenge_for_test(
            &mut registry,
            coin::mint_for_testing<FOCAT>(BOND, scenario.ctx()),
            proposal_id,
            &r,
            clock,
            scenario.ctx(),
        );
        ts::return_shared(r);
        ts::return_shared(registry);
    }

    fun finalize_as(scenario: &mut Scenario, clock: &Clock, who: address, proposal_id: u64) {
        scenario.next_tx(who);
        let mut registry = scenario.take_shared<AnchorRegistry>();
        reg::finalize(&mut registry, proposal_id, clock);
        ts::return_shared(registry);
    }

    fun resolve_as(scenario: &mut Scenario, clock: &Clock, who: address, proposal_id: u64) {
        scenario.next_tx(who);
        let mut registry = scenario.take_shared<AnchorRegistry>();
        reg::resolve_dispute(&mut registry, proposal_id, clock);
        ts::return_shared(registry);
    }

    /// Cast `upholds` votes for and `rejects` against, in juror order.
    fun vote_split(
        scenario: &mut Scenario,
        clock: &Clock,
        proposal_id: u64,
        upholds: u64,
        rejects: u64,
    ): vector<address> {
        scenario.next_tx(ADMIN);
        let jurors = {
            let registry = scenario.take_shared<AnchorRegistry>();
            let jurors = reg::jurors_of(&registry, proposal_id);
            ts::return_shared(registry);
            jurors
        };
        let mut i = 0;
        while (i < upholds + rejects) {
            let juror = jurors[i];
            scenario.next_tx(juror);
            let mut registry = scenario.take_shared<AnchorRegistry>();
            reg::cast_vote(&mut registry, proposal_id, i < upholds, clock, scenario.ctx());
            ts::return_shared(registry);
            i = i + 1;
        };
        jurors
    }

    fun status_of(scenario: &mut Scenario, proposal_id: u64): u8 {
        scenario.next_tx(ADMIN);
        let registry = scenario.take_shared<AnchorRegistry>();
        let (status, _, _, _, _, _, _) = reg::get_proposal(&registry, proposal_id);
        ts::return_shared(registry);
        status
    }

    fun withdrawable_of(scenario: &mut Scenario, who: address): u64 {
        scenario.next_tx(ADMIN);
        let registry = scenario.take_shared<AnchorRegistry>();
        let amount = reg::withdrawable_of(&registry, who);
        ts::return_shared(registry);
        amount
    }

    fun stake_of(scenario: &mut Scenario, who: address): u64 {
        scenario.next_tx(ADMIN);
        let registry = scenario.take_shared<AnchorRegistry>();
        let amount = reg::stake_of(&registry, who);
        ts::return_shared(registry);
        amount
    }

    fun finish(scenario: Scenario, clock: Clock) {
        clock.destroy_for_testing();
        scenario.end();
    }

    // ------------------------------------------------------------------
    // Propose / finalize
    // ------------------------------------------------------------------

    #[test]
    fun propose_stores_and_finalize_splits_fees() {
        let (mut scenario, mut clock) = setup();
        propose_as(&mut scenario, &clock, ALICE, TIP);
        assert!(status_of(&mut scenario, 1) == 1); // Proposed

        clock.increment_for_testing(CHALLENGE_WINDOW_MS + 1);
        finalize_as(&mut scenario, &clock, BOB, 1);

        assert!(status_of(&mut scenario, 1) == 3); // Verified
        // 25 platform + 15 protocol both credit ADMIN (platform 1 treasury).
        assert!(withdrawable_of(&mut scenario, ADMIN) == 40 * FOCAT_UNIT);
        // Bond returned to the proposer.
        assert!(withdrawable_of(&mut scenario, ALICE) == BOND);

        // 60 FOCAT over six equal validators = 10 FOCAT each; claim pays out.
        scenario.next_tx(@0x101);
        {
            let mut registry = scenario.take_shared<AnchorRegistry>();
            assert!(reg::pending_rewards(&registry, @0x101) == 10 * FOCAT_UNIT);
            reg::claim_rewards(&mut registry, scenario.ctx());
            ts::return_shared(registry);
        };
        scenario.next_tx(@0x101);
        {
            let reward = scenario.take_from_sender<coin::Coin<FOCAT>>();
            assert!(reward.value() == 10 * FOCAT_UNIT);
            scenario.return_to_sender(reward);
        };

        // Withdraw pays the proposer's bond back as a real coin.
        scenario.next_tx(ALICE);
        {
            let mut registry = scenario.take_shared<AnchorRegistry>();
            reg::withdraw(&mut registry, scenario.ctx());
            ts::return_shared(registry);
        };
        scenario.next_tx(ALICE);
        {
            let refund = scenario.take_from_sender<coin::Coin<FOCAT>>();
            assert!(refund.value() == BOND);
            scenario.return_to_sender(refund);
        };
        finish(scenario, clock);
    }

    #[test]
    #[expected_failure(abort_code = 3, location = fileonchain::anchor_registry)]
    fun propose_rejects_low_tip() {
        let (mut scenario, clock) = setup();
        propose_as(&mut scenario, &clock, ALICE, FOCAT_UNIT - 1);
        finish(scenario, clock);
    }

    #[test]
    #[expected_failure(abort_code = 26, location = fileonchain::anchor_registry)]
    fun propose_rejects_wrong_payment() {
        let (mut scenario, clock) = setup();
        scenario.next_tx(ALICE);
        let mut registry = scenario.take_shared<AnchorRegistry>();
        reg::propose_anchor(
            &mut registry,
            coin::mint_for_testing<FOCAT>(TIP, scenario.ctx()), // missing the bond
            cid_a(),
            b"",
            string::utf8(b""),
            1,
            TIP,
            &clock,
            scenario.ctx(),
        );
        ts::return_shared(registry);
        finish(scenario, clock);
    }

    #[test]
    #[expected_failure(abort_code = 2, location = fileonchain::anchor_registry)]
    fun propose_rejects_verified_cid() {
        let (mut scenario, mut clock) = setup();
        propose_as(&mut scenario, &clock, ALICE, TIP);
        clock.increment_for_testing(CHALLENGE_WINDOW_MS + 1);
        finalize_as(&mut scenario, &clock, ALICE, 1);
        propose_as(&mut scenario, &clock, BOB, TIP);
        finish(scenario, clock);
    }

    #[test]
    #[expected_failure(abort_code = 6, location = fileonchain::anchor_registry)]
    fun finalize_rejects_open_window() {
        let (mut scenario, clock) = setup();
        propose_as(&mut scenario, &clock, ALICE, TIP);
        finalize_as(&mut scenario, &clock, ALICE, 1);
        finish(scenario, clock);
    }

    #[test]
    fun race_loser_refunded() {
        let (mut scenario, mut clock) = setup();
        propose_as(&mut scenario, &clock, ALICE, TIP);
        propose_as(&mut scenario, &clock, BOB, TIP);
        clock.increment_for_testing(CHALLENGE_WINDOW_MS + 1);
        finalize_as(&mut scenario, &clock, ALICE, 1);
        finalize_as(&mut scenario, &clock, BOB, 2);
        assert!(status_of(&mut scenario, 2) == 4); // Rejected
        assert!(withdrawable_of(&mut scenario, BOB) == TIP + BOND);
        finish(scenario, clock);
    }

    // ------------------------------------------------------------------
    // Disputes
    // ------------------------------------------------------------------

    #[test]
    fun challenge_draws_distinct_jury() {
        let (mut scenario, clock) = setup();
        propose_as(&mut scenario, &clock, ALICE, TIP);
        challenge_as(&mut scenario, &clock, BOB, 1);
        assert!(status_of(&mut scenario, 1) == 2); // Challenged

        scenario.next_tx(ADMIN);
        let registry = scenario.take_shared<AnchorRegistry>();
        let jurors = reg::jurors_of(&registry, 1);
        assert!(jurors.length() == 5);
        let mut i = 0;
        while (i < 5) {
            let juror = jurors[i];
            assert!(juror != ALICE && juror != BOB);
            assert!(VALIDATORS.contains(&juror));
            let mut j = i + 1;
            while (j < 5) {
                assert!(juror != jurors[j]);
                j = j + 1;
            };
            i = i + 1;
        };
        ts::return_shared(registry);
        finish(scenario, clock);
    }

    #[test]
    #[expected_failure(abort_code = 7, location = fileonchain::anchor_registry)]
    fun challenge_rejects_closed_window() {
        let (mut scenario, mut clock) = setup();
        propose_as(&mut scenario, &clock, ALICE, TIP);
        clock.increment_for_testing(CHALLENGE_WINDOW_MS + 1);
        challenge_as(&mut scenario, &clock, BOB, 1);
        finish(scenario, clock);
    }

    #[test]
    fun challenger_wins_slashes_and_pays() {
        let (mut scenario, mut clock) = setup();
        propose_as(&mut scenario, &clock, ALICE, TIP);
        challenge_as(&mut scenario, &clock, BOB, 1);
        let jurors = vote_split(&mut scenario, &clock, 1, 2, 3); // challenger wins
        clock.increment_for_testing(VOTE_WINDOW_MS + 1);
        resolve_as(&mut scenario, &clock, BOB, 1);

        assert!(status_of(&mut scenario, 1) == 4); // Rejected
        // Proposer: tip refunded, bond slashed.
        assert!(withdrawable_of(&mut scenario, ALICE) == TIP);
        // Challenger: own bond back + half the proposer bond.
        assert!(withdrawable_of(&mut scenario, BOB) == BOND + BOND / 2);
        // Losing jurors slashed; winners split bond/2 + slashes.
        assert!(stake_of(&mut scenario, jurors[0]) == STAKE - JUROR_SLASH);
        assert!(stake_of(&mut scenario, jurors[1]) == STAKE - JUROR_SLASH);
        let per_winner = (BOND / 2 + 2 * JUROR_SLASH) / 3;
        assert!(withdrawable_of(&mut scenario, jurors[2]) == per_winner);
        // The CID is free again — a corrected proposal is allowed.
        propose_as(&mut scenario, &clock, CAROL, TIP);
        finish(scenario, clock);
    }

    #[test]
    fun proposer_wins_verifies_and_slashes_challenger() {
        let (mut scenario, mut clock) = setup();
        propose_as(&mut scenario, &clock, ALICE, TIP);
        challenge_as(&mut scenario, &clock, BOB, 1);
        let jurors = vote_split(&mut scenario, &clock, 1, 3, 2); // proposer wins
        clock.increment_for_testing(VOTE_WINDOW_MS + 1);
        resolve_as(&mut scenario, &clock, ALICE, 1);

        assert!(status_of(&mut scenario, 1) == 3); // Verified
        assert!(withdrawable_of(&mut scenario, ALICE) == BOND + BOND / 2);
        assert!(withdrawable_of(&mut scenario, BOB) == 0);
        assert!(stake_of(&mut scenario, jurors[3]) == STAKE - JUROR_SLASH);
        assert!(stake_of(&mut scenario, jurors[4]) == STAKE - JUROR_SLASH);
        finish(scenario, clock);
    }

    #[test]
    fun tie_defaults_optimistic() {
        let (mut scenario, mut clock) = setup();
        propose_as(&mut scenario, &clock, ALICE, TIP);
        challenge_as(&mut scenario, &clock, BOB, 1);
        let jurors = vote_split(&mut scenario, &clock, 1, 1, 1);
        clock.increment_for_testing(VOTE_WINDOW_MS + 1);
        resolve_as(&mut scenario, &clock, ALICE, 1);

        assert!(status_of(&mut scenario, 1) == 3); // Verified
        assert!(withdrawable_of(&mut scenario, BOB) == BOND); // challenger refunded
        let mut i = 0;
        while (i < jurors.length()) {
            assert!(stake_of(&mut scenario, jurors[i]) == STAKE); // nobody slashed
            i = i + 1;
        };
        finish(scenario, clock);
    }

    #[test]
    #[expected_failure(abort_code = 11, location = fileonchain::anchor_registry)]
    fun vote_rejects_non_juror() {
        let (mut scenario, clock) = setup();
        propose_as(&mut scenario, &clock, ALICE, TIP);
        challenge_as(&mut scenario, &clock, BOB, 1);
        scenario.next_tx(ALICE);
        let mut registry = scenario.take_shared<AnchorRegistry>();
        reg::cast_vote(&mut registry, 1, true, &clock, scenario.ctx());
        ts::return_shared(registry);
        finish(scenario, clock);
    }

    // ------------------------------------------------------------------
    // Staking
    // ------------------------------------------------------------------

    #[test]
    fun staking_lifecycle() {
        let (mut scenario, mut clock) = setup();
        // Below-min stays inactive; top-up activates.
        scenario.next_tx(CAROL);
        {
            let mut registry = scenario.take_shared<AnchorRegistry>();
            reg::stake(&mut registry, coin::mint_for_testing<FOCAT>(STAKE - 1, scenario.ctx()), scenario.ctx());
            assert!(reg::active_validator_count(&registry) == 6);
            reg::stake(&mut registry, coin::mint_for_testing<FOCAT>(1, scenario.ctx()), scenario.ctx());
            assert!(reg::active_validator_count(&registry) == 7);
            // Unstaking below the minimum deactivates.
            reg::request_unstake(&mut registry, STAKE, &clock, scenario.ctx());
            assert!(reg::active_validator_count(&registry) == 6);
            ts::return_shared(registry);
        };
        // Cooldown gates withdrawal.
        clock.increment_for_testing(604_800_000);
        scenario.next_tx(CAROL);
        {
            let mut registry = scenario.take_shared<AnchorRegistry>();
            reg::withdraw_unstaked(&mut registry, &clock, scenario.ctx());
            ts::return_shared(registry);
        };
        scenario.next_tx(CAROL);
        {
            let unstaked = scenario.take_from_sender<coin::Coin<FOCAT>>();
            assert!(unstaked.value() == STAKE);
            scenario.return_to_sender(unstaked);
        };
        finish(scenario, clock);
    }

    #[test]
    #[expected_failure(abort_code = 16, location = fileonchain::anchor_registry)]
    fun unstake_cooldown_enforced() {
        let (mut scenario, clock) = setup();
        scenario.next_tx(@0x101);
        let mut registry = scenario.take_shared<AnchorRegistry>();
        reg::request_unstake(&mut registry, STAKE, &clock, scenario.ctx());
        reg::withdraw_unstaked(&mut registry, &clock, scenario.ctx());
        ts::return_shared(registry);
        finish(scenario, clock);
    }

    #[test]
    #[expected_failure(abort_code = 8, location = fileonchain::anchor_registry)]
    fun challenge_rejects_thin_validator_set() {
        let (mut scenario, clock) = setup();
        scenario.next_tx(@0x101);
        {
            let mut registry = scenario.take_shared<AnchorRegistry>();
            reg::request_unstake(&mut registry, STAKE, &clock, scenario.ctx());
            ts::return_shared(registry);
        };
        scenario.next_tx(@0x102);
        {
            let mut registry = scenario.take_shared<AnchorRegistry>();
            reg::request_unstake(&mut registry, STAKE, &clock, scenario.ctx());
            ts::return_shared(registry);
        };
        propose_as(&mut scenario, &clock, ALICE, TIP);
        challenge_as(&mut scenario, &clock, BOB, 1);
        finish(scenario, clock);
    }

    // ------------------------------------------------------------------
    // Admin
    // ------------------------------------------------------------------

    #[test]
    fun admin_updates_params_and_platforms() {
        let (mut scenario, clock) = setup();
        scenario.next_tx(ADMIN);
        let mut registry = scenario.take_shared<AnchorRegistry>();
        let cap = scenario.take_from_sender<AdminCap>();
        reg::set_fee_split(&mut registry, &cap, 7_000, 2_000, 1_000);
        reg::set_bonds(&mut registry, &cap, 1, 2);
        reg::set_min_tip(&mut registry, &cap, 1);
        reg::set_windows(&mut registry, &cap, 3_600_000, 7_200_000);
        reg::set_jury_params(&mut registry, &cap, 3, 1);
        reg::set_staking_params(&mut registry, &cap, 1, 1);
        reg::set_protocol_treasury(&mut registry, &cap, @0xFEE);
        reg::register_platform(&mut registry, &cap, @0xF00D, @0xF00D, 1_000);
        reg::set_platform_active(&mut registry, &cap, 2, false);
        scenario.return_to_sender(cap);
        ts::return_shared(registry);

        // The platform owner can rotate treasury/fee themselves.
        scenario.next_tx(@0xF00D);
        let mut registry2 = scenario.take_shared<AnchorRegistry>();
        reg::update_platform(&mut registry2, 2, @0xBEEF, 500, scenario.ctx());
        ts::return_shared(registry2);
        finish(scenario, clock);
    }

    #[test]
    #[expected_failure(abort_code = 19, location = fileonchain::anchor_registry)]
    fun fee_split_must_sum() {
        let (mut scenario, clock) = setup();
        scenario.next_tx(ADMIN);
        let mut registry = scenario.take_shared<AnchorRegistry>();
        let cap = scenario.take_from_sender<AdminCap>();
        reg::set_fee_split(&mut registry, &cap, 6_000, 2_500, 1_000);
        scenario.return_to_sender(cap);
        ts::return_shared(registry);
        finish(scenario, clock);
    }

    #[test]
    #[expected_failure(abort_code = 22, location = fileonchain::anchor_registry)]
    fun update_platform_rejects_non_owner() {
        let (mut scenario, clock) = setup();
        scenario.next_tx(ALICE);
        let mut registry = scenario.take_shared<AnchorRegistry>();
        reg::update_platform(&mut registry, 1, @0xBEEF, 500, scenario.ctx());
        ts::return_shared(registry);
        finish(scenario, clock);
    }
}
