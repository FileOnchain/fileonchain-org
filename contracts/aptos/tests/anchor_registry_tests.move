#[test_only]
module fileonchain::anchor_registry_tests {
    use std::signer;
    use std::string::{Self, String};
    use std::vector;
    use aptos_framework::account;
    use aptos_framework::randomness;
    use aptos_framework::timestamp;
    use fileonchain::anchor_registry;
    use fileonchain::foc_token;

    const FOC: u64 = 100_000_000; // 1 FOC, 8 decimals
    const TIP: u64 = 100 * 100_000_000;
    const BOND: u64 = 100 * 100_000_000;
    const STAKE: u64 = 1_000 * 100_000_000;
    const JUROR_SLASH: u64 = 50 * 100_000_000;
    const CHALLENGE_WINDOW: u64 = 86_400;
    const VOTE_WINDOW: u64 = 172_800;

    fun cid_a(): String {
        string::utf8(b"bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi")
    }

    fun cid_b(): String {
        string::utf8(b"bafybeibv3zaicqsdwfmq5dym6ipxzl5qxksirv3d3uyzjqhs2dtx3w3c3q")
    }

    fun setup(fx: &signer, admin: &signer): (signer, signer, vector<signer>) {
        timestamp::set_time_has_started_for_testing(fx);
        timestamp::update_global_time_for_test_secs(1_000_000);
        randomness::initialize_for_testing(fx);
        account::create_account_for_test(signer::address_of(admin));
        foc_token::init_for_test(admin);
        anchor_registry::init_for_test(admin);

        let alice = account::create_signer_for_test(@0xA11CE);
        let bob = account::create_signer_for_test(@0xB0B);
        foc_token::mint(admin, @0xA11CE, 10_000 * FOC);
        foc_token::mint(admin, @0xB0B, 10_000 * FOC);

        // Six staked validators so a jury of five can always be drawn.
        let validators = vector::empty<signer>();
        let addrs = vector[@0x101, @0x102, @0x103, @0x104, @0x105, @0x106];
        let i = 0;
        while (i < vector::length(&addrs)) {
            let addr = *vector::borrow(&addrs, i);
            let validator = account::create_signer_for_test(addr);
            foc_token::mint(admin, addr, 10_000 * FOC);
            anchor_registry::stake(&validator, STAKE);
            vector::push_back(&mut validators, validator);
            i = i + 1;
        };
        (alice, bob, validators)
    }

    fun propose_default(alice: &signer) {
        anchor_registry::propose_anchor(
            alice,
            cid_a(),
            b"contenthash",
            string::utf8(b"ipfs://bafy.../file"),
            1,
            TIP,
        );
    }

    fun warp_past_challenge_window() {
        timestamp::update_global_time_for_test_secs(timestamp::now_seconds() + CHALLENGE_WINDOW + 1);
    }

    fun warp_past_vote_window() {
        timestamp::update_global_time_for_test_secs(timestamp::now_seconds() + VOTE_WINDOW + 1);
    }

    /// Cast `upholds` votes for and `rejects` votes against, in juror order.
    fun vote_split(proposal_id: u64, upholds: u64, rejects: u64): vector<address> {
        let jurors = anchor_registry::jurors_of(proposal_id);
        let i = 0;
        while (i < upholds) {
            let juror = account::create_signer_for_test(*vector::borrow(&jurors, i));
            anchor_registry::cast_vote(&juror, proposal_id, true);
            i = i + 1;
        };
        while (i < upholds + rejects) {
            let juror = account::create_signer_for_test(*vector::borrow(&jurors, i));
            anchor_registry::cast_vote(&juror, proposal_id, false);
            i = i + 1;
        };
        jurors
    }

    // ------------------------------------------------------------------
    // Propose / finalize
    // ------------------------------------------------------------------

