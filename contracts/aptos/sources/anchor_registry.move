/// Optimistic anchor protocol for file CIDs — the Aptos port of the EVM
/// FileRegistry + ValidatorStaking + PlatformRegistry suite, folded into one
/// module around a single escrow pot with internal ledgers.
///
/// File-level anchors are paid proposals: `propose_anchor` escrows a FOCAT
/// tip + bond and names the originating platform. Unchallenged proposals
/// `finalize` after the challenge window — the tip splits
/// validator/platform/protocol (60/25/15 default). A `challenge` escrows a
/// counter-bond and draws a jury from the staked validator set using
/// Aptos native on-chain randomness (stronger than the EVM prevrandao
/// draw); the majority resolves, losing bonds and losing jurors are
/// slashed to the winners, ties default optimistic.
///
/// Proposals are keyed by id with first-verified-wins per CID. Chunk
/// anchors stay free in `fileonchain::file_registry::anchor_cid`.
///
/// Parameters are administered by `admin` — the account that executes EVM
/// governance decisions (see docs/governance.md). v1 limitations match the
/// EVM contract: public votes, non-voters unslashed, no delegation.
module fileonchain::anchor_registry {
    use std::signer;
    use std::string::String;
    use std::vector;
    use aptos_std::table::{Self, Table};
    use aptos_framework::event;
    use aptos_framework::object::{Self, ExtendRef};
    use aptos_framework::primary_fungible_store;
    use aptos_framework::randomness;
    use aptos_framework::timestamp;
    use fileonchain::foc_token;

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    const E_NOT_ADMIN: u64 = 1;
    const E_ALREADY_VERIFIED: u64 = 2;
    const E_TIP_BELOW_MIN: u64 = 3;
    const E_PLATFORM_INACTIVE: u64 = 4;
    const E_NOT_PROPOSED: u64 = 5;
    const E_WINDOW_OPEN: u64 = 6;
    const E_WINDOW_CLOSED: u64 = 7;
    const E_NOT_ENOUGH_VALIDATORS: u64 = 8;
    const E_NOT_CHALLENGED: u64 = 9;
    const E_VOTING_CLOSED: u64 = 10;
    const E_NOT_JUROR: u64 = 11;
    const E_ALREADY_VOTED: u64 = 12;
    const E_VOTING_OPEN: u64 = 13;
    const E_NOTHING_TO_WITHDRAW: u64 = 14;
    const E_BAD_AMOUNT: u64 = 15;
    const E_STILL_UNBONDING: u64 = 16;
    const E_NOTHING_UNBONDING: u64 = 17;
    const E_NOTHING_TO_CLAIM: u64 = 18;
    const E_BAD_SPLIT: u64 = 19;
    const E_BAD_JURY_SIZE: u64 = 20;
    const E_UNKNOWN_PLATFORM: u64 = 21;
    const E_NOT_PLATFORM_OWNER: u64 = 22;
    const E_FEE_ABOVE_CAP: u64 = 23;
    const E_JURY_DRAW_FAILED: u64 = 24;
    const E_UNKNOWN_PROPOSAL: u64 = 25;

    // ---------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------

    const STATUS_NONE: u8 = 0;
    const STATUS_PROPOSED: u8 = 1;
    const STATUS_CHALLENGED: u8 = 2;
    const STATUS_VERIFIED: u8 = 3;
    const STATUS_REJECTED: u8 = 4;

    const VOTE_NONE: u8 = 0;
    const VOTE_UPHOLD: u8 = 1;
    const VOTE_REJECT: u8 = 2;

    const BPS_DENOM: u64 = 10_000;
    const ACC_PRECISION: u128 = 1_000_000_000_000;

    // Defaults (8-decimal FOCAT base units); all admin-settable.
    const DEFAULT_PROPOSE_BOND: u64 = 10_000_000_000; // 100 FOCAT
    const DEFAULT_CHALLENGE_BOND: u64 = 10_000_000_000; // 100 FOCAT
    const DEFAULT_MIN_TIP: u64 = 100_000_000; // 1 FOCAT
    const DEFAULT_CHALLENGE_WINDOW_SECS: u64 = 86_400; // 24h
    const DEFAULT_VOTE_WINDOW_SECS: u64 = 172_800; // 48h
    const DEFAULT_JURY_SIZE: u64 = 5;
    const DEFAULT_JUROR_SLASH: u64 = 5_000_000_000; // 50 FOCAT
    const DEFAULT_MIN_STAKE: u64 = 100_000_000_000; // 1000 FOCAT
    const DEFAULT_UNBONDING_SECS: u64 = 604_800; // 7 days

    // ---------------------------------------------------------------------
    // State
    // ---------------------------------------------------------------------

    struct Dispute has store, drop {
        challenger: address,
        challenger_bond: u64,
        vote_deadline: u64,
        jurors: vector<address>,
        /// Parallel to `jurors`: VOTE_NONE / VOTE_UPHOLD / VOTE_REJECT.
        votes: vector<u8>,
        votes_for: u64,
        votes_against: u64,
    }

