//! Tests for the AnchorRegistry propose/verify protocol. Run with `scarb test`.

use fileonchain::anchor_registry::{IAnchorRegistryDispatcher, IAnchorRegistryDispatcherTrait};
use fileonchain::foc_token::{IERC20Dispatcher, IERC20DispatcherTrait};
use starknet::syscalls::deploy_syscall;
use starknet::{ContractAddress, SyscallResultTrait};

const TIP: u256 = 100_000000000000000000;
const BOND: u256 = 100_000000000000000000;
const STAKE: u256 = 1000_000000000000000000;
const JUROR_SLASH: u256 = 50_000000000000000000;
const CHALLENGE_WINDOW: u64 = 86_400;
const VOTE_WINDOW: u64 = 172_800;
const START_TS: u64 = 1_000_000;

fn admin() -> ContractAddress {
    0xAD.try_into().unwrap()
}

fn alice() -> ContractAddress {
    0xA11CE.try_into().unwrap()
}

fn bob() -> ContractAddress {
    0xB0B.try_into().unwrap()
}

fn validator(i: u64) -> ContractAddress {
    (0x100 + i.into()).try_into().unwrap()
}

fn as_caller(who: ContractAddress) {
    starknet::testing::set_contract_address(who);
}

fn cid_a() -> ByteArray {
    "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi"
}

fn setup() -> (IERC20Dispatcher, IAnchorRegistryDispatcher) {
    starknet::testing::set_block_timestamp(START_TS);
    starknet::testing::set_block_number(100);
    as_caller(admin());

    let mut token_args = array![];
    admin().serialize(ref token_args);
    let supply: u256 = 1_000_000_000_000000000000000000;
    supply.serialize(ref token_args);
    let (token_address, _) = deploy_syscall(
        fileonchain::foc_token::FocToken::TEST_CLASS_HASH.try_into().unwrap(),
        0,
        token_args.span(),
        false,
    )
        .unwrap_syscall();
    let token = IERC20Dispatcher { contract_address: token_address };

    let mut registry_args = array![];
    token_address.serialize(ref registry_args);
    admin().serialize(ref registry_args); // protocol treasury
    admin().serialize(ref registry_args); // platform 1 treasury
    let (registry_address, _) = deploy_syscall(
        fileonchain::anchor_registry::AnchorRegistry::TEST_CLASS_HASH.try_into().unwrap(),
        0,
        registry_args.span(),
        false,
    )
        .unwrap_syscall();
    let registry = IAnchorRegistryDispatcher { contract_address: registry_address };

    // Fund + approve actors; stake six validators so a jury of 5 draws.
    let actors = array![alice(), bob()];
    let mut i = 0;
    while i < actors.len() {
        let actor = *actors.at(i);
        as_caller(admin());
        token.transfer(actor, 10 * STAKE);
        as_caller(actor);
        token.approve(registry_address, 10 * STAKE);
        i += 1;
    };
    let mut v: u64 = 0;
    while v < 6 {
        let validator_address = validator(v);
        as_caller(admin());
        token.transfer(validator_address, 10 * STAKE);
        as_caller(validator_address);
        token.approve(registry_address, 10 * STAKE);
        registry.stake(STAKE);
        v += 1;
    };
    as_caller(admin());
    (token, registry)
}

fn propose_default(registry: IAnchorRegistryDispatcher) -> u64 {
    as_caller(alice());
    registry.propose_anchor(cid_a(), 0xC0FFEE, "ipfs://bafy.../file", 1, TIP)
}

fn warp(to: u64) {
    starknet::testing::set_block_timestamp(to);
}

fn challenge_and_draw(registry: IAnchorRegistryDispatcher, proposal_id: u64) {
    as_caller(bob());
    registry.challenge(proposal_id);
    starknet::testing::set_block_number(120); // past the 10-block draw delay
    registry.draw_jury(proposal_id);
}

/// Cast `upholds` votes for and `rejects` against, in juror order.
fn vote_split(registry: IAnchorRegistryDispatcher, proposal_id: u64, upholds: u64, rejects: u64) {
    let mut i: u64 = 0;
    while i < upholds + rejects {
        let juror = registry.juror_at(proposal_id, i);
        as_caller(juror);
        registry.cast_vote(proposal_id, i < upholds);
        i += 1;
    };
}

