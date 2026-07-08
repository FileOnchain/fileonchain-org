/// Optimistic anchor protocol for file CIDs — the Sui port of the EVM
/// FileRegistry + ValidatorStaking + PlatformRegistry suite, folded into one
/// shared `AnchorRegistry` object holding a single `Balance<FOCAT>` escrow
/// with internal ledgers.
///
/// File-level anchors are paid proposals: `propose_anchor` escrows a FOCAT
/// tip + bond (passed as an exact `Coin<FOCAT>` — Sui has no allowances; the
/// PTB splits the coin) and names the originating platform. Unchallenged
/// proposals `finalize` after the challenge window and the tip splits
/// validator/platform/protocol (60/25/15 default). A `challenge` escrows a
/// counter-bond and draws a jury from the staked validator set using Sui's
/// secure native randomness; the majority resolves, losing bonds and losing
/// jurors are slashed to the winners, ties default optimistic.
///
/// Proposals are keyed by id with first-verified-wins per CID. Chunk
/// anchors stay free and contention-free in `fileonchain::file_registry`.
/// Every propose/finalize touches this one shared object — acceptable for
/// file-level anchor rates; chunks never do.
///
/// Parameters are gated by the `AdminCap`, held by the account that
/// executes EVM governance decisions (docs/governance.md). v1 limitations
/// match the EVM contract: public votes, non-voters unslashed, no
/// delegation.
module fileonchain::anchor_registry {
    use std::string::String;
    use sui::balance::{Self, Balance};
    use sui::clock::Clock;
    use sui::coin::{Self, Coin};
    use sui::event;
    use sui::random::{Self, Random};
    use sui::table::{Self, Table};
    use fileonchain::focat::FOCAT;

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

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
    const E_WRONG_PAYMENT: u64 = 26;

    // ---------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------

    const STATUS_PROPOSED: u8 = 1;
    const STATUS_CHALLENGED: u8 = 2;
    const STATUS_VERIFIED: u8 = 3;
    const STATUS_REJECTED: u8 = 4;

    const VOTE_NONE: u8 = 0;
    const VOTE_UPHOLD: u8 = 1;
    const VOTE_REJECT: u8 = 2;

    const BPS_DENOM: u64 = 10_000;
    const ACC_PRECISION: u128 = 1_000_000_000_000;

    // Defaults (8-decimal FOCAT base units / milliseconds); all admin-settable.
    const DEFAULT_PROPOSE_BOND: u64 = 10_000_000_000; // 100 FOCAT
    const DEFAULT_CHALLENGE_BOND: u64 = 10_000_000_000; // 100 FOCAT
    const DEFAULT_MIN_TIP: u64 = 100_000_000; // 1 FOCAT
    const DEFAULT_CHALLENGE_WINDOW_MS: u64 = 86_400_000; // 24h
    const DEFAULT_VOTE_WINDOW_MS: u64 = 172_800_000; // 48h
    const DEFAULT_JURY_SIZE: u64 = 5;
    const DEFAULT_JUROR_SLASH: u64 = 5_000_000_000; // 50 FOCAT
    const DEFAULT_MIN_STAKE: u64 = 100_000_000_000; // 1000 FOCAT
    const DEFAULT_UNBONDING_MS: u64 = 604_800_000; // 7 days

    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    public struct AdminCap has key, store {
        id: UID,
    }

    public struct Dispute has store, drop {
        challenger: address,
        challenger_bond: u64,
        vote_deadline: u64,
        jurors: vector<address>,
        votes: vector<u8>, // parallel to jurors
        votes_for: u64,
        votes_against: u64,
    }

    public struct Proposal has store {
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
        dispute: vector<Dispute>, // empty or one element
    }

    public struct StakeInfo has store, drop {
        amount: u64,
        reward_debt: u128,
        pending_rewards: u64,
        unbonding_amount: u64,
        unbonding_ends_at: u64,
    }

    public struct Platform has store, drop {
        owner: address,
        treasury: address,
        fee_bps: u64,
        active: bool,
    }