    struct Proposal has store {
        cid: String,
        content_hash: vector<u8>,
        uri: String,
        proposer: address,
        platform_id: u64,
        tip: u64,
        bond: u64,
        proposed_at: u64,
        challenge_deadline: u64,
        verified_at: u64,
        status: u8,
        dispute: vector<Dispute>, // empty or one element (Option without copy bounds)
    }

    struct StakeInfo has store, drop {
        amount: u64,
        reward_debt: u128,
        pending_rewards: u64,
        unbonding_amount: u64,
        unbonding_ends_at: u64,
    }

    struct Platform has store, drop {
        owner: address,
        treasury: address,
        fee_bps: u64,
        active: bool,
    }

    struct Registry has key {
        admin: address,
        protocol_treasury: address,
        escrow_extend_ref: ExtendRef,
        escrow_addr: address,
        // params
        propose_bond: u64,
        challenge_bond: u64,
        min_tip: u64,
        challenge_window_secs: u64,
        vote_window_secs: u64,
        jury_size: u64,
        juror_slash: u64,
        validator_bps: u64,
        platform_bps: u64,
        protocol_bps: u64,
        // proposals
        next_proposal_id: u64,
        proposals: Table<u64, Proposal>,
        proposal_ids_by_cid: Table<String, vector<u64>>,
        verified_by_cid: Table<String, u64>,
        withdrawable: Table<address, u64>,
        // staking
        min_stake: u64,
        unbonding_secs: u64,
        validators: vector<address>,
        stakes: Table<address, StakeInfo>,
        total_staked: u64,
        acc_reward_per_share: u128,
        // platforms
        next_platform_id: u64,
        platforms: Table<u64, Platform>,
        max_platform_fee_bps: u64,
    }

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    #[event]
    struct AnchorProposed has drop, store {
        proposal_id: u64,
        cid: String,
        proposer: address,
        platform_id: u64,
        tip: u64,
        bond: u64,
        challenge_deadline: u64,
    }

    #[event]
    struct AnchorChallenged has drop, store {
        proposal_id: u64,
        challenger: address,
        challenger_bond: u64,
        vote_deadline: u64,
        jurors: vector<address>,
    }

    #[event]
    struct JurorVoted has drop, store {
        proposal_id: u64,
        juror: address,
        uphold_proposal: bool,
    }

    #[event]
    struct AnchorVerified has drop, store {
        proposal_id: u64,
        cid: String,
        proposer: address,
        validator_amount: u64,
        platform_amount: u64,
        protocol_amount: u64,
    }

    #[event]
    struct AnchorRejected has drop, store {
        proposal_id: u64,
        cid: String,
        proposer: address,
    }

    #[event]
    struct Staked has drop, store {
        validator: address,
        amount: u64,
        total_stake: u64,
    }

    #[event]
    struct UnstakeRequested has drop, store {
        validator: address,
        amount: u64,
        unbonding_ends_at: u64,
    }

    #[event]
    struct Slashed has drop, store {
        validator: address,
        amount: u64,
    }

    #[event]
    struct Withdrawn has drop, store {
        to: address,
        amount: u64,
    }

    #[event]
    struct PlatformRegistered has drop, store {
        platform_id: u64,
        owner: address,
        treasury: address,
        fee_bps: u64,
    }

    // ---------------------------------------------------------------------
    // Init
    // ---------------------------------------------------------------------

    fun init_module(admin: &signer) {
        let constructor_ref = object::create_named_object(admin, b"foc-escrow");
        let escrow_addr = object::address_from_constructor_ref(&constructor_ref);
        let admin_addr = signer::address_of(admin);
        let registry = Registry {
            admin: admin_addr,
            protocol_treasury: admin_addr,
            escrow_extend_ref: object::generate_extend_ref(&constructor_ref),
            escrow_addr,
            propose_bond: DEFAULT_PROPOSE_BOND,
            challenge_bond: DEFAULT_CHALLENGE_BOND,
            min_tip: DEFAULT_MIN_TIP,
            challenge_window_secs: DEFAULT_CHALLENGE_WINDOW_SECS,
            vote_window_secs: DEFAULT_VOTE_WINDOW_SECS,
            jury_size: DEFAULT_JURY_SIZE,
            juror_slash: DEFAULT_JUROR_SLASH,
            validator_bps: 6_000,
            platform_bps: 2_500,
            protocol_bps: 1_500,
            next_proposal_id: 1,
            proposals: table::new(),
            proposal_ids_by_cid: table::new(),
            verified_by_cid: table::new(),
            withdrawable: table::new(),
            min_stake: DEFAULT_MIN_STAKE,
            unbonding_secs: DEFAULT_UNBONDING_SECS,
            validators: vector::empty(),
            stakes: table::new(),
            total_staked: 0,
            acc_reward_per_share: 0,
            next_platform_id: 1,
            platforms: table::new(),
            max_platform_fee_bps: 2_500,
        };
        // FileOnChain itself is platform 1.
        register_platform_internal(&mut registry, admin_addr, admin_addr, 2_500);
        move_to(admin, registry);
    }