// ---------------------------------------------------------------------
// Propose / finalize
// ---------------------------------------------------------------------

#[test]
fn propose_escrows_and_finalize_splits_fees() {
    let (token, registry) = setup();
    let alice_before = token.balance_of(alice());
    let id = propose_default(registry);
    assert_eq!(token.balance_of(alice()), alice_before - TIP - BOND);

    let proposal = registry.get_proposal(id);
    assert_eq!(proposal.status, 1); // Proposed
    assert_eq!(proposal.proposer, alice());
    assert_eq!(proposal.tip, TIP);
    assert_eq!(proposal.challenge_deadline, START_TS + CHALLENGE_WINDOW);
    assert_eq!(registry.proposal_count_for_cid(cid_a()), 1);
    assert_eq!(registry.proposal_id_for_cid(cid_a(), 0), id);

    warp(START_TS + CHALLENGE_WINDOW + 1);
    registry.finalize(id);

    assert_eq!(registry.get_proposal(id).status, 3); // Verified
    assert_eq!(registry.verified_proposal_id(cid_a()), id);
    // 25% platform + 15% protocol both credit the admin treasuries.
    assert_eq!(registry.withdrawable_of(admin()), 40_000000000000000000);
    // Bond returned to the proposer; withdraw pays it out.
    assert_eq!(registry.withdrawable_of(alice()), BOND);
    // 60% across six equal validators = 10 FOCAT each.
    assert_eq!(registry.pending_rewards(validator(0)), 10_000000000000000000);

    as_caller(alice());
    let balance_before = token.balance_of(alice());
    registry.withdraw();
    assert_eq!(token.balance_of(alice()), balance_before + BOND);

    as_caller(validator(0));
    let validator_before = token.balance_of(validator(0));
    registry.claim_rewards();
    assert_eq!(token.balance_of(validator(0)), validator_before + 10_000000000000000000);
}

#[test]
#[should_panic(expected: ("AnchorRegistry: tip below minimum", 'ENTRYPOINT_FAILED'))]
fn propose_rejects_low_tip() {
    let (_token, registry) = setup();
    as_caller(alice());
    registry.propose_anchor(cid_a(), 0, "", 1, 1);
}

#[test]
#[should_panic(expected: ("AnchorRegistry: platform inactive", 'ENTRYPOINT_FAILED'))]
fn propose_rejects_unknown_platform() {
    let (_token, registry) = setup();
    as_caller(alice());
    registry.propose_anchor(cid_a(), 0, "", 99, TIP);
}

#[test]
#[should_panic(expected: ("AnchorRegistry: already verified", 'ENTRYPOINT_FAILED'))]
fn propose_rejects_verified_cid() {
    let (_token, registry) = setup();
    let id = propose_default(registry);
    warp(START_TS + CHALLENGE_WINDOW + 1);
    registry.finalize(id);
    as_caller(bob());
    registry.propose_anchor(cid_a(), 0, "", 1, TIP);
}

#[test]
#[should_panic(expected: ("AnchorRegistry: window open", 'ENTRYPOINT_FAILED'))]
fn finalize_rejects_open_window() {
    let (_token, registry) = setup();
    let id = propose_default(registry);
    registry.finalize(id);
}

#[test]
fn race_loser_refunded() {
    let (_token, registry) = setup();
    let first = propose_default(registry);
    as_caller(bob());
    let second = registry.propose_anchor(cid_a(), 0, "", 1, TIP);
    warp(START_TS + CHALLENGE_WINDOW + 1);
    registry.finalize(first);
    registry.finalize(second);
    assert_eq!(registry.get_proposal(second).status, 4); // Rejected
    assert_eq!(registry.verified_proposal_id(cid_a()), first);
    assert_eq!(registry.withdrawable_of(bob()), TIP + BOND);
}

// ---------------------------------------------------------------------
// Disputes
// ---------------------------------------------------------------------