    #[test(fx = @aptos_framework, admin = @fileonchain)]
    fun propose_escrows_and_stores(fx: &signer, admin: &signer) {
        let (alice, _bob, _validators) = setup(fx, admin);
        let before = foc_token::balance(@0xA11CE);
        propose_default(&alice);
        assert!(foc_token::balance(@0xA11CE) == before - TIP - BOND, 0);

        let (status, proposer, platform_id, tip, bond, deadline, verified_at) =
            anchor_registry::get_proposal(1);
        assert!(status == 1, 1); // Proposed
        assert!(proposer == @0xA11CE, 2);
        assert!(platform_id == 1, 3);
        assert!(tip == TIP && bond == BOND, 4);
        assert!(deadline == timestamp::now_seconds() + CHALLENGE_WINDOW, 5);
        assert!(verified_at == 0, 6);
        let ids = anchor_registry::proposal_ids_for_cid(cid_a());
        assert!(vector::length(&ids) == 1 && *vector::borrow(&ids, 0) == 1, 7);
    }

    #[test(fx = @aptos_framework, admin = @fileonchain)]
    #[expected_failure(abort_code = 3, location = fileonchain::anchor_registry)]
    fun propose_rejects_low_tip(fx: &signer, admin: &signer) {
        let (alice, _bob, _validators) = setup(fx, admin);
        anchor_registry::propose_anchor(&alice, cid_a(), b"", string::utf8(b""), 1, FOC - 1);
    }

    #[test(fx = @aptos_framework, admin = @fileonchain)]
    #[expected_failure(abort_code = 4, location = fileonchain::anchor_registry)]
    fun propose_rejects_unknown_platform(fx: &signer, admin: &signer) {
        let (alice, _bob, _validators) = setup(fx, admin);
        anchor_registry::propose_anchor(&alice, cid_a(), b"", string::utf8(b""), 99, TIP);
    }

    #[test(fx = @aptos_framework, admin = @fileonchain)]
    #[expected_failure(abort_code = 2, location = fileonchain::anchor_registry)]
    fun propose_rejects_verified_cid(fx: &signer, admin: &signer) {
        let (alice, bob, _validators) = setup(fx, admin);
        propose_default(&alice);
        warp_past_challenge_window();
        anchor_registry::finalize(&alice, 1);
        anchor_registry::propose_anchor(&bob, cid_a(), b"", string::utf8(b""), 1, TIP);
    }

    #[test(fx = @aptos_framework, admin = @fileonchain)]
    #[expected_failure(abort_code = 6, location = fileonchain::anchor_registry)]
    fun finalize_rejects_open_window(fx: &signer, admin: &signer) {
        let (alice, _bob, _validators) = setup(fx, admin);
        propose_default(&alice);
        anchor_registry::finalize(&alice, 1);
    }

    #[test(fx = @aptos_framework, admin = @fileonchain)]
    fun finalize_verifies_and_splits_fees(fx: &signer, admin: &signer) {
        let (alice, _bob, _validators) = setup(fx, admin);
        propose_default(&alice);
        warp_past_challenge_window();
        anchor_registry::finalize(&alice, 1);

        let (status, _, _, _, _, _, verified_at) = anchor_registry::get_proposal(1);
        assert!(status == 3, 0); // Verified
        assert!(verified_at == timestamp::now_seconds(), 1);
        assert!(anchor_registry::verified_proposal_id(cid_a()) == 1, 2);

        // 60/25/15 of a 100 FOC tip; platform 1's treasury is the admin.
        assert!(anchor_registry::withdrawable_of(@fileonchain) == 25 * FOC + 15 * FOC, 3);
        // Bond returned to the proposer.
        assert!(anchor_registry::withdrawable_of(@0xA11CE) == BOND, 4);
        // 60 FOC across six equal validators = 10 FOC each.
        assert!(anchor_registry::pending_rewards(@0x101) == 10 * FOC, 5);

        // Pull flows actually pay out.
        let alice_before = foc_token::balance(@0xA11CE);
        anchor_registry::withdraw(&alice);
        assert!(foc_token::balance(@0xA11CE) == alice_before + BOND, 6);
        let validator = account::create_signer_for_test(@0x101);
        let validator_before = foc_token::balance(@0x101);
        anchor_registry::claim_rewards(&validator);
        assert!(foc_token::balance(@0x101) == validator_before + 10 * FOC, 7);
    }