    fun register_platform_internal(
        registry: &mut Registry,
        owner: address,
        treasury: address,
        fee_bps: u64,
    ): u64 {
        assert!(fee_bps <= registry.max_platform_fee_bps, E_FEE_ABOVE_CAP);
        let platform_id = registry.next_platform_id;
        registry.next_platform_id = platform_id + 1;
        table::add(&mut registry.platforms, platform_id, Platform { owner, treasury, fee_bps, active: true });
        event::emit(PlatformRegistered { platform_id, owner, treasury, fee_bps });
        platform_id
    }

    // ---------------------------------------------------------------------
    // Escrow helpers — one pot, internal ledgers
    // ---------------------------------------------------------------------

    fun escrow_in(registry: &Registry, from: &signer, amount: u64) {
        primary_fungible_store::transfer(from, foc_token::metadata(), registry.escrow_addr, amount);
    }

    fun escrow_out(registry: &Registry, to: address, amount: u64) {
        let escrow_signer = object::generate_signer_for_extending(&registry.escrow_extend_ref);
        primary_fungible_store::transfer(&escrow_signer, foc_token::metadata(), to, amount);
    }

    fun credit(registry: &mut Registry, to: address, amount: u64) {
        if (amount == 0) return;
        if (table::contains(&registry.withdrawable, to)) {
            let balance = table::borrow_mut(&mut registry.withdrawable, to);
            *balance = *balance + amount;
        } else {
            table::add(&mut registry.withdrawable, to, amount);
        }
    }

    // ---------------------------------------------------------------------
    // Propose / finalize
    // ---------------------------------------------------------------------

    /// Propose a file-level anchor, escrowing `tip + propose_bond` FOCAT.
    public entry fun propose_anchor(
        caller: &signer,
        cid: String,
        content_hash: vector<u8>,
        uri: String,
        platform_id: u64,
        tip: u64,
    ) acquires Registry {
        let registry = borrow_global_mut<Registry>(@fileonchain);
        assert!(!table::contains(&registry.verified_by_cid, cid), E_ALREADY_VERIFIED);
        assert!(tip >= registry.min_tip, E_TIP_BELOW_MIN);
        assert!(
            table::contains(&registry.platforms, platform_id)
                && table::borrow(&registry.platforms, platform_id).active,
            E_PLATFORM_INACTIVE,
        );

        escrow_in(registry, caller, tip + registry.propose_bond);

        let proposal_id = registry.next_proposal_id;
        registry.next_proposal_id = proposal_id + 1;
        let now = timestamp::now_seconds();
        let challenge_deadline = now + registry.challenge_window_secs;
        let proposer = signer::address_of(caller);
        table::add(&mut registry.proposals, proposal_id, Proposal {
            cid,
            content_hash,
            uri,
            proposer,
            platform_id,
            tip,
            bond: registry.propose_bond,
            proposed_at: now,
            challenge_deadline,
            verified_at: 0,
            status: STATUS_PROPOSED,
            dispute: vector::empty(),
        });
        if (table::contains(&registry.proposal_ids_by_cid, cid)) {
            vector::push_back(table::borrow_mut(&mut registry.proposal_ids_by_cid, cid), proposal_id);
        } else {
            table::add(&mut registry.proposal_ids_by_cid, cid, vector::singleton(proposal_id));
        };
        event::emit(AnchorProposed {
            proposal_id,
            cid,
            proposer,
            platform_id,
            tip,
            bond: registry.propose_bond,
            challenge_deadline,
        });
    }

    /// Finalize an unchallenged proposal after its window (anyone may call).
    /// A proposal that lost the CID race is rejected with a full refund.
    public entry fun finalize(_caller: &signer, proposal_id: u64) acquires Registry {
        let registry = borrow_global_mut<Registry>(@fileonchain);
        assert!(table::contains(&registry.proposals, proposal_id), E_UNKNOWN_PROPOSAL);
        {
            let proposal = table::borrow(&registry.proposals, proposal_id);
            assert!(proposal.status == STATUS_PROPOSED, E_NOT_PROPOSED);
            assert!(timestamp::now_seconds() > proposal.challenge_deadline, E_WINDOW_OPEN);
        };
        settle_upheld_proposal(registry, proposal_id);
    }