#[test]
fn challenge_draws_distinct_jury() {
    let (_token, registry) = setup();
    let id = propose_default(registry);
    challenge_and_draw(registry, id);
    assert_eq!(registry.get_proposal(id).status, 2); // Challenged

    let mut i: u64 = 0;
    while i < 5 {
        let juror = registry.juror_at(id, i);
        assert!(juror != alice() && juror != bob());
        let mut j = i + 1;
        while j < 5 {
            assert!(juror != registry.juror_at(id, j));
            j += 1;
        };
        i += 1;
    };
}

#[test]
#[should_panic(expected: ("AnchorRegistry: draw too early", 'ENTRYPOINT_FAILED'))]
fn draw_jury_enforces_block_delay() {
    let (_token, registry) = setup();
    let id = propose_default(registry);
    as_caller(bob());
    registry.challenge(id);
    registry.draw_jury(id); // same block as the challenge
}

#[test]
#[should_panic(expected: ("AnchorRegistry: window closed", 'ENTRYPOINT_FAILED'))]
fn challenge_rejects_closed_window() {
    let (_token, registry) = setup();
    let id = propose_default(registry);
    warp(START_TS + CHALLENGE_WINDOW + 1);
    as_caller(bob());
    registry.challenge(id);
}

#[test]
#[should_panic(expected: ("AnchorRegistry: not enough validators", 'ENTRYPOINT_FAILED'))]
fn challenge_rejects_thin_validator_set() {
    let (_token, registry) = setup();
    as_caller(validator(0));
    registry.request_unstake(STAKE);
    as_caller(validator(1));
    registry.request_unstake(STAKE);
    let id = propose_default(registry);
    as_caller(bob());
    registry.challenge(id);
}

#[test]
fn challenger_wins_slashes_and_pays() {
    let (_token, registry) = setup();
    let id = propose_default(registry);
    challenge_and_draw(registry, id);
    vote_split(registry, id, 2, 3); // challenger wins
    warp(START_TS + VOTE_WINDOW + 1);
    as_caller(bob());
    registry.resolve_dispute(id);

    assert_eq!(registry.get_proposal(id).status, 4); // Rejected
    assert_eq!(registry.verified_proposal_id(cid_a()), 0);
    // Proposer: tip refunded, bond slashed.
    assert_eq!(registry.withdrawable_of(alice()), TIP);
    // Challenger: own bond back + half the proposer bond.
    assert_eq!(registry.withdrawable_of(bob()), BOND + BOND / 2);
    // Losing jurors slashed; winners split bond/2 + slashes.
    assert_eq!(registry.stake_of(registry.juror_at(id, 0)), STAKE - JUROR_SLASH);
    assert_eq!(registry.stake_of(registry.juror_at(id, 1)), STAKE - JUROR_SLASH);
    let per_winner = (BOND / 2 + 2 * JUROR_SLASH) / 3;
    assert_eq!(registry.withdrawable_of(registry.juror_at(id, 2)), per_winner);

    // The CID is free again — a corrected proposal is allowed.
    as_caller(alice());
    registry.propose_anchor(cid_a(), 0xF1BED, "", 1, TIP);
}

#[test]
fn proposer_wins_verifies_and_slashes_challenger() {
    let (_token, registry) = setup();
    let id = propose_default(registry);
    challenge_and_draw(registry, id);
    vote_split(registry, id, 3, 2); // proposer wins
    warp(START_TS + VOTE_WINDOW + 1);
    registry.resolve_dispute(id);

    assert_eq!(registry.get_proposal(id).status, 3); // Verified
    assert_eq!(registry.verified_proposal_id(cid_a()), id);
    assert_eq!(registry.withdrawable_of(alice()), BOND + BOND / 2);
    assert_eq!(registry.withdrawable_of(bob()), 0);
    assert_eq!(registry.stake_of(registry.juror_at(id, 3)), STAKE - JUROR_SLASH);
    assert_eq!(registry.stake_of(registry.juror_at(id, 4)), STAKE - JUROR_SLASH);
}

#[test]
fn tie_defaults_optimistic() {
    let (_token, registry) = setup();
    let id = propose_default(registry);
    challenge_and_draw(registry, id);
    vote_split(registry, id, 1, 1);
    warp(START_TS + VOTE_WINDOW + 1);
    registry.resolve_dispute(id);

    assert_eq!(registry.get_proposal(id).status, 3); // Verified
    assert_eq!(registry.withdrawable_of(bob()), BOND); // challenger refunded
    let mut i: u64 = 0;
    while i < 5 {
        assert_eq!(registry.stake_of(registry.juror_at(id, i)), STAKE); // nobody slashed
        i += 1;
    };
}