    #[test(fx = @aptos_framework, admin = @fileonchain)]
    fun finalize_without_stake_routes_validator_share_to_protocol(fx: &signer, admin: &signer) {
        let (alice, _bob, validators) = setup(fx, admin);
        let i = 0;
        while (i < vector::length(&validators)) {
            anchor_registry::request_unstake(vector::borrow(&validators, i), STAKE);
            i = i + 1;
        };
        propose_default(&alice);
        warp_past_challenge_window();
        anchor_registry::finalize(&alice, 1);
        // validator 60 + protocol 15 roll together; platform 25 also credits
        // the admin treasury here (platform 1 treasury == admin).
        assert!(anchor_registry::withdrawable_of(@fileonchain) == 100 * FOC, 0);
    }

    #[test(fx = @aptos_framework, admin = @fileonchain)]
    fun finalize_race_loser_refunded(fx: &signer, admin: &signer) {
        let (alice, bob, _validators) = setup(fx, admin);
        propose_default(&alice);
        anchor_registry::propose_anchor(&bob, cid_a(), b"", string::utf8(b""), 1, TIP);
        warp_past_challenge_window();
        anchor_registry::finalize(&alice, 1);
        anchor_registry::finalize(&bob, 2);

        let (status, _, _, _, _, _, _) = anchor_registry::get_proposal(2);
        assert!(status == 4, 0); // Rejected
        assert!(anchor_registry::verified_proposal_id(cid_a()) == 1, 1);
        assert!(anchor_registry::withdrawable_of(@0xB0B) == TIP + BOND, 2);
    }

    // ------------------------------------------------------------------
    // Challenge / dispute
    // ------------------------------------------------------------------

    #[test(fx = @aptos_framework, admin = @fileonchain)]
    fun challenge_draws_distinct_jury(fx: &signer, admin: &signer) {
        let (alice, bob, _validators) = setup(fx, admin);
        propose_default(&alice);
        anchor_registry::challenge_for_test(&bob, 1);

        let (status, _, _, _, _, _, _) = anchor_registry::get_proposal(1);
        assert!(status == 2, 0); // Challenged
        let jurors = anchor_registry::jurors_of(1);
        assert!(vector::length(&jurors) == 5, 1);
        let i = 0;
        while (i < 5) {
            let juror = *vector::borrow(&jurors, i);
            assert!(juror != @0xA11CE && juror != @0xB0B, 2);
            let j = i + 1;
            while (j < 5) {
                assert!(juror != *vector::borrow(&jurors, j), 3);
                j = j + 1;
            };
            i = i + 1;
        };
    }

    #[test(fx = @aptos_framework, admin = @fileonchain)]
    #[expected_failure(abort_code = 7, location = fileonchain::anchor_registry)]
    fun challenge_rejects_closed_window(fx: &signer, admin: &signer) {
        let (alice, bob, _validators) = setup(fx, admin);
        propose_default(&alice);
        warp_past_challenge_window();
        anchor_registry::challenge_for_test(&bob, 1);
    }

    #[test(fx = @aptos_framework, admin = @fileonchain)]
    #[expected_failure(abort_code = 8, location = fileonchain::anchor_registry)]
    fun challenge_rejects_thin_validator_set(fx: &signer, admin: &signer) {
        let (alice, bob, validators) = setup(fx, admin);
        anchor_registry::request_unstake(vector::borrow(&validators, 0), STAKE);
        anchor_registry::request_unstake(vector::borrow(&validators, 1), STAKE);
        propose_default(&alice);
        anchor_registry::challenge_for_test(&bob, 1);
    }