    /// Verify (or race-reject) a proposal whose optimistic path prevailed.
    fun settle_upheld_proposal(registry: &mut Registry, proposal_id: u64) {
        let (cid, proposer, tip, bond) = {
            let p = table::borrow(&registry.proposals, proposal_id);
            (p.cid, p.proposer, p.tip, p.bond)
        };
        if (table::contains(&registry.verified_by_cid, cid)) {
            // Lost the race: first verified wins; full refund.
            let p = table::borrow_mut(&mut registry.proposals, proposal_id);
            p.status = STATUS_REJECTED;
            credit(registry, proposer, tip + bond);
            event::emit(AnchorRejected { proposal_id, cid, proposer });
            return
        };

        // Fee split. With no active stake the validator share rolls into the
        // protocol treasury.
        let validator_amount = tip * registry.validator_bps / BPS_DENOM;
        let (platform_treasury, platform_fee_bps) = {
            let platform_id = table::borrow(&registry.proposals, proposal_id).platform_id;
            let platform = table::borrow(&registry.platforms, platform_id);
            (platform.treasury, platform.fee_bps)
        };
        let effective_bps = if (platform_fee_bps < registry.platform_bps) platform_fee_bps
            else registry.platform_bps;
        let platform_amount = tip * effective_bps / BPS_DENOM;
        let protocol_amount = tip - validator_amount - platform_amount;
        if (validator_amount > 0) {
            if (registry.total_staked > 0) {
                registry.acc_reward_per_share = registry.acc_reward_per_share
                    + (validator_amount as u128) * ACC_PRECISION / (registry.total_staked as u128);
            } else {
                protocol_amount = protocol_amount + validator_amount;
                validator_amount = 0;
            }
        };
        credit(registry, platform_treasury, platform_amount);
        let protocol_treasury = registry.protocol_treasury;
        credit(registry, protocol_treasury, protocol_amount);
        credit(registry, proposer, bond);

        let now = timestamp::now_seconds();
        table::add(&mut registry.verified_by_cid, cid, proposal_id);
        let p = table::borrow_mut(&mut registry.proposals, proposal_id);
        p.status = STATUS_VERIFIED;
        p.verified_at = now;
        event::emit(AnchorVerified {
            proposal_id,
            cid,
            proposer,
            validator_amount,
            platform_amount,
            protocol_amount,
        });
    }

    // ---------------------------------------------------------------------
    // Challenge / vote / resolve
    // ---------------------------------------------------------------------

    // Challenge a live proposal within its window, escrowing the challenger
    // bond and drawing a jury via Aptos native randomness. Private entry —
    // required by the randomness API's undergasing protection.
    #[randomness]
    entry fun challenge(caller: &signer, proposal_id: u64) acquires Registry {
        let registry = borrow_global_mut<Registry>(@fileonchain);
        assert!(table::contains(&registry.proposals, proposal_id), E_UNKNOWN_PROPOSAL);
        let challenger = signer::address_of(caller);
        let (proposer, challenge_bond) = {
            let proposal = table::borrow(&registry.proposals, proposal_id);
            assert!(proposal.status == STATUS_PROPOSED, E_NOT_PROPOSED);
            assert!(timestamp::now_seconds() <= proposal.challenge_deadline, E_WINDOW_CLOSED);
            (proposal.proposer, registry.challenge_bond)
        };

        // Enough eligible validators once proposer/challenger are excluded?
        let validator_count = vector::length(&registry.validators);
        let excluded = 0;
        if (is_active_validator_internal(registry, proposer)) excluded = excluded + 1;
        if (challenger != proposer && is_active_validator_internal(registry, challenger))
            excluded = excluded + 1;
        assert!(validator_count >= registry.jury_size + excluded, E_NOT_ENOUGH_VALIDATORS);

        escrow_in(registry, caller, challenge_bond);

        let jurors = draw_jury(registry, proposer, challenger);
        let vote_deadline = timestamp::now_seconds() + registry.vote_window_secs;
        let votes = vector::empty<u8>();
        let i = 0;
        while (i < vector::length(&jurors)) {
            vector::push_back(&mut votes, VOTE_NONE);
            i = i + 1;
        };
        event::emit(AnchorChallenged {
            proposal_id,
            challenger,
            challenger_bond: challenge_bond,
            vote_deadline,
            jurors: copy jurors,
        });
        let proposal = table::borrow_mut(&mut registry.proposals, proposal_id);
        proposal.status = STATUS_CHALLENGED;
        vector::push_back(&mut proposal.dispute, Dispute {
            challenger,
            challenger_bond: challenge_bond,
            vote_deadline,
            jurors,
            votes,
            votes_for: 0,
            votes_against: 0,
        });
    }

    /// Rejection-sample `jury_size` distinct active validators, excluding
    /// the proposer and challenger.
    fun draw_jury(registry: &Registry, proposer: address, challenger: address): vector<address> {
        let jurors = vector::empty<address>();
        let validator_count = vector::length(&registry.validators);
        let target = registry.jury_size;
        let max_iterations = target * 16;
        let i = 0;
        while (i < max_iterations && vector::length(&jurors) < target) {
            let candidate = *vector::borrow(
                &registry.validators,
                randomness::u64_range(0, validator_count),
            );
            i = i + 1;
            if (candidate == proposer || candidate == challenger) continue;
            if (vector::contains(&jurors, &candidate)) continue;
            vector::push_back(&mut jurors, candidate);
        };
        assert!(vector::length(&jurors) == target, E_JURY_DRAW_FAILED);
        jurors
    }