    public struct AnchorRegistry has key {
        id: UID,
        protocol_treasury: address,
        escrow: Balance<FOCAT>,
        // params
        propose_bond: u64,
        challenge_bond: u64,
        min_tip: u64,
        challenge_window_ms: u64,
        vote_window_ms: u64,
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
        unbonding_ms: u64,
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

    public struct AnchorProposed has copy, drop {
        proposal_id: u64,
        cid: String,
        proposer: address,
        platform_id: u64,
        tip: u64,
        bond: u64,
        challenge_deadline: u64,
    }

    public struct AnchorChallenged has copy, drop {
        proposal_id: u64,
        challenger: address,
        challenger_bond: u64,
        vote_deadline: u64,
        jurors: vector<address>,
    }

    public struct JurorVoted has copy, drop {
        proposal_id: u64,
        juror: address,
        uphold_proposal: bool,
    }

    public struct AnchorVerified has copy, drop {
        proposal_id: u64,
        cid: String,
        proposer: address,
        validator_amount: u64,
        platform_amount: u64,
        protocol_amount: u64,
    }

    public struct AnchorRejected has copy, drop {
        proposal_id: u64,
        cid: String,
        proposer: address,
    }

    public struct Staked has copy, drop {
        validator: address,
        amount: u64,
        total_stake: u64,
    }

    public struct Slashed has copy, drop {
        validator: address,
        amount: u64,
    }

    public struct Withdrawn has copy, drop {
        to: address,
        amount: u64,
    }

    public struct PlatformRegistered has copy, drop {
        platform_id: u64,
        owner: address,
        treasury: address,
        fee_bps: u64,
    }

    // ---------------------------------------------------------------------
    // Init
    // ---------------------------------------------------------------------

    fun init(ctx: &mut TxContext) {
        let sender = ctx.sender();
        let mut registry = AnchorRegistry {
            id: object::new(ctx),
            protocol_treasury: sender,
            escrow: balance::zero(),
            propose_bond: DEFAULT_PROPOSE_BOND,
            challenge_bond: DEFAULT_CHALLENGE_BOND,
            min_tip: DEFAULT_MIN_TIP,
            challenge_window_ms: DEFAULT_CHALLENGE_WINDOW_MS,
            vote_window_ms: DEFAULT_VOTE_WINDOW_MS,
            jury_size: DEFAULT_JURY_SIZE,
            juror_slash: DEFAULT_JUROR_SLASH,
            validator_bps: 6_000,
            platform_bps: 2_500,
            protocol_bps: 1_500,
            next_proposal_id: 1,
            proposals: table::new(ctx),
            proposal_ids_by_cid: table::new(ctx),
            verified_by_cid: table::new(ctx),
            withdrawable: table::new(ctx),
            min_stake: DEFAULT_MIN_STAKE,
            unbonding_ms: DEFAULT_UNBONDING_MS,
            validators: vector[],
            stakes: table::new(ctx),
            total_staked: 0,
            acc_reward_per_share: 0,
            next_platform_id: 1,
            platforms: table::new(ctx),
            max_platform_fee_bps: 2_500,
        };
        // FileOnChain itself is platform 1.
        register_platform_internal(&mut registry, sender, sender, 2_500);
        transfer::share_object(registry);
        transfer::public_transfer(AdminCap { id: object::new(ctx) }, sender);
    }

    fun register_platform_internal(
        registry: &mut AnchorRegistry,
        owner: address,
        treasury: address,
        fee_bps: u64,
    ): u64 {
        assert!(fee_bps <= registry.max_platform_fee_bps, E_FEE_ABOVE_CAP);
        let platform_id = registry.next_platform_id;
        registry.next_platform_id = platform_id + 1;
        registry.platforms.add(platform_id, Platform { owner, treasury, fee_bps, active: true });
        event::emit(PlatformRegistered { platform_id, owner, treasury, fee_bps });
        platform_id
    }

    // ---------------------------------------------------------------------
    // Internal ledger helpers
    // ---------------------------------------------------------------------