    #[test(fx = @aptos_framework, admin = @fileonchain)]
    fun challenger_wins_slashes_and_pays(fx: &signer, admin: &signer) {
        let (alice, bob, _validators) = setup(fx, admin);
        propose_default(&alice);
        anchor_registry::challenge_for_test(&bob, 1);
        let jurors = vote_split(1, 2, 3); // 2 uphold, 3 reject -> challenger wins
        warp_past_vote_window();
        anchor_registry::resolve_dispute(&bob, 1);

        let (status, _, _, _, _, _, _) = anchor_registry::get_proposal(1);
        assert!(status == 4, 0); // Rejected
        assert!(anchor_registry::verified_proposal_id(cid_a()) == 0, 1);
        // Proposer: tip refunded, bond slashed.
        assert!(anchor_registry::withdrawable_of(@0xA11CE) == TIP, 2);
        // Challenger: own bond back + half the proposer bond.
        assert!(anchor_registry::withdrawable_of(@0xB0B) == BOND + BOND / 2, 3);
        // Losing jurors slashed from stake; winners split bond/2 + slashes.
        let loser_a = *vector::borrow(&jurors, 0);
        let loser_b = *vector::borrow(&jurors, 1);
        assert!(anchor_registry::stake_of(loser_a) == STAKE - JUROR_SLASH, 4);
        assert!(anchor_registry::stake_of(loser_b) == STAKE - JUROR_SLASH, 5);
        let pool = BOND / 2 + 2 * JUROR_SLASH;
        let per_winner = pool / 3;
        assert!(anchor_registry::withdrawable_of(*vector::borrow(&jurors, 2)) == per_winner, 6);
        assert!(anchor_registry::withdrawable_of(*vector::borrow(&jurors, 3)) == per_winner, 7);
        assert!(anchor_registry::withdrawable_of(*vector::borrow(&jurors, 4)) == per_winner, 8);

        // The CID is free again — a corrected proposal is allowed.
        anchor_registry::propose_anchor(&bob, cid_a(), b"fixed", string::utf8(b""), 1, TIP);
    }

    #[test(fx = @aptos_framework, admin = @fileonchain)]
    fun proposer_wins_verifies_and_slashes_challenger(fx: &signer, admin: &signer) {
        let (alice, bob, _validators) = setup(fx, admin);
        propose_default(&alice);
        anchor_registry::challenge_for_test(&bob, 1);
        let jurors = vote_split(1, 3, 2); // proposer wins
        warp_past_vote_window();
        anchor_registry::resolve_dispute(&alice, 1);

        let (status, _, _, _, _, _, _) = anchor_registry::get_proposal(1);
        assert!(status == 3, 0); // Verified
        assert!(anchor_registry::verified_proposal_id(cid_a()) == 1, 1);
        // Proposer: bond back + half the challenger bond.
        assert!(anchor_registry::withdrawable_of(@0xA11CE) == BOND + BOND / 2, 2);
        // Challenger loses everything.
        assert!(anchor_registry::withdrawable_of(@0xB0B) == 0, 3);
        // Losing jurors slashed.
        assert!(anchor_registry::stake_of(*vector::borrow(&jurors, 3)) == STAKE - JUROR_SLASH, 4);
        assert!(anchor_registry::stake_of(*vector::borrow(&jurors, 4)) == STAKE - JUROR_SLASH, 5);
    }

    #[test(fx = @aptos_framework, admin = @fileonchain)]
    fun tie_defaults_optimistic(fx: &signer, admin: &signer) {
        let (alice, bob, _validators) = setup(fx, admin);
        propose_default(&alice);
        anchor_registry::challenge_for_test(&bob, 1);
        let jurors = vote_split(1, 1, 1);
        warp_past_vote_window();
        anchor_registry::resolve_dispute(&alice, 1);

        let (status, _, _, _, _, _, _) = anchor_registry::get_proposal(1);
        assert!(status == 3, 0); // Verified
        assert!(anchor_registry::withdrawable_of(@0xB0B) == BOND, 1); // challenger refunded
        // Nobody slashed on a tie.
        let i = 0;
        while (i < vector::length(&jurors)) {
            assert!(anchor_registry::stake_of(*vector::borrow(&jurors, i)) == STAKE, 2);
            i = i + 1;
        };
    }