    /// Cast a jury vote; `uphold_proposal = true` sides with the proposer.
    public entry fun cast_vote(
        caller: &signer,
        proposal_id: u64,
        uphold_proposal: bool,
    ) acquires Registry {
        let registry = borrow_global_mut<Registry>(@fileonchain);
        assert!(table::contains(&registry.proposals, proposal_id), E_UNKNOWN_PROPOSAL);
        let proposal = table::borrow_mut(&mut registry.proposals, proposal_id);
        assert!(proposal.status == STATUS_CHALLENGED, E_NOT_CHALLENGED);
        let dispute = vector::borrow_mut(&mut proposal.dispute, 0);
        assert!(timestamp::now_seconds() <= dispute.vote_deadline, E_VOTING_CLOSED);
        let juror = signer::address_of(caller);
        let (found, index) = vector::index_of(&dispute.jurors, &juror);
        assert!(found, E_NOT_JUROR);
        assert!(*vector::borrow(&dispute.votes, index) == VOTE_NONE, E_ALREADY_VOTED);
        if (uphold_proposal) {
            *vector::borrow_mut(&mut dispute.votes, index) = VOTE_UPHOLD;
            dispute.votes_for = dispute.votes_for + 1;
        } else {
            *vector::borrow_mut(&mut dispute.votes, index) = VOTE_REJECT;
            dispute.votes_against = dispute.votes_against + 1;
        };
        event::emit(JurorVoted { proposal_id, juror, uphold_proposal });
    }

    /// Resolve a dispute after the vote deadline (anyone may call).
    /// Majority wins; ties and zero participation default optimistic.
    public entry fun resolve_dispute(_caller: &signer, proposal_id: u64) acquires Registry {
        let registry = borrow_global_mut<Registry>(@fileonchain);
        assert!(table::contains(&registry.proposals, proposal_id), E_UNKNOWN_PROPOSAL);
        let dispute = {
            let proposal = table::borrow_mut(&mut registry.proposals, proposal_id);
            assert!(proposal.status == STATUS_CHALLENGED, E_NOT_CHALLENGED);
            let d = vector::pop_back(&mut proposal.dispute);
            assert!(timestamp::now_seconds() > d.vote_deadline, E_VOTING_OPEN);
            d
        };

        if (dispute.votes_against > dispute.votes_for) {
            resolve_challenger_wins(registry, proposal_id, &dispute);
        } else if (dispute.votes_for > dispute.votes_against) {
            // Challenger loses the bond: half to the proposer, half to the
            // winning jurors (plus slashed stake from losing jurors).
            let proposer = table::borrow(&registry.proposals, proposal_id).proposer;
            let to_proposer = dispute.challenger_bond / 2;
            credit(registry, proposer, to_proposer);
            let juror_pool = dispute.challenger_bond - to_proposer;
            juror_pool = juror_pool + slash_losing_jurors(registry, &dispute, VOTE_REJECT);
            reward_winning_jurors(registry, &dispute, VOTE_UPHOLD, juror_pool);
            settle_upheld_proposal(registry, proposal_id);
        } else {
            // Tie / no votes: optimistic default, challenger refunded.
            credit(registry, dispute.challenger, dispute.challenger_bond);
            settle_upheld_proposal(registry, proposal_id);
        }
    }

    fun resolve_challenger_wins(registry: &mut Registry, proposal_id: u64, dispute: &Dispute) {
        let (cid, proposer, tip, bond) = {
            let p = table::borrow_mut(&mut registry.proposals, proposal_id);
            p.status = STATUS_REJECTED;
            (p.cid, p.proposer, p.tip, p.bond)
        };
        // Verification never happened: the tip returns to the proposer; the
        // proposer bond is slashed half to the challenger, half to winners.
        credit(registry, proposer, tip);
        credit(registry, dispute.challenger, dispute.challenger_bond);
        let to_challenger = bond / 2;
        credit(registry, dispute.challenger, to_challenger);
        let juror_pool = bond - to_challenger;
        juror_pool = juror_pool + slash_losing_jurors(registry, dispute, VOTE_UPHOLD);
        reward_winning_jurors(registry, dispute, VOTE_REJECT, juror_pool);
        event::emit(AnchorRejected { proposal_id, cid, proposer });
    }

    /// Slash every juror who voted `losing_vote`; the slashed stake (already
    /// escrowed) moves into the winners' pool. Non-voters are unslashed (v1).
    fun slash_losing_jurors(registry: &mut Registry, dispute: &Dispute, losing_vote: u8): u64 {
        let pool = 0;
        let i = 0;
        let len = vector::length(&dispute.jurors);
        while (i < len) {
            if (*vector::borrow(&dispute.votes, i) == losing_vote) {
                let juror = *vector::borrow(&dispute.jurors, i);
                pool = pool + slash_stake(registry, juror);
            };
            i = i + 1;
        };
        pool
    }

    fun slash_stake(registry: &mut Registry, juror: address): u64 {
        if (!table::contains(&registry.stakes, juror)) return 0;
        harvest(registry, juror);
        let amount = registry.juror_slash;
        let stake = table::borrow_mut(&mut registry.stakes, juror);
        let from_active = if (amount <= stake.amount) amount else stake.amount;
        let remainder = amount - from_active;
        let from_unbonding = if (remainder <= stake.unbonding_amount) remainder
            else stake.unbonding_amount;
        stake.amount = stake.amount - from_active;
        stake.unbonding_amount = stake.unbonding_amount - from_unbonding;
        let new_amount = stake.amount;
        stake.reward_debt = (new_amount as u128) * registry.acc_reward_per_share / ACC_PRECISION;
        registry.total_staked = registry.total_staked - from_active;
        sync_activation(registry, juror, new_amount);
        let slashed = from_active + from_unbonding;
        if (slashed > 0) event::emit(Slashed { validator: juror, amount: slashed });
        slashed
    }