#[test]
#[should_panic(expected: ("AnchorRegistry: not a juror", 'ENTRYPOINT_FAILED'))]
fn vote_rejects_non_juror() {
    let (_token, registry) = setup();
    let id = propose_default(registry);
    challenge_and_draw(registry, id);
    as_caller(alice());
    registry.cast_vote(id, true);
}

#[test]
#[should_panic(expected: ("AnchorRegistry: already voted", 'ENTRYPOINT_FAILED'))]
fn vote_rejects_double_vote() {
    let (_token, registry) = setup();
    let id = propose_default(registry);
    challenge_and_draw(registry, id);
    let juror = registry.juror_at(id, 0);
    as_caller(juror);
    registry.cast_vote(id, true);
    registry.cast_vote(id, false);
}

#[test]
#[should_panic(expected: ("AnchorRegistry: voting open", 'ENTRYPOINT_FAILED'))]
fn resolve_rejects_open_voting() {
    let (_token, registry) = setup();
    let id = propose_default(registry);
    challenge_and_draw(registry, id);
    registry.resolve_dispute(id);
}

// ---------------------------------------------------------------------
// Staking
// ---------------------------------------------------------------------

#[test]
fn staking_lifecycle() {
    let (token, registry) = setup();
    assert_eq!(registry.active_validator_count(), 6);

    // Below-min stays inactive; top-up activates; swap-remove keeps the set dense.
    let carol: ContractAddress = 0xCA401.try_into().unwrap();
    as_caller(admin());
    token.transfer(carol, 10 * STAKE);
    as_caller(carol);
    token.approve(registry.contract_address, 10 * STAKE);
    registry.stake(STAKE - 1);
    assert_eq!(registry.active_validator_count(), 6);
    registry.stake(1);
    assert_eq!(registry.active_validator_count(), 7);

    registry.request_unstake(STAKE);
    assert_eq!(registry.active_validator_count(), 6);
    assert_eq!(registry.stake_of(carol), 0);

    // Cooldown gates withdrawal.
    warp(START_TS + 604_800);
    let before = token.balance_of(carol);
    registry.withdraw_unstaked();
    assert_eq!(token.balance_of(carol), before + STAKE);
}

#[test]
#[should_panic(expected: ("AnchorRegistry: still unbonding", 'ENTRYPOINT_FAILED'))]
fn unstake_cooldown_enforced() {
    let (_token, registry) = setup();
    as_caller(validator(0));
    registry.request_unstake(STAKE);
    registry.withdraw_unstaked();
}

// ---------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------

#[test]
fn admin_updates_params_and_platforms() {
    let (_token, registry) = setup();
    as_caller(admin());
    registry.set_fee_split(7_000, 2_000, 1_000);
    registry.set_bonds(1, 2);
    registry.set_min_tip(1);
    registry.set_windows(3_600, 7_200);
    registry.set_jury_params(3, 1);
    registry.set_staking_params(1, 1);
    let food: ContractAddress = 0xF00D.try_into().unwrap();
    let platform_id = registry.register_platform(food, food, 1_000);
    assert_eq!(platform_id, 2);
    registry.set_platform_active(platform_id, false);
    // The platform owner rotates treasury/fee themselves.
    as_caller(food);
    let beef: ContractAddress = 0xBEEF.try_into().unwrap();
    registry.update_platform(platform_id, beef, 500);
}

#[test]
#[should_panic(expected: ("AnchorRegistry: not admin", 'ENTRYPOINT_FAILED'))]
fn non_admin_cannot_set_params() {
    let (_token, registry) = setup();
    as_caller(alice());
    registry.set_fee_split(7_000, 2_000, 1_000);
}

#[test]
#[should_panic(expected: ("AnchorRegistry: split must sum to 100%", 'ENTRYPOINT_FAILED'))]
fn fee_split_must_sum() {
    let (_token, registry) = setup();
    as_caller(admin());
    registry.set_fee_split(6_000, 2_500, 1_000);
}