    fun credit(registry: &mut AnchorRegistry, to: address, amount: u64) {
        if (amount == 0) return;
        if (registry.withdrawable.contains(to)) {
            let balance = registry.withdrawable.borrow_mut(to);
            *balance = *balance + amount;
        } else {
            registry.withdrawable.add(to, amount);
        }
    }

    fun pay_out(registry: &mut AnchorRegistry, to: address, amount: u64, ctx: &mut TxContext) {
        transfer::public_transfer(coin::from_balance(registry.escrow.split(amount), ctx), to);
    }

    // ---------------------------------------------------------------------
    // Propose / finalize
    // ---------------------------------------------------------------------

    /// Propose a file-level anchor. `payment` must be exactly
    /// `tip + propose_bond` FOCAT (split it in the PTB).
    public entry fun propose_anchor(
        registry: &mut AnchorRegistry,
        payment: Coin<FOCAT>,
        cid: String,
        content_hash: vector<u8>,
        uri: String,
        platform_id: u64,
        tip: u64,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        assert!(!registry.verified_by_cid.contains(cid), E_ALREADY_VERIFIED);
        assert!(tip >= registry.min_tip, E_TIP_BELOW_MIN);
        assert!(
            registry.platforms.contains(platform_id) && registry.platforms.borrow(platform_id).active,
            E_PLATFORM_INACTIVE,
        );
        assert!(payment.value() == tip + registry.propose_bond, E_WRONG_PAYMENT);
        registry.escrow.join(payment.into_balance());

        let proposal_id = registry.next_proposal_id;
        registry.next_proposal_id = proposal_id + 1;
        let now = clock.timestamp_ms();
        let challenge_deadline = now + registry.challenge_window_ms;
        let proposer = ctx.sender();
        registry.proposals.add(proposal_id, Proposal {
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
            dispute: vector[],
        });
        if (registry.proposal_ids_by_cid.contains(cid)) {
            registry.proposal_ids_by_cid.borrow_mut(cid).push_back(proposal_id);
        } else {
            registry.proposal_ids_by_cid.add(cid, vector[proposal_id]);
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
    public entry fun finalize(registry: &mut AnchorRegistry, proposal_id: u64, clock: &Clock) {
        assert!(registry.proposals.contains(proposal_id), E_UNKNOWN_PROPOSAL);
        {
            let proposal = registry.proposals.borrow(proposal_id);
            assert!(proposal.status == STATUS_PROPOSED, E_NOT_PROPOSED);
            assert!(clock.timestamp_ms() > proposal.challenge_deadline, E_WINDOW_OPEN);
        };
        settle_upheld_proposal(registry, proposal_id, clock);
    }

    fun settle_upheld_proposal(registry: &mut AnchorRegistry, proposal_id: u64, clock: &Clock) {
        let (cid, proposer, tip, bond) = {
            let p = registry.proposals.borrow(proposal_id);
            (p.cid, p.proposer, p.tip, p.bond)
        };
        if (registry.verified_by_cid.contains(cid)) {
            // Lost the race: first verified wins; full refund.
            registry.proposals.borrow_mut(proposal_id).status = STATUS_REJECTED;
            credit(registry, proposer, tip + bond);
            event::emit(AnchorRejected { proposal_id, cid, proposer });
            return
        };

        let mut validator_amount = tip * registry.validator_bps / BPS_DENOM;
        let (platform_treasury, platform_fee_bps) = {
            let platform_id = registry.proposals.borrow(proposal_id).platform_id;
            let platform = registry.platforms.borrow(platform_id);
            (platform.treasury, platform.fee_bps)
        };
        let effective_bps = if (platform_fee_bps < registry.platform_bps) platform_fee_bps
        else registry.platform_bps;
        let platform_amount = tip * effective_bps / BPS_DENOM;
        let mut protocol_amount = tip - validator_amount - platform_amount;
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

        registry.verified_by_cid.add(cid, proposal_id);
        let now = clock.timestamp_ms();
        let p = registry.proposals.borrow_mut(proposal_id);
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

    /// Challenge a live proposal within its window; `payment` must be exactly
    /// the challenge bond. Draws the jury with Sui secure randomness (private
    /// entry, as the Random API requires).
    entry fun challenge(
        registry: &mut AnchorRegistry,
        payment: Coin<FOCAT>,
        proposal_id: u64,
        r: &Random,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(registry.proposals.contains(proposal_id), E_UNKNOWN_PROPOSAL);
        let challenger = ctx.sender();
        let proposer = {
            let proposal = registry.proposals.borrow(proposal_id);
            assert!(proposal.status == STATUS_PROPOSED, E_NOT_PROPOSED);
            assert!(clock.timestamp_ms() <= proposal.challenge_deadline, E_WINDOW_CLOSED);
            proposal.proposer
        };
        assert!(payment.value() == registry.challenge_bond, E_WRONG_PAYMENT);

        let validator_count = registry.validators.length();
        let mut excluded = 0;
        if (registry.validators.contains(&proposer)) excluded = excluded + 1;
        if (challenger != proposer && registry.validators.contains(&challenger))
            excluded = excluded + 1;
        assert!(validator_count >= registry.jury_size + excluded, E_NOT_ENOUGH_VALIDATORS);

        let challenger_bond = payment.value();
        registry.escrow.join(payment.into_balance());

        let mut generator = random::new_generator(r, ctx);
        let mut jurors = vector<address>[];
        let target = registry.jury_size;
        let max_iterations = target * 16;
        let mut i = 0;
        while (i < max_iterations && jurors.length() < target) {
            let candidate = registry.validators[generator.generate_u64_in_range(0, validator_count - 1)];
            i = i + 1;
            if (candidate == proposer || candidate == challenger) continue;
            if (jurors.contains(&candidate)) continue;
            jurors.push_back(candidate);
        };
        assert!(jurors.length() == target, E_JURY_DRAW_FAILED);

        let mut votes = vector<u8>[];
        let mut j = 0;
        while (j < jurors.length()) {
            votes.push_back(VOTE_NONE);
            j = j + 1;
        };
        let vote_deadline = clock.timestamp_ms() + registry.vote_window_ms;
        event::emit(AnchorChallenged {
            proposal_id,
            challenger,
            challenger_bond,
            vote_deadline,
            jurors,
        });
        let proposal = registry.proposals.borrow_mut(proposal_id);
        proposal.status = STATUS_CHALLENGED;
        proposal.dispute.push_back(Dispute {
            challenger,
            challenger_bond,
            vote_deadline,
            jurors,
            votes,
            votes_for: 0,
            votes_against: 0,
        });
    }

    /// Cast a jury vote; `uphold_proposal = true` sides with the proposer.
    public entry fun cast_vote(
        registry: &mut AnchorRegistry,
        proposal_id: u64,
        uphold_proposal: bool,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        assert!(registry.proposals.contains(proposal_id), E_UNKNOWN_PROPOSAL);
        let proposal = registry.proposals.borrow_mut(proposal_id);
        assert!(proposal.status == STATUS_CHALLENGED, E_NOT_CHALLENGED);
        let dispute = &mut proposal.dispute[0];
        assert!(clock.timestamp_ms() <= dispute.vote_deadline, E_VOTING_CLOSED);
        let juror = ctx.sender();
        let (found, index) = dispute.jurors.index_of(&juror);
        assert!(found, E_NOT_JUROR);
        assert!(dispute.votes[index] == VOTE_NONE, E_ALREADY_VOTED);
        if (uphold_proposal) {
            *(&mut dispute.votes[index]) = VOTE_UPHOLD;
            dispute.votes_for = dispute.votes_for + 1;
        } else {
            *(&mut dispute.votes[index]) = VOTE_REJECT;
            dispute.votes_against = dispute.votes_against + 1;
        };
        event::emit(JurorVoted { proposal_id, juror, uphold_proposal });
    }

    /// Resolve a dispute after the vote deadline (anyone may call).
    /// Majority wins; ties and zero participation default optimistic.
    public entry fun resolve_dispute(registry: &mut AnchorRegistry, proposal_id: u64, clock: &Clock) {
        assert!(registry.proposals.contains(proposal_id), E_UNKNOWN_PROPOSAL);
        let dispute = {
            let proposal = registry.proposals.borrow_mut(proposal_id);
            assert!(proposal.status == STATUS_CHALLENGED, E_NOT_CHALLENGED);
            let d = proposal.dispute.pop_back();
            assert!(clock.timestamp_ms() > d.vote_deadline, E_VOTING_OPEN);
            d
        };

        if (dispute.votes_against > dispute.votes_for) {
            resolve_challenger_wins(registry, proposal_id, &dispute);
        } else if (dispute.votes_for > dispute.votes_against) {
            let proposer = registry.proposals.borrow(proposal_id).proposer;
            let to_proposer = dispute.challenger_bond / 2;
            credit(registry, proposer, to_proposer);
            let mut juror_pool = dispute.challenger_bond - to_proposer;
            juror_pool = juror_pool + slash_losing_jurors(registry, &dispute, VOTE_REJECT);
            reward_winning_jurors(registry, &dispute, VOTE_UPHOLD, juror_pool);
            settle_upheld_proposal(registry, proposal_id, clock);
        } else {
            credit(registry, dispute.challenger, dispute.challenger_bond);
            settle_upheld_proposal(registry, proposal_id, clock);
        }
    }

    fun resolve_challenger_wins(
        registry: &mut AnchorRegistry,
        proposal_id: u64,
        dispute: &Dispute,
    ) {
        let (cid, proposer, tip, bond) = {
            let p = registry.proposals.borrow_mut(proposal_id);
            p.status = STATUS_REJECTED;
            (p.cid, p.proposer, p.tip, p.bond)
        };
        credit(registry, proposer, tip);
        credit(registry, dispute.challenger, dispute.challenger_bond);
        let to_challenger = bond / 2;
        credit(registry, dispute.challenger, to_challenger);
        let mut juror_pool = bond - to_challenger;
        juror_pool = juror_pool + slash_losing_jurors(registry, dispute, VOTE_UPHOLD);
        reward_winning_jurors(registry, dispute, VOTE_REJECT, juror_pool);
        event::emit(AnchorRejected { proposal_id, cid, proposer });
    }

    fun slash_losing_jurors(
        registry: &mut AnchorRegistry,
        dispute: &Dispute,
        losing_vote: u8,
    ): u64 {
        let mut pool = 0;
        let mut i = 0;
        while (i < dispute.jurors.length()) {
            if (dispute.votes[i] == losing_vote) {
                pool = pool + slash_stake(registry, dispute.jurors[i]);
            };
            i = i + 1;
        };
        pool
    }

    fun slash_stake(registry: &mut AnchorRegistry, juror: address): u64 {
        if (!registry.stakes.contains(juror)) return 0;
        harvest(registry, juror);
        let amount = registry.juror_slash;
        let acc = registry.acc_reward_per_share;
        let min_stake = registry.min_stake;
        let stake_info = registry.stakes.borrow_mut(juror);
        let from_active = if (amount <= stake_info.amount) amount else stake_info.amount;
        let remainder = amount - from_active;
        let from_unbonding = if (remainder <= stake_info.unbonding_amount) remainder
        else stake_info.unbonding_amount;
        stake_info.amount = stake_info.amount - from_active;
        stake_info.unbonding_amount = stake_info.unbonding_amount - from_unbonding;
        let new_amount = stake_info.amount;
        stake_info.reward_debt = (new_amount as u128) * acc / ACC_PRECISION;
        registry.total_staked = registry.total_staked - from_active;
        sync_activation(registry, juror, new_amount, min_stake);
        let slashed = from_active + from_unbonding;
        if (slashed > 0) event::emit(Slashed { validator: juror, amount: slashed });
        slashed
    }

    fun reward_winning_jurors(
        registry: &mut AnchorRegistry,
        dispute: &Dispute,
        winning_vote: u8,
        pool: u64,
    ) {
        if (pool == 0) return;
        let winners = if (winning_vote == VOTE_UPHOLD) dispute.votes_for else dispute.votes_against;
        let protocol_treasury = registry.protocol_treasury;
        if (winners == 0) {
            credit(registry, protocol_treasury, pool);
            return
        };
        let per_juror = pool / winners;
        let mut i = 0;
        while (i < dispute.jurors.length()) {
            if (dispute.votes[i] == winning_vote) {
                credit(registry, dispute.jurors[i], per_juror);
            };
            i = i + 1;
        };
        credit(registry, protocol_treasury, pool - per_juror * winners);
    }

    // ---------------------------------------------------------------------
    // Withdrawals
    // ---------------------------------------------------------------------

    /// Pull any FOCAT credited to the caller (fees, refunds, juror rewards).
    public entry fun withdraw(registry: &mut AnchorRegistry, ctx: &mut TxContext) {
        let to = ctx.sender();
        assert!(registry.withdrawable.contains(to), E_NOTHING_TO_WITHDRAW);
        let amount = registry.withdrawable.remove(to);
        assert!(amount > 0, E_NOTHING_TO_WITHDRAW);
        pay_out(registry, to, amount, ctx);
        event::emit(Withdrawn { to, amount });
    }

    // ---------------------------------------------------------------------
    // Staking
    // ---------------------------------------------------------------------

    /// Stake the whole `payment` coin toward the validator minimum.
    public entry fun stake(registry: &mut AnchorRegistry, payment: Coin<FOCAT>, ctx: &TxContext) {
        let amount = payment.value();
        assert!(amount > 0, E_BAD_AMOUNT);
        let validator = ctx.sender();
        registry.escrow.join(payment.into_balance());
        if (!registry.stakes.contains(validator)) {
            registry.stakes.add(validator, StakeInfo {
                amount: 0,
                reward_debt: 0,
                pending_rewards: 0,
                unbonding_amount: 0,
                unbonding_ends_at: 0,
            });
        };
        harvest(registry, validator);
        let acc = registry.acc_reward_per_share;
        let min_stake = registry.min_stake;
        let stake_info = registry.stakes.borrow_mut(validator);
        stake_info.amount = stake_info.amount + amount;
        let new_amount = stake_info.amount;
        stake_info.reward_debt = (new_amount as u128) * acc / ACC_PRECISION;
        registry.total_staked = registry.total_staked + amount;
        sync_activation(registry, validator, new_amount, min_stake);
        event::emit(Staked { validator, amount, total_stake: new_amount });
    }

    /// Move stake into the unbonding cooldown (merges + restarts the clock).
    public entry fun request_unstake(
        registry: &mut AnchorRegistry,
        amount: u64,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        let validator = ctx.sender();
        assert!(registry.stakes.contains(validator), E_BAD_AMOUNT);
        harvest(registry, validator);
        let acc = registry.acc_reward_per_share;
        let min_stake = registry.min_stake;
        let unbonding_ms = registry.unbonding_ms;
        let stake_info = registry.stakes.borrow_mut(validator);
        assert!(amount > 0 && amount <= stake_info.amount, E_BAD_AMOUNT);
        stake_info.amount = stake_info.amount - amount;
        let new_amount = stake_info.amount;
        stake_info.reward_debt = (new_amount as u128) * acc / ACC_PRECISION;
        stake_info.unbonding_amount = stake_info.unbonding_amount + amount;
        stake_info.unbonding_ends_at = clock.timestamp_ms() + unbonding_ms;
        registry.total_staked = registry.total_staked - amount;
        sync_activation(registry, validator, new_amount, min_stake);
    }

    public entry fun withdraw_unstaked(
        registry: &mut AnchorRegistry,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let validator = ctx.sender();
        assert!(registry.stakes.contains(validator), E_NOTHING_UNBONDING);
        let amount = {
            let stake_info = registry.stakes.borrow_mut(validator);
            assert!(stake_info.unbonding_amount > 0, E_NOTHING_UNBONDING);
            assert!(clock.timestamp_ms() >= stake_info.unbonding_ends_at, E_STILL_UNBONDING);
            let amount = stake_info.unbonding_amount;
            stake_info.unbonding_amount = 0;
            amount
        };
        pay_out(registry, validator, amount, ctx);
    }

    public entry fun claim_rewards(registry: &mut AnchorRegistry, ctx: &mut TxContext) {
        let validator = ctx.sender();
        assert!(registry.stakes.contains(validator), E_NOTHING_TO_CLAIM);
        harvest(registry, validator);
        let amount = {
            let stake_info = registry.stakes.borrow_mut(validator);
            let amount = stake_info.pending_rewards;
            stake_info.pending_rewards = 0;
            amount
        };
        assert!(amount > 0, E_NOTHING_TO_CLAIM);
        pay_out(registry, validator, amount, ctx);
    }

    fun harvest(registry: &mut AnchorRegistry, validator: address) {
        let acc = registry.acc_reward_per_share;
        let stake_info = registry.stakes.borrow_mut(validator);
        if (stake_info.amount > 0) {
            let accumulated = (stake_info.amount as u128) * acc / ACC_PRECISION;
            stake_info.pending_rewards = stake_info.pending_rewards
                + ((accumulated - stake_info.reward_debt) as u64);
            stake_info.reward_debt = accumulated;
        };
    }

    fun sync_activation(
        registry: &mut AnchorRegistry,
        validator: address,
        stake_amount: u64,
        min_stake: u64,
    ) {
        let (active, index) = registry.validators.index_of(&validator);
        let should_be_active = stake_amount >= min_stake;
        if (should_be_active && !active) {
            registry.validators.push_back(validator);
        } else if (!should_be_active && active) {
            registry.validators.swap_remove(index);
        };
    }

    // ---------------------------------------------------------------------
    // Admin (the EVM-governance executor; see docs/governance.md)
    // ---------------------------------------------------------------------

    public entry fun set_protocol_treasury(
        registry: &mut AnchorRegistry,
        _cap: &AdminCap,
        treasury: address,
    ) {
        registry.protocol_treasury = treasury;
    }

    public entry fun set_bonds(
        registry: &mut AnchorRegistry,
        _cap: &AdminCap,
        propose_bond: u64,
        challenge_bond: u64,
    ) {
        registry.propose_bond = propose_bond;
        registry.challenge_bond = challenge_bond;
    }

    public entry fun set_min_tip(registry: &mut AnchorRegistry, _cap: &AdminCap, min_tip: u64) {
        registry.min_tip = min_tip;
    }

    public entry fun set_windows(
        registry: &mut AnchorRegistry,
        _cap: &AdminCap,
        challenge_window_ms: u64,
        vote_window_ms: u64,
    ) {
        assert!(challenge_window_ms > 0 && vote_window_ms > 0, E_BAD_AMOUNT);
        registry.challenge_window_ms = challenge_window_ms;
        registry.vote_window_ms = vote_window_ms;
    }

    public entry fun set_jury_params(
        registry: &mut AnchorRegistry,
        _cap: &AdminCap,
        jury_size: u64,
        juror_slash: u64,
    ) {
        assert!(jury_size >= 1 && jury_size % 2 == 1, E_BAD_JURY_SIZE);
        registry.jury_size = jury_size;
        registry.juror_slash = juror_slash;
    }

    public entry fun set_fee_split(
        registry: &mut AnchorRegistry,
        _cap: &AdminCap,
        validator_bps: u64,
        platform_bps: u64,
        protocol_bps: u64,
    ) {
        assert!(validator_bps + platform_bps + protocol_bps == BPS_DENOM, E_BAD_SPLIT);
        registry.validator_bps = validator_bps;
        registry.platform_bps = platform_bps;
        registry.protocol_bps = protocol_bps;
    }

    public entry fun set_staking_params(
        registry: &mut AnchorRegistry,
        _cap: &AdminCap,
        min_stake: u64,
        unbonding_ms: u64,
    ) {
        assert!(min_stake > 0, E_BAD_AMOUNT);
        registry.min_stake = min_stake;
        registry.unbonding_ms = unbonding_ms;
    }

    public entry fun register_platform(
        registry: &mut AnchorRegistry,
        _cap: &AdminCap,
        owner: address,
        treasury: address,
        fee_bps: u64,
    ) {
        register_platform_internal(registry, owner, treasury, fee_bps);
    }

    public entry fun set_platform_active(
        registry: &mut AnchorRegistry,
        _cap: &AdminCap,
        platform_id: u64,
        active: bool,
    ) {
        assert!(registry.platforms.contains(platform_id), E_UNKNOWN_PLATFORM);
        registry.platforms.borrow_mut(platform_id).active = active;
    }

    public entry fun update_platform(
        registry: &mut AnchorRegistry,
        platform_id: u64,
        treasury: address,
        fee_bps: u64,
        ctx: &TxContext,
    ) {
        assert!(registry.platforms.contains(platform_id), E_UNKNOWN_PLATFORM);
        assert!(fee_bps <= registry.max_platform_fee_bps, E_FEE_ABOVE_CAP);
        let platform = registry.platforms.borrow_mut(platform_id);
        assert!(ctx.sender() == platform.owner, E_NOT_PLATFORM_OWNER);
        platform.treasury = treasury;
        platform.fee_bps = fee_bps;
    }

    // ---------------------------------------------------------------------
    // Reads (devInspect-friendly)
    // ---------------------------------------------------------------------

    /// (status, proposer, platform_id, tip, bond, challenge_deadline, verified_at)
    public fun get_proposal(
        registry: &AnchorRegistry,
        proposal_id: u64,
    ): (u8, address, u64, u64, u64, u64, u64) {
        if (!registry.proposals.contains(proposal_id)) return (0, @0x0, 0, 0, 0, 0, 0);
        let p = registry.proposals.borrow(proposal_id);
        (p.status, p.proposer, p.platform_id, p.tip, p.bond, p.challenge_deadline, p.verified_at)
    }

    /// The verified proposal id for a CID; 0 when unverified.
    public fun verified_proposal_id(registry: &AnchorRegistry, cid: String): u64 {
        if (!registry.verified_by_cid.contains(cid)) return 0;
        *registry.verified_by_cid.borrow(cid)
    }

    public fun proposal_ids_for_cid(registry: &AnchorRegistry, cid: String): vector<u64> {
        if (!registry.proposal_ids_by_cid.contains(cid)) return vector[];
        *registry.proposal_ids_by_cid.borrow(cid)
    }

    public fun withdrawable_of(registry: &AnchorRegistry, who: address): u64 {
        if (!registry.withdrawable.contains(who)) return 0;
        *registry.withdrawable.borrow(who)
    }

    public fun stake_of(registry: &AnchorRegistry, who: address): u64 {
        if (!registry.stakes.contains(who)) return 0;
        registry.stakes.borrow(who).amount
    }

    public fun pending_rewards(registry: &AnchorRegistry, who: address): u64 {
        if (!registry.stakes.contains(who)) return 0;
        let stake_info = registry.stakes.borrow(who);
        let accumulated = (stake_info.amount as u128) * registry.acc_reward_per_share / ACC_PRECISION;
        stake_info.pending_rewards + ((accumulated - stake_info.reward_debt) as u64)
    }

    public fun active_validator_count(registry: &AnchorRegistry): u64 {
        registry.validators.length()
    }

    public fun jurors_of(registry: &AnchorRegistry, proposal_id: u64): vector<address> {
        if (!registry.proposals.contains(proposal_id)) return vector[];
        let p = registry.proposals.borrow(proposal_id);
        if (p.dispute.is_empty()) return vector[];
        p.dispute[0].jurors
    }

    /// (min_tip, propose_bond, challenge_bond, challenge_window_ms)
    public fun propose_params(registry: &AnchorRegistry): (u64, u64, u64, u64) {
        (registry.min_tip, registry.propose_bond, registry.challenge_bond, registry.challenge_window_ms)
    }

    // ---------------------------------------------------------------------
    // Test hooks
    // ---------------------------------------------------------------------

    #[test_only]
    public fun init_for_test(ctx: &mut TxContext) {
        init(ctx);
    }

    #[test_only]
    public fun challenge_for_test(
        registry: &mut AnchorRegistry,
        payment: Coin<FOCAT>,
        proposal_id: u64,
        r: &Random,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        challenge(registry, payment, proposal_id, r, clock, ctx);
    }
}