    #[test(fx = @aptos_framework, admin = @fileonchain)]
    fun upheld_proposal_loses_race_during_dispute(fx: &signer, admin: &signer) {
        let (alice, bob, _validators) = setup(fx, admin);
        propose_default(&alice);
        anchor_registry::challenge_for_test(&bob, 1);
        // A parallel proposal verifies while the dispute runs.
        let carol = account::create_signer_for_test(@0xCA401);
        foc_token::mint(admin, @0xCA401, 10_000 * FOC);
        anchor_registry::propose_anchor(&carol, cid_a(), b"", string::utf8(b""), 1, TIP);
        vote_split(1, 3, 2);
        warp_past_challenge_window();
        anchor_registry::finalize(&carol, 2);
        warp_past_vote_window();
        anchor_registry::resolve_dispute(&alice, 1);

        let (status, _, _, _, _, _, _) = anchor_registry::get_proposal(1);
        assert!(status == 4, 0); // Rejected despite winning the dispute
        assert!(anchor_registry::verified_proposal_id(cid_a()) == 2, 1);
        // Full refund for the race loser + half the challenger bond.
        assert!(anchor_registry::withdrawable_of(@0xA11CE) == TIP + BOND + BOND / 2, 2);
    }

    #[test(fx = @aptos_framework, admin = @fileonchain)]
    #[expected_failure(abort_code = 11, location = fileonchain::anchor_registry)]
    fun vote_rejects_non_juror(fx: &signer, admin: &signer) {
        let (alice, bob, _validators) = setup(fx, admin);
        propose_default(&alice);
        anchor_registry::challenge_for_test(&bob, 1);
        anchor_registry::cast_vote(&alice, 1, true);
    }

    #[test(fx = @aptos_framework, admin = @fileonchain)]
    #[expected_failure(abort_code = 12, location = fileonchain::anchor_registry)]
    fun vote_rejects_double_vote(fx: &signer, admin: &signer) {
        let (alice, bob, _validators) = setup(fx, admin);
        propose_default(&alice);
        anchor_registry::challenge_for_test(&bob, 1);
        let jurors = anchor_registry::jurors_of(1);
        let juror = account::create_signer_for_test(*vector::borrow(&jurors, 0));
        anchor_registry::cast_vote(&juror, 1, true);
        anchor_registry::cast_vote(&juror, 1, false);
    }

    #[test(fx = @aptos_framework, admin = @fileonchain)]
    #[expected_failure(abort_code = 13, location = fileonchain::anchor_registry)]
    fun resolve_rejects_open_voting(fx: &signer, admin: &signer) {
        let (alice, bob, _validators) = setup(fx, admin);
        propose_default(&alice);
        anchor_registry::challenge_for_test(&bob, 1);
        anchor_registry::resolve_dispute(&bob, 1);
    }

    // ------------------------------------------------------------------
    // Staking
    // ------------------------------------------------------------------

    #[test(fx = @aptos_framework, admin = @fileonchain)]
    fun staking_lifecycle(fx: &signer, admin: &signer) {
        let (_alice, _bob, _validators) = setup(fx, admin);
        assert!(anchor_registry::active_validator_count() == 6, 0);

        // Below-min top-ups activate once the threshold is crossed.
        let dave = account::create_signer_for_test(@0xDA4E);
        foc_token::mint(admin, @0xDA4E, 10_000 * FOC);
        anchor_registry::stake(&dave, STAKE - 1);
        assert!(anchor_registry::active_validator_count() == 6, 1);
        anchor_registry::stake(&dave, 1);
        assert!(anchor_registry::active_validator_count() == 7, 2);

        // Unstaking below the minimum deactivates; cooldown gates withdrawal.
        anchor_registry::request_unstake(&dave, STAKE);
        assert!(anchor_registry::active_validator_count() == 6, 3);
        timestamp::update_global_time_for_test_secs(timestamp::now_seconds() + 604_800);
        let before = foc_token::balance(@0xDA4E);
        anchor_registry::withdraw_unstaked(&dave);
        assert!(foc_token::balance(@0xDA4E) == before + STAKE, 4);
    }