    /// Split `pool` evenly across jurors who voted `winning_vote`; rounding
    /// dust (or an empty winner set) goes to the protocol treasury.
    fun reward_winning_jurors(registry: &mut Registry, dispute: &Dispute, winning_vote: u8, pool: u64) {
        if (pool == 0) return;
        let winners = if (winning_vote == VOTE_UPHOLD) dispute.votes_for else dispute.votes_against;
        let protocol_treasury = registry.protocol_treasury;
        if (winners == 0) {
            credit(registry, protocol_treasury, pool);
            return
        };
        let per_juror = pool / winners;
        let i = 0;
        let len = vector::length(&dispute.jurors);
        while (i < len) {
            if (*vector::borrow(&dispute.votes, i) == winning_vote) {
                let juror = *vector::borrow(&dispute.jurors, i);
                credit(registry, juror, per_juror);
            };
            i = i + 1;
        };
        credit(registry, protocol_treasury, pool - per_juror * winners);
    }

    // ---------------------------------------------------------------------
    // Withdrawals
    // ---------------------------------------------------------------------

    /// Pull any FOCAT credited to the caller (fees, refunds, juror rewards).
    public entry fun withdraw(caller: &signer) acquires Registry {
        let registry = borrow_global_mut<Registry>(@fileonchain);
        let to = signer::address_of(caller);
        assert!(table::contains(&registry.withdrawable, to), E_NOTHING_TO_WITHDRAW);
        let amount = table::remove(&mut registry.withdrawable, to);
        assert!(amount > 0, E_NOTHING_TO_WITHDRAW);
        escrow_out(registry, to, amount);
        event::emit(Withdrawn { to, amount });
    }

    // ---------------------------------------------------------------------
    // Staking
    // ---------------------------------------------------------------------

    public entry fun stake(caller: &signer, amount: u64) acquires Registry {
        assert!(amount > 0, E_BAD_AMOUNT);
        let registry = borrow_global_mut<Registry>(@fileonchain);
        let validator = signer::address_of(caller);
        escrow_in(registry, caller, amount);
        if (!table::contains(&registry.stakes, validator)) {
            table::add(&mut registry.stakes, validator, StakeInfo {
                amount: 0,
                reward_debt: 0,
                pending_rewards: 0,
                unbonding_amount: 0,
                unbonding_ends_at: 0,
            });
        };
        harvest(registry, validator);
        let acc = registry.acc_reward_per_share;
        let stake_info = table::borrow_mut(&mut registry.stakes, validator);
        stake_info.amount = stake_info.amount + amount;
        let new_amount = stake_info.amount;
        stake_info.reward_debt = (new_amount as u128) * acc / ACC_PRECISION;
        registry.total_staked = registry.total_staked + amount;
        sync_activation(registry, validator, new_amount);
        event::emit(Staked { validator, amount, total_stake: new_amount });
    }

    /// Move stake into the unbonding cooldown (merges + restarts the clock).
    public entry fun request_unstake(caller: &signer, amount: u64) acquires Registry {
        let registry = borrow_global_mut<Registry>(@fileonchain);
        let validator = signer::address_of(caller);
        assert!(table::contains(&registry.stakes, validator), E_BAD_AMOUNT);
        harvest(registry, validator);
        let acc = registry.acc_reward_per_share;
        let unbonding_secs = registry.unbonding_secs;
        let stake_info = table::borrow_mut(&mut registry.stakes, validator);
        assert!(amount > 0 && amount <= stake_info.amount, E_BAD_AMOUNT);
        stake_info.amount = stake_info.amount - amount;
        let new_amount = stake_info.amount;
        stake_info.reward_debt = (new_amount as u128) * acc / ACC_PRECISION;
        stake_info.unbonding_amount = stake_info.unbonding_amount + amount;
        let ends_at = timestamp::now_seconds() + unbonding_secs;
        stake_info.unbonding_ends_at = ends_at;
        registry.total_staked = registry.total_staked - amount;
        sync_activation(registry, validator, new_amount);
        event::emit(UnstakeRequested { validator, amount, unbonding_ends_at: ends_at });
    }

    public entry fun withdraw_unstaked(caller: &signer) acquires Registry {
        let registry = borrow_global_mut<Registry>(@fileonchain);
        let validator = signer::address_of(caller);
        assert!(table::contains(&registry.stakes, validator), E_NOTHING_UNBONDING);
        let amount = {
            let stake_info = table::borrow_mut(&mut registry.stakes, validator);
            assert!(stake_info.unbonding_amount > 0, E_NOTHING_UNBONDING);
            assert!(timestamp::now_seconds() >= stake_info.unbonding_ends_at, E_STILL_UNBONDING);
            let amount = stake_info.unbonding_amount;
            stake_info.unbonding_amount = 0;
            amount
        };
        escrow_out(registry, validator, amount);
    }