    #[test(fx = @aptos_framework, admin = @fileonchain)]
    #[expected_failure(abort_code = 16, location = fileonchain::anchor_registry)]
    fun unstake_cooldown_enforced(fx: &signer, admin: &signer) {
        let (_alice, _bob, validators) = setup(fx, admin);
        anchor_registry::request_unstake(vector::borrow(&validators, 0), STAKE);
        anchor_registry::withdraw_unstaked(vector::borrow(&validators, 0));
    }

    #[test(fx = @aptos_framework, admin = @fileonchain)]
    fun rewards_are_pro_rata(fx: &signer, admin: &signer) {
        let (alice, _bob, validators) = setup(fx, admin);
        // Double one validator's stake: 7000 total, 2000 vs 1000 each.
        anchor_registry::stake(vector::borrow(&validators, 0), STAKE);

        propose_default(&alice);
        warp_past_challenge_window();
        anchor_registry::finalize(&alice, 1);

        // 60 FOC over 7000 staked: 2000/7000 vs 1000/7000.
        let heavy = anchor_registry::pending_rewards(@0x101);
        let light = anchor_registry::pending_rewards(@0x102);
        assert!(heavy == 2 * light, 0);
    }

    // ------------------------------------------------------------------
    // Admin
    // ------------------------------------------------------------------

    #[test(fx = @aptos_framework, admin = @fileonchain)]
    fun admin_updates_params_and_platforms(fx: &signer, admin: &signer) {
        let (_alice, _bob, _validators) = setup(fx, admin);
        anchor_registry::set_fee_split(admin, 7_000, 2_000, 1_000);
        anchor_registry::set_bonds(admin, 1, 2);
        anchor_registry::set_min_tip(admin, 1);
        anchor_registry::set_windows(admin, 3_600, 7_200);
        anchor_registry::set_jury_params(admin, 3, 1);
        anchor_registry::set_staking_params(admin, 1, 1);
        anchor_registry::register_platform(admin, @0xF00D, @0xF00D, 1_000);
        anchor_registry::set_platform_active(admin, 2, false);
        let food = account::create_signer_for_test(@0xF00D);
        anchor_registry::update_platform(&food, 2, @0xBEEF, 500);
    }

    #[test(fx = @aptos_framework, admin = @fileonchain)]
    #[expected_failure(abort_code = 1, location = fileonchain::anchor_registry)]
    fun non_admin_cannot_set_params(fx: &signer, admin: &signer) {
        let (alice, _bob, _validators) = setup(fx, admin);
        anchor_registry::set_fee_split(&alice, 7_000, 2_000, 1_000);
    }

    #[test(fx = @aptos_framework, admin = @fileonchain)]
    #[expected_failure(abort_code = 19, location = fileonchain::anchor_registry)]
    fun fee_split_must_sum(fx: &signer, admin: &signer) {
        let (_alice, _bob, _validators) = setup(fx, admin);
        anchor_registry::set_fee_split(admin, 6_000, 2_500, 1_000);
    }

    #[test(fx = @aptos_framework, admin = @fileonchain)]
    fun different_cids_verify_independently(fx: &signer, admin: &signer) {
        let (alice, bob, _validators) = setup(fx, admin);
        propose_default(&alice);
        anchor_registry::propose_anchor(&bob, cid_b(), b"", string::utf8(b""), 1, TIP);
        warp_past_challenge_window();
        anchor_registry::finalize(&alice, 1);
        anchor_registry::finalize(&bob, 2);
        assert!(anchor_registry::verified_proposal_id(cid_a()) == 1, 0);
        assert!(anchor_registry::verified_proposal_id(cid_b()) == 2, 1);
    }
}