    public entry fun claim_rewards(caller: &signer) acquires Registry {
        let registry = borrow_global_mut<Registry>(@fileonchain);
        let validator = signer::address_of(caller);
        assert!(table::contains(&registry.stakes, validator), E_NOTHING_TO_CLAIM);
        harvest(registry, validator);
        let amount = {
            let stake_info = table::borrow_mut(&mut registry.stakes, validator);
            let amount = stake_info.pending_rewards;
            stake_info.pending_rewards = 0;
            amount
        };
        assert!(amount > 0, E_NOTHING_TO_CLAIM);
        escrow_out(registry, validator, amount);
    }

    fun harvest(registry: &mut Registry, validator: address) {
        let acc = registry.acc_reward_per_share;
        let stake_info = table::borrow_mut(&mut registry.stakes, validator);
        if (stake_info.amount > 0) {
            let accumulated = (stake_info.amount as u128) * acc / ACC_PRECISION;
            stake_info.pending_rewards = stake_info.pending_rewards
                + ((accumulated - stake_info.reward_debt) as u64);
            stake_info.reward_debt = accumulated;
        };
    }

    fun sync_activation(registry: &mut Registry, validator: address, stake_amount: u64) {
        let (active, index) = vector::index_of(&registry.validators, &validator);
        let should_be_active = stake_amount >= registry.min_stake;
        if (should_be_active && !active) {
            vector::push_back(&mut registry.validators, validator);
        } else if (!should_be_active && active) {
            vector::swap_remove(&mut registry.validators, index);
        };
    }

    fun is_active_validator_internal(registry: &Registry, who: address): bool {
        vector::contains(&registry.validators, &who)
    }

    // ---------------------------------------------------------------------
    // Admin (the EVM-governance executor; see docs/governance.md)
    // ---------------------------------------------------------------------

    fun assert_admin(registry: &Registry, caller: &signer) {
        assert!(signer::address_of(caller) == registry.admin, E_NOT_ADMIN);
    }

    public entry fun set_admin(caller: &signer, new_admin: address) acquires Registry {
        let registry = borrow_global_mut<Registry>(@fileonchain);
        assert_admin(registry, caller);
        registry.admin = new_admin;
    }

    public entry fun set_protocol_treasury(caller: &signer, treasury: address) acquires Registry {
        let registry = borrow_global_mut<Registry>(@fileonchain);
        assert_admin(registry, caller);
        registry.protocol_treasury = treasury;
    }

    public entry fun set_bonds(caller: &signer, propose_bond: u64, challenge_bond: u64) acquires Registry {
        let registry = borrow_global_mut<Registry>(@fileonchain);
        assert_admin(registry, caller);
        registry.propose_bond = propose_bond;
        registry.challenge_bond = challenge_bond;
    }

    public entry fun set_min_tip(caller: &signer, min_tip: u64) acquires Registry {
        let registry = borrow_global_mut<Registry>(@fileonchain);
        assert_admin(registry, caller);
        registry.min_tip = min_tip;
    }

    public entry fun set_windows(
        caller: &signer,
        challenge_window_secs: u64,
        vote_window_secs: u64,
    ) acquires Registry {
        assert!(challenge_window_secs > 0 && vote_window_secs > 0, E_BAD_AMOUNT);
        let registry = borrow_global_mut<Registry>(@fileonchain);
        assert_admin(registry, caller);
        registry.challenge_window_secs = challenge_window_secs;
        registry.vote_window_secs = vote_window_secs;
    }

    public entry fun set_jury_params(caller: &signer, jury_size: u64, juror_slash: u64) acquires Registry {
        assert!(jury_size >= 1 && jury_size % 2 == 1, E_BAD_JURY_SIZE);
        let registry = borrow_global_mut<Registry>(@fileonchain);
        assert_admin(registry, caller);
        registry.jury_size = jury_size;
        registry.juror_slash = juror_slash;
    }

    public entry fun set_fee_split(
        caller: &signer,
        validator_bps: u64,
        platform_bps: u64,
        protocol_bps: u64,
    ) acquires Registry {
        assert!(validator_bps + platform_bps + protocol_bps == BPS_DENOM, E_BAD_SPLIT);
        let registry = borrow_global_mut<Registry>(@fileonchain);
        assert_admin(registry, caller);
        registry.validator_bps = validator_bps;
        registry.platform_bps = platform_bps;
        registry.protocol_bps = protocol_bps;
    }

    public entry fun set_staking_params(caller: &signer, min_stake: u64, unbonding_secs: u64) acquires Registry {
        assert!(min_stake > 0, E_BAD_AMOUNT);
        let registry = borrow_global_mut<Registry>(@fileonchain);
        assert_admin(registry, caller);
        registry.min_stake = min_stake;
        registry.unbonding_secs = unbonding_secs;
    }

    public entry fun register_platform(
        caller: &signer,
        owner: address,
        treasury: address,
        fee_bps: u64,
    ) acquires Registry {
        let registry = borrow_global_mut<Registry>(@fileonchain);
        assert_admin(registry, caller);
        register_platform_internal(registry, owner, treasury, fee_bps);
    }

    public entry fun set_platform_active(caller: &signer, platform_id: u64, active: bool) acquires Registry {
        let registry = borrow_global_mut<Registry>(@fileonchain);
        assert_admin(registry, caller);
        assert!(table::contains(&registry.platforms, platform_id), E_UNKNOWN_PLATFORM);
        table::borrow_mut(&mut registry.platforms, platform_id).active = active;
    }

    public entry fun update_platform(
        caller: &signer,
        platform_id: u64,
        treasury: address,
        fee_bps: u64,
    ) acquires Registry {
        let registry = borrow_global_mut<Registry>(@fileonchain);
        assert!(table::contains(&registry.platforms, platform_id), E_UNKNOWN_PLATFORM);
        assert!(fee_bps <= registry.max_platform_fee_bps, E_FEE_ABOVE_CAP);
        let platform = table::borrow_mut(&mut registry.platforms, platform_id);
        assert!(signer::address_of(caller) == platform.owner, E_NOT_PLATFORM_OWNER);
        platform.treasury = treasury;
        platform.fee_bps = fee_bps;
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    #[view]
    /// (status, proposer, platform_id, tip, bond, challenge_deadline, verified_at)
    public fun get_proposal(proposal_id: u64): (u8, address, u64, u64, u64, u64, u64) acquires Registry {
        let registry = borrow_global<Registry>(@fileonchain);
        if (!table::contains(&registry.proposals, proposal_id))
            return (STATUS_NONE, @0x0, 0, 0, 0, 0, 0);
        let p = table::borrow(&registry.proposals, proposal_id);
        (p.status, p.proposer, p.platform_id, p.tip, p.bond, p.challenge_deadline, p.verified_at)
    }

    #[view]
    /// The verified proposal id for a CID; 0 when unverified.
    public fun verified_proposal_id(cid: String): u64 acquires Registry {
        let registry = borrow_global<Registry>(@fileonchain);
        if (!table::contains(&registry.verified_by_cid, cid)) return 0;
        *table::borrow(&registry.verified_by_cid, cid)
    }

    #[view]
    public fun proposal_ids_for_cid(cid: String): vector<u64> acquires Registry {
        let registry = borrow_global<Registry>(@fileonchain);
        if (!table::contains(&registry.proposal_ids_by_cid, cid)) return vector::empty();
        *table::borrow(&registry.proposal_ids_by_cid, cid)
    }

    #[view]
    public fun withdrawable_of(who: address): u64 acquires Registry {
        let registry = borrow_global<Registry>(@fileonchain);
        if (!table::contains(&registry.withdrawable, who)) return 0;
        *table::borrow(&registry.withdrawable, who)
    }

    #[view]
    public fun stake_of(who: address): u64 acquires Registry {
        let registry = borrow_global<Registry>(@fileonchain);
        if (!table::contains(&registry.stakes, who)) return 0;
        table::borrow(&registry.stakes, who).amount
    }

    #[view]
    public fun pending_rewards(who: address): u64 acquires Registry {
        let registry = borrow_global<Registry>(@fileonchain);
        if (!table::contains(&registry.stakes, who)) return 0;
        let stake_info = table::borrow(&registry.stakes, who);
        let accumulated = (stake_info.amount as u128) * registry.acc_reward_per_share / ACC_PRECISION;
        stake_info.pending_rewards + ((accumulated - stake_info.reward_debt) as u64)
    }

    #[view]
    public fun active_validator_count(): u64 acquires Registry {
        vector::length(&borrow_global<Registry>(@fileonchain).validators)
    }

    #[view]
    public fun jurors_of(proposal_id: u64): vector<address> acquires Registry {
        let registry = borrow_global<Registry>(@fileonchain);
        if (!table::contains(&registry.proposals, proposal_id)) return vector::empty();
        let p = table::borrow(&registry.proposals, proposal_id);
        if (vector::is_empty(&p.dispute)) return vector::empty();
        vector::borrow(&p.dispute, 0).jurors
    }

    #[view]
    /// (min_tip, propose_bond, challenge_bond, challenge_window_secs)
    public fun propose_params(): (u64, u64, u64, u64) acquires Registry {
        let registry = borrow_global<Registry>(@fileonchain);
        (registry.min_tip, registry.propose_bond, registry.challenge_bond, registry.challenge_window_secs)
    }

    // ---------------------------------------------------------------------
    // Test hooks
    // ---------------------------------------------------------------------

    #[test_only]
    public fun init_for_test(admin: &signer) {
        init_module(admin);
    }

    #[test_only]
    #[lint::allow_unsafe_randomness]
    public fun challenge_for_test(caller: &signer, proposal_id: u64) acquires Registry {
        challenge(caller, proposal_id);
    }
}
