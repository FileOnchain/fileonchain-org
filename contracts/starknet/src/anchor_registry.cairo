//! Optimistic anchor protocol for file CIDs — the Cairo port of the EVM
//! FileRegistry + ValidatorStaking + PlatformRegistry suite, folded into one
//! contract escrowing FOC via standard ERC-20 approve/transfer_from.
//!
//! File-level anchors are paid proposals: `propose_anchor` escrows a FOC
//! tip + bond and names the originating platform. Unchallenged proposals
//! `finalize` after the challenge window — the tip splits
//! validator/platform/protocol (60/25/15 default, pull payments via
//! `withdraw`). A `challenge` escrows a counter-bond; the jury is drawn in
//! a **second step** (`draw_jury`, ≥10 blocks later) seeded from
//! `get_block_hash_syscall` — Starknet has no prevrandao, so this is the
//! weakest jury randomness of all runtimes: the draw-caller can time the
//! call. Documented v1 limitation; a VRF is the follow-up.
//!
//! Proposals are keyed by id with first-verified-wins per CID. Chunk
//! anchors stay free in the stateless FileRegistry contract. Parameters
//! are admin-gated — the admin executes EVM governance decisions (see
//! docs/governance.md).

use starknet::ContractAddress;

/// Read-back shape for a proposal (status: 0 none, 1 proposed, 2 challenged,
/// 3 verified, 4 rejected).
#[derive(Drop, Serde)]
pub struct ProposalView {
    pub status: u8,
    pub proposer: ContractAddress,
    pub platform_id: u64,
    pub tip: u256,
    pub bond: u256,
    pub challenge_deadline: u64,
    pub verified_at: u64,
}

#[starknet::interface]
pub trait IAnchorRegistry<TContractState> {
    // propose / verify
    fn propose_anchor(
        ref self: TContractState,
        cid: ByteArray,
        content_hash: u256,
        uri: ByteArray,
        platform_id: u64,
        tip: u256,
    ) -> u64;
    fn finalize(ref self: TContractState, proposal_id: u64);
    fn challenge(ref self: TContractState, proposal_id: u64);
    fn draw_jury(ref self: TContractState, proposal_id: u64);
    fn cast_vote(ref self: TContractState, proposal_id: u64, uphold_proposal: bool);
    fn resolve_dispute(ref self: TContractState, proposal_id: u64);
    fn withdraw(ref self: TContractState);
    // staking
    fn stake(ref self: TContractState, amount: u256);
    fn request_unstake(ref self: TContractState, amount: u256);
    fn withdraw_unstaked(ref self: TContractState);
    fn claim_rewards(ref self: TContractState);
    // admin (EVM-governance executor)
    fn set_admin(ref self: TContractState, new_admin: ContractAddress);
    fn set_protocol_treasury(ref self: TContractState, treasury: ContractAddress);
    fn set_bonds(ref self: TContractState, propose_bond: u256, challenge_bond: u256);
    fn set_min_tip(ref self: TContractState, min_tip: u256);
    fn set_windows(ref self: TContractState, challenge_window_secs: u64, vote_window_secs: u64);
    fn set_jury_params(ref self: TContractState, jury_size: u64, juror_slash: u256);
    fn set_fee_split(
        ref self: TContractState, validator_bps: u64, platform_bps: u64, protocol_bps: u64,
    );
    fn set_staking_params(ref self: TContractState, min_stake: u256, unbonding_secs: u64);
    fn register_platform(
        ref self: TContractState, owner: ContractAddress, treasury: ContractAddress, fee_bps: u64,
    ) -> u64;
    fn set_platform_active(ref self: TContractState, platform_id: u64, active: bool);
    fn update_platform(
        ref self: TContractState, platform_id: u64, treasury: ContractAddress, fee_bps: u64,
    );
    // views
    fn get_proposal(self: @TContractState, proposal_id: u64) -> ProposalView;
    fn verified_proposal_id(self: @TContractState, cid: ByteArray) -> u64;
    fn proposal_count_for_cid(self: @TContractState, cid: ByteArray) -> u64;
    fn proposal_id_for_cid(self: @TContractState, cid: ByteArray, index: u64) -> u64;
    fn withdrawable_of(self: @TContractState, who: ContractAddress) -> u256;
    fn stake_of(self: @TContractState, who: ContractAddress) -> u256;
    fn pending_rewards(self: @TContractState, who: ContractAddress) -> u256;
    fn active_validator_count(self: @TContractState) -> u64;
    fn juror_at(self: @TContractState, proposal_id: u64, index: u64) -> ContractAddress;
    fn get_vote(self: @TContractState, proposal_id: u64, juror: ContractAddress) -> u8;
    fn propose_params(self: @TContractState) -> (u256, u256, u256, u64);
}

#[starknet::contract]
pub mod AnchorRegistry {
    use core::num::traits::Zero;
    use core::poseidon::poseidon_hash_span;
    use starknet::storage::{
        Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess,
    };
    use starknet::syscalls::get_block_hash_syscall;
    use starknet::{
        ContractAddress, get_block_number, get_block_timestamp, get_caller_address,
        get_contract_address,
    };
    use crate::foc_token::{IERC20Dispatcher, IERC20DispatcherTrait};
    use super::ProposalView;

    const STATUS_NONE: u8 = 0;
    const STATUS_PROPOSED: u8 = 1;
    const STATUS_CHALLENGED: u8 = 2;
    const STATUS_VERIFIED: u8 = 3;
    const STATUS_REJECTED: u8 = 4;

    const VOTE_NONE: u8 = 0;
    const VOTE_UPHOLD: u8 = 1;
    const VOTE_REJECT: u8 = 2;

    const BPS_DENOM: u256 = 10_000;
    const ACC_PRECISION: u256 = 1_000_000_000_000;
    /// Blocks between challenge and jury draw (block-hash seeding window).
    const DRAW_DELAY_BLOCKS: u64 = 10;

    #[derive(Drop, Serde, starknet::Store)]
    struct Proposal {
        cid: ByteArray,
        content_hash: u256,
        uri: ByteArray,
        proposer: ContractAddress,
        platform_id: u64,
        tip: u256,
        bond: u256,
        proposed_at: u64,
        challenge_deadline: u64,
        verified_at: u64,
        status: u8,
    }

    #[derive(Drop, Serde, starknet::Store)]
    struct Dispute {
        challenger: ContractAddress,
        challenger_bond: u256,
        challenged_at_block: u64,
        jury_drawn: bool,
        vote_deadline: u64,
        votes_for: u64,
        votes_against: u64,
    }

    #[derive(Drop, Serde, starknet::Store)]
    struct StakeInfo {
        amount: u256,
        reward_debt: u256,
        pending_rewards: u256,
        unbonding_amount: u256,
        unbonding_ends_at: u64,
    }

    #[derive(Drop, Serde, starknet::Store)]
    struct Platform {
        owner: ContractAddress,
        treasury: ContractAddress,
        fee_bps: u64,
        active: bool,
    }

    #[storage]
    struct Storage {
        admin: ContractAddress,
        protocol_treasury: ContractAddress,
        token: ContractAddress,
        // params
        propose_bond: u256,
        challenge_bond: u256,
        min_tip: u256,
        challenge_window_secs: u64,
        vote_window_secs: u64,
        jury_size: u64,
        juror_slash: u256,
        validator_bps: u64,
        platform_bps: u64,
        protocol_bps: u64,
        // proposals
        next_proposal_id: u64,
        proposals: Map<u64, Proposal>,
        cid_proposal_count: Map<felt252, u64>,
        cid_proposal_ids: Map<(felt252, u64), u64>,
        verified_by_cid: Map<felt252, u64>,
        withdrawable: Map<ContractAddress, u256>,
        // disputes
        disputes: Map<u64, Dispute>,
        jurors: Map<(u64, u64), ContractAddress>,
        votes: Map<(u64, ContractAddress), u8>,
        // staking
        min_stake: u256,
        unbonding_secs: u64,
        validator_count: u64,
        validators_by_index: Map<u64, ContractAddress>,
        validator_index: Map<ContractAddress, u64>, // 1-based; 0 = inactive
        stakes: Map<ContractAddress, StakeInfo>,
        total_staked: u256,
        acc_reward_per_share: u256,
        // platforms
        next_platform_id: u64,
        platforms: Map<u64, Platform>,
        max_platform_fee_bps: u64,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        AnchorProposed: AnchorProposed,
        AnchorChallenged: AnchorChallenged,
        JurySelected: JurySelected,
        JurorVoted: JurorVoted,
        AnchorVerified: AnchorVerified,
        AnchorRejected: AnchorRejected,
        Staked: Staked,
        Slashed: Slashed,
        Withdrawn: Withdrawn,
        PlatformRegistered: PlatformRegistered,
    }

    #[derive(Drop, starknet::Event)]
    pub struct AnchorProposed {
        #[key]
        pub proposal_id: u64,
        #[key]
        pub proposer: ContractAddress,
        pub cid: ByteArray,
        pub platform_id: u64,
        pub tip: u256,
        pub bond: u256,
        pub challenge_deadline: u64,
    }

    #[derive(Drop, starknet::Event)]
    pub struct AnchorChallenged {
        #[key]
        pub proposal_id: u64,
        #[key]
        pub challenger: ContractAddress,
        pub challenger_bond: u256,
    }

    #[derive(Drop, starknet::Event)]
    pub struct JurySelected {
        #[key]
        pub proposal_id: u64,
        pub vote_deadline: u64,
    }

    #[derive(Drop, starknet::Event)]
    pub struct JurorVoted {
        #[key]
        pub proposal_id: u64,
        #[key]
        pub juror: ContractAddress,
        pub uphold_proposal: bool,
    }

    #[derive(Drop, starknet::Event)]
    pub struct AnchorVerified {
        #[key]
        pub proposal_id: u64,
        #[key]
        pub proposer: ContractAddress,
        pub cid: ByteArray,
        pub validator_amount: u256,
        pub platform_amount: u256,
        pub protocol_amount: u256,
    }

    #[derive(Drop, starknet::Event)]
    pub struct AnchorRejected {
        #[key]
        pub proposal_id: u64,
        #[key]
        pub proposer: ContractAddress,
        pub cid: ByteArray,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Staked {
        #[key]
        pub validator: ContractAddress,
        pub amount: u256,
        pub total_stake: u256,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Slashed {
        #[key]
        pub validator: ContractAddress,
        pub amount: u256,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Withdrawn {
        #[key]
        pub to: ContractAddress,
        pub amount: u256,
    }

    #[derive(Drop, starknet::Event)]
    pub struct PlatformRegistered {
        #[key]
        pub platform_id: u64,
        pub owner: ContractAddress,
        pub treasury: ContractAddress,
        pub fee_bps: u64,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        token: ContractAddress,
        protocol_treasury: ContractAddress,
        platform_treasury: ContractAddress,
    ) {
        assert!(!token.is_zero(), "AnchorRegistry: zero token");
        assert!(!protocol_treasury.is_zero(), "AnchorRegistry: zero treasury");
        let admin = get_caller_address();
        self.admin.write(admin);
        self.protocol_treasury.write(protocol_treasury);
        self.token.write(token);
        // 18-decimal FOC defaults, mirroring the EVM contract.
        self.propose_bond.write(100_000000000000000000);
        self.challenge_bond.write(100_000000000000000000);
        self.min_tip.write(1_000000000000000000);
        self.challenge_window_secs.write(86_400);
        self.vote_window_secs.write(172_800);
        self.jury_size.write(5);
        self.juror_slash.write(50_000000000000000000);
        self.validator_bps.write(6_000);
        self.platform_bps.write(2_500);
        self.protocol_bps.write(1_500);
        self.next_proposal_id.write(1);
        self.min_stake.write(1000_000000000000000000);
        self.unbonding_secs.write(604_800);
        self.next_platform_id.write(1);
        self.max_platform_fee_bps.write(2_500);
        // FileOnChain itself is platform 1.
        self._register_platform(admin, platform_treasury, 2_500);
    }

    #[abi(embed_v0)]
    impl AnchorRegistryImpl of super::IAnchorRegistry<ContractState> {
        // -----------------------------------------------------------------
        // Propose / finalize
        // -----------------------------------------------------------------

        fn propose_anchor(
            ref self: ContractState,
            cid: ByteArray,
            content_hash: u256,
            uri: ByteArray,
            platform_id: u64,
            tip: u256,
        ) -> u64 {
            let cid_key = hash_cid(@cid);
            assert!(self.verified_by_cid.entry(cid_key).read() == 0, "AnchorRegistry: already verified");
            assert!(tip >= self.min_tip.read(), "AnchorRegistry: tip below minimum");
            let platform = self.platforms.entry(platform_id).read();
            assert!(platform.active, "AnchorRegistry: platform inactive");

            let proposer = get_caller_address();
            let bond = self.propose_bond.read();
            self._escrow_in(proposer, tip + bond);

            let proposal_id = self.next_proposal_id.read();
            self.next_proposal_id.write(proposal_id + 1);
            let now = get_block_timestamp();
            let challenge_deadline = now + self.challenge_window_secs.read();
            self
                .proposals
                .entry(proposal_id)
                .write(
                    Proposal {
                        cid: cid.clone(),
                        content_hash,
                        uri,
                        proposer,
                        platform_id,
                        tip,
                        bond,
                        proposed_at: now,
                        challenge_deadline,
                        verified_at: 0,
                        status: STATUS_PROPOSED,
                    },
                );
            let count = self.cid_proposal_count.entry(cid_key).read();
            self.cid_proposal_ids.entry((cid_key, count)).write(proposal_id);
            self.cid_proposal_count.entry(cid_key).write(count + 1);

            self
                .emit(
                    Event::AnchorProposed(
                        AnchorProposed {
                            proposal_id,
                            proposer,
                            cid,
                            platform_id,
                            tip,
                            bond,
                            challenge_deadline,
                        },
                    ),
                );
            proposal_id
        }

        fn finalize(ref self: ContractState, proposal_id: u64) {
            let proposal = self.proposals.entry(proposal_id).read();
            assert!(proposal.status == STATUS_PROPOSED, "AnchorRegistry: not proposed");
            assert!(
                get_block_timestamp() > proposal.challenge_deadline, "AnchorRegistry: window open",
            );
            self._settle_upheld_proposal(proposal_id);
        }

        // -----------------------------------------------------------------
        // Challenge / vote / resolve
        // -----------------------------------------------------------------

        fn challenge(ref self: ContractState, proposal_id: u64) {
            let mut proposal = self.proposals.entry(proposal_id).read();
            assert!(proposal.status == STATUS_PROPOSED, "AnchorRegistry: not proposed");
            assert!(
                get_block_timestamp() <= proposal.challenge_deadline,
                "AnchorRegistry: window closed",
            );
            let challenger = get_caller_address();

            // Enough eligible validators once proposer/challenger are excluded?
            let validator_count = self.validator_count.read();
            let mut excluded = 0;
            if self.validator_index.entry(proposal.proposer).read() != 0 {
                excluded += 1;
            }
            if challenger != proposal.proposer
                && self.validator_index.entry(challenger).read() != 0 {
                excluded += 1;
            }
            assert!(
                validator_count >= self.jury_size.read() + excluded,
                "AnchorRegistry: not enough validators",
            );

            let bond = self.challenge_bond.read();
            self._escrow_in(challenger, bond);

            proposal.status = STATUS_CHALLENGED;
            self.proposals.entry(proposal_id).write(proposal);
            self
                .disputes
                .entry(proposal_id)
                .write(
                    Dispute {
                        challenger,
                        challenger_bond: bond,
                        challenged_at_block: get_block_number(),
                        jury_drawn: false,
                        vote_deadline: 0,
                        votes_for: 0,
                        votes_against: 0,
                    },
                );
            self
                .emit(
                    Event::AnchorChallenged(
                        AnchorChallenged { proposal_id, challenger, challenger_bond: bond },
                    ),
                );
        }

        /// Second step of a challenge: draw the jury ≥DRAW_DELAY_BLOCKS after
        /// the challenge, seeded from a recent block hash (poseidon fallback
        /// when the hash window is unavailable — test environments). Voting
        /// opens here.
        fn draw_jury(ref self: ContractState, proposal_id: u64) {
            let proposal = self.proposals.entry(proposal_id).read();
            assert!(proposal.status == STATUS_CHALLENGED, "AnchorRegistry: not challenged");
            let mut dispute = self.disputes.entry(proposal_id).read();
            assert!(!dispute.jury_drawn, "AnchorRegistry: jury already drawn");
            let current_block = get_block_number();
            assert!(
                current_block >= dispute.challenged_at_block + DRAW_DELAY_BLOCKS,
                "AnchorRegistry: draw too early",
            );

            let seed_source = match get_block_hash_syscall(current_block - DRAW_DELAY_BLOCKS) {
                Result::Ok(hash) => hash,
                // Unavailable hash window (e.g. test environments): weaker
                // time-based seed. On live networks the hash is always in range.
                Result::Err(_) => poseidon_hash_span(
                    array![
                        get_block_timestamp().into(), current_block.into(), proposal_id.into(),
                    ]
                        .span(),
                ),
            };
            let mut seed = poseidon_hash_span(array![seed_source, proposal_id.into()].span());

            let validator_count = self.validator_count.read();
            let target = self.jury_size.read();
            let max_iterations = target * 16;
            let mut found: u64 = 0;
            let mut i: u64 = 0;
            while i < max_iterations && found < target {
                seed = poseidon_hash_span(array![seed, i.into()].span());
                let r: u256 = seed.into();
                let index: u64 = (r % validator_count.into()).try_into().unwrap();
                let candidate = self.validators_by_index.entry(index).read();
                i += 1;
                if candidate == proposal.proposer || candidate == dispute.challenger {
                    continue;
                }
                let mut duplicate = false;
                let mut j: u64 = 0;
                while j < found {
                    if self.jurors.entry((proposal_id, j)).read() == candidate {
                        duplicate = true;
                        break;
                    }
                    j += 1;
                };
                if duplicate {
                    continue;
                }
                self.jurors.entry((proposal_id, found)).write(candidate);
                found += 1;
            };
            assert!(found == target, "AnchorRegistry: jury draw failed");

            dispute.jury_drawn = true;
            dispute.vote_deadline = get_block_timestamp() + self.vote_window_secs.read();
            let vote_deadline = dispute.vote_deadline;
            self.disputes.entry(proposal_id).write(dispute);
            self.emit(Event::JurySelected(JurySelected { proposal_id, vote_deadline }));
        }

        fn cast_vote(ref self: ContractState, proposal_id: u64, uphold_proposal: bool) {
            let proposal = self.proposals.entry(proposal_id).read();
            assert!(proposal.status == STATUS_CHALLENGED, "AnchorRegistry: not challenged");
            let mut dispute = self.disputes.entry(proposal_id).read();
            assert!(dispute.jury_drawn, "AnchorRegistry: jury not drawn");
            assert!(get_block_timestamp() <= dispute.vote_deadline, "AnchorRegistry: voting closed");
            let juror = get_caller_address();
            assert!(self._is_juror(proposal_id, juror), "AnchorRegistry: not a juror");
            assert!(
                self.votes.entry((proposal_id, juror)).read() == VOTE_NONE,
                "AnchorRegistry: already voted",
            );
            if uphold_proposal {
                self.votes.entry((proposal_id, juror)).write(VOTE_UPHOLD);
                dispute.votes_for += 1;
            } else {
                self.votes.entry((proposal_id, juror)).write(VOTE_REJECT);
                dispute.votes_against += 1;
            }
            self.disputes.entry(proposal_id).write(dispute);
            self.emit(Event::JurorVoted(JurorVoted { proposal_id, juror, uphold_proposal }));
        }

        fn resolve_dispute(ref self: ContractState, proposal_id: u64) {
            let proposal = self.proposals.entry(proposal_id).read();
            assert!(proposal.status == STATUS_CHALLENGED, "AnchorRegistry: not challenged");
            let dispute = self.disputes.entry(proposal_id).read();
            assert!(dispute.jury_drawn, "AnchorRegistry: jury not drawn");
            assert!(get_block_timestamp() > dispute.vote_deadline, "AnchorRegistry: voting open");

            if dispute.votes_against > dispute.votes_for {
                self._resolve_challenger_wins(proposal_id, @dispute);
            } else if dispute.votes_for > dispute.votes_against {
                // Challenger loses the bond: half to the proposer, half to the
                // winning jurors (plus slashed stake from losing jurors).
                let to_proposer = dispute.challenger_bond / 2;
                self._credit(proposal.proposer, to_proposer);
                let mut juror_pool = dispute.challenger_bond - to_proposer;
                juror_pool += self._slash_losing_jurors(proposal_id, VOTE_REJECT);
                self._reward_winning_jurors(proposal_id, @dispute, VOTE_UPHOLD, juror_pool);
                self._settle_upheld_proposal(proposal_id);
            } else {
                // Tie / no votes: optimistic default, challenger refunded.
                self._credit(dispute.challenger, dispute.challenger_bond);
                self._settle_upheld_proposal(proposal_id);
            }
        }

        // -----------------------------------------------------------------
        // Withdrawals
        // -----------------------------------------------------------------

        fn withdraw(ref self: ContractState) {
            let to = get_caller_address();
            let amount = self.withdrawable.entry(to).read();
            assert!(amount > 0, "AnchorRegistry: nothing to withdraw");
            self.withdrawable.entry(to).write(0);
            self._escrow_out(to, amount);
            self.emit(Event::Withdrawn(Withdrawn { to, amount }));
        }

        // -----------------------------------------------------------------
        // Staking
        // -----------------------------------------------------------------

        fn stake(ref self: ContractState, amount: u256) {
            assert!(amount > 0, "AnchorRegistry: zero amount");
            let validator = get_caller_address();
            self._escrow_in(validator, amount);
            self._harvest(validator);
            let mut info = self.stakes.entry(validator).read();
            info.amount += amount;
            info.reward_debt = info.amount * self.acc_reward_per_share.read() / ACC_PRECISION;
            let new_amount = info.amount;
            self.stakes.entry(validator).write(info);
            self.total_staked.write(self.total_staked.read() + amount);
            self._sync_activation(validator, new_amount);
            self.emit(Event::Staked(Staked { validator, amount, total_stake: new_amount }));
        }

        fn request_unstake(ref self: ContractState, amount: u256) {
            let validator = get_caller_address();
            self._harvest(validator);
            let mut info = self.stakes.entry(validator).read();
            assert!(amount > 0 && amount <= info.amount, "AnchorRegistry: bad amount");
            info.amount -= amount;
            info.reward_debt = info.amount * self.acc_reward_per_share.read() / ACC_PRECISION;
            info.unbonding_amount += amount;
            info.unbonding_ends_at = get_block_timestamp() + self.unbonding_secs.read();
            let new_amount = info.amount;
            self.stakes.entry(validator).write(info);
            self.total_staked.write(self.total_staked.read() - amount);
            self._sync_activation(validator, new_amount);
        }

        fn withdraw_unstaked(ref self: ContractState) {
            let validator = get_caller_address();
            let mut info = self.stakes.entry(validator).read();
            assert!(info.unbonding_amount > 0, "AnchorRegistry: nothing unbonding");
            assert!(
                get_block_timestamp() >= info.unbonding_ends_at,
                "AnchorRegistry: still unbonding",
            );
            let amount = info.unbonding_amount;
            info.unbonding_amount = 0;
            self.stakes.entry(validator).write(info);
            self._escrow_out(validator, amount);
        }

        fn claim_rewards(ref self: ContractState) {
            let validator = get_caller_address();
            self._harvest(validator);
            let mut info = self.stakes.entry(validator).read();
            let amount = info.pending_rewards;
            assert!(amount > 0, "AnchorRegistry: nothing to claim");
            info.pending_rewards = 0;
            self.stakes.entry(validator).write(info);
            self._escrow_out(validator, amount);
        }

        // -----------------------------------------------------------------
        // Admin
        // -----------------------------------------------------------------

        fn set_admin(ref self: ContractState, new_admin: ContractAddress) {
            self._assert_admin();
            assert!(!new_admin.is_zero(), "AnchorRegistry: zero admin");
            self.admin.write(new_admin);
        }

        fn set_protocol_treasury(ref self: ContractState, treasury: ContractAddress) {
            self._assert_admin();
            assert!(!treasury.is_zero(), "AnchorRegistry: zero treasury");
            self.protocol_treasury.write(treasury);
        }

        fn set_bonds(ref self: ContractState, propose_bond: u256, challenge_bond: u256) {
            self._assert_admin();
            self.propose_bond.write(propose_bond);
            self.challenge_bond.write(challenge_bond);
        }

        fn set_min_tip(ref self: ContractState, min_tip: u256) {
            self._assert_admin();
            self.min_tip.write(min_tip);
        }

        fn set_windows(
            ref self: ContractState, challenge_window_secs: u64, vote_window_secs: u64,
        ) {
            self._assert_admin();
            assert!(
                challenge_window_secs > 0 && vote_window_secs > 0, "AnchorRegistry: zero window",
            );
            self.challenge_window_secs.write(challenge_window_secs);
            self.vote_window_secs.write(vote_window_secs);
        }

        fn set_jury_params(ref self: ContractState, jury_size: u64, juror_slash: u256) {
            self._assert_admin();
            assert!(jury_size >= 1 && jury_size % 2 == 1, "AnchorRegistry: jury size must be odd");
            self.jury_size.write(jury_size);
            self.juror_slash.write(juror_slash);
        }

        fn set_fee_split(
            ref self: ContractState, validator_bps: u64, platform_bps: u64, protocol_bps: u64,
        ) {
            self._assert_admin();
            assert!(
                validator_bps + platform_bps + protocol_bps == 10_000,
                "AnchorRegistry: split must sum to 100%",
            );
            self.validator_bps.write(validator_bps);
            self.platform_bps.write(platform_bps);
            self.protocol_bps.write(protocol_bps);
        }

        fn set_staking_params(ref self: ContractState, min_stake: u256, unbonding_secs: u64) {
            self._assert_admin();
            assert!(min_stake > 0, "AnchorRegistry: zero min stake");
            self.min_stake.write(min_stake);
            self.unbonding_secs.write(unbonding_secs);
        }

        fn register_platform(
            ref self: ContractState,
            owner: ContractAddress,
            treasury: ContractAddress,
            fee_bps: u64,
        ) -> u64 {
            self._assert_admin();
            self._register_platform(owner, treasury, fee_bps)
        }

        fn set_platform_active(ref self: ContractState, platform_id: u64, active: bool) {
            self._assert_admin();
            let mut platform = self.platforms.entry(platform_id).read();
            assert!(!platform.owner.is_zero(), "AnchorRegistry: unknown platform");
            platform.active = active;
            self.platforms.entry(platform_id).write(platform);
        }

        fn update_platform(
            ref self: ContractState, platform_id: u64, treasury: ContractAddress, fee_bps: u64,
        ) {
            let mut platform = self.platforms.entry(platform_id).read();
            assert!(
                platform.owner == get_caller_address(), "AnchorRegistry: not platform owner",
            );
            assert!(!treasury.is_zero(), "AnchorRegistry: zero treasury");
            assert!(fee_bps <= self.max_platform_fee_bps.read(), "AnchorRegistry: fee above cap");
            platform.treasury = treasury;
            platform.fee_bps = fee_bps;
            self.platforms.entry(platform_id).write(platform);
        }

        // -----------------------------------------------------------------
        // Views
        // -----------------------------------------------------------------

        fn get_proposal(self: @ContractState, proposal_id: u64) -> ProposalView {
            let p = self.proposals.entry(proposal_id).read();
            ProposalView {
                status: p.status,
                proposer: p.proposer,
                platform_id: p.platform_id,
                tip: p.tip,
                bond: p.bond,
                challenge_deadline: p.challenge_deadline,
                verified_at: p.verified_at,
            }
        }

        fn verified_proposal_id(self: @ContractState, cid: ByteArray) -> u64 {
            self.verified_by_cid.entry(hash_cid(@cid)).read()
        }

        fn proposal_count_for_cid(self: @ContractState, cid: ByteArray) -> u64 {
            self.cid_proposal_count.entry(hash_cid(@cid)).read()
        }

        fn proposal_id_for_cid(self: @ContractState, cid: ByteArray, index: u64) -> u64 {
            self.cid_proposal_ids.entry((hash_cid(@cid), index)).read()
        }

        fn withdrawable_of(self: @ContractState, who: ContractAddress) -> u256 {
            self.withdrawable.entry(who).read()
        }

        fn stake_of(self: @ContractState, who: ContractAddress) -> u256 {
            self.stakes.entry(who).read().amount
        }

        fn pending_rewards(self: @ContractState, who: ContractAddress) -> u256 {
            let info = self.stakes.entry(who).read();
            info.pending_rewards
                + info.amount * self.acc_reward_per_share.read() / ACC_PRECISION
                - info.reward_debt
        }

        fn active_validator_count(self: @ContractState) -> u64 {
            self.validator_count.read()
        }

        fn juror_at(self: @ContractState, proposal_id: u64, index: u64) -> ContractAddress {
            self.jurors.entry((proposal_id, index)).read()
        }

        fn get_vote(self: @ContractState, proposal_id: u64, juror: ContractAddress) -> u8 {
            self.votes.entry((proposal_id, juror)).read()
        }

        fn propose_params(self: @ContractState) -> (u256, u256, u256, u64) {
            (
                self.min_tip.read(),
                self.propose_bond.read(),
                self.challenge_bond.read(),
                self.challenge_window_secs.read(),
            )
        }
    }

    /// Poseidon hash of a CID string, the storage key for per-CID maps.
    fn hash_cid(cid: @ByteArray) -> felt252 {
        let mut serialized = array![];
        cid.serialize(ref serialized);
        poseidon_hash_span(serialized.span())
    }

    #[generate_trait]
    impl Internal of InternalTrait {
        fn _assert_admin(self: @ContractState) {
            assert!(get_caller_address() == self.admin.read(), "AnchorRegistry: not admin");
        }

        fn _escrow_in(ref self: ContractState, from: ContractAddress, amount: u256) {
            let ok = IERC20Dispatcher { contract_address: self.token.read() }
                .transfer_from(from, get_contract_address(), amount);
            assert!(ok, "AnchorRegistry: transfer failed");
        }

        fn _escrow_out(ref self: ContractState, to: ContractAddress, amount: u256) {
            let ok = IERC20Dispatcher { contract_address: self.token.read() }.transfer(to, amount);
            assert!(ok, "AnchorRegistry: transfer failed");
        }

        fn _credit(ref self: ContractState, to: ContractAddress, amount: u256) {
            if amount == 0 {
                return;
            }
            self.withdrawable.entry(to).write(self.withdrawable.entry(to).read() + amount);
        }

        fn _register_platform(
            ref self: ContractState,
            owner: ContractAddress,
            treasury: ContractAddress,
            fee_bps: u64,
        ) -> u64 {
            assert!(!owner.is_zero(), "AnchorRegistry: zero owner");
            assert!(!treasury.is_zero(), "AnchorRegistry: zero treasury");
            assert!(fee_bps <= self.max_platform_fee_bps.read(), "AnchorRegistry: fee above cap");
            let platform_id = self.next_platform_id.read();
            self.next_platform_id.write(platform_id + 1);
            self
                .platforms
                .entry(platform_id)
                .write(Platform { owner, treasury, fee_bps, active: true });
            self
                .emit(
                    Event::PlatformRegistered(
                        PlatformRegistered { platform_id, owner, treasury, fee_bps },
                    ),
                );
            platform_id
        }

        /// Verify (or race-reject) a proposal whose optimistic path prevailed.
        fn _settle_upheld_proposal(ref self: ContractState, proposal_id: u64) {
            let mut proposal = self.proposals.entry(proposal_id).read();
            let cid_key = hash_cid(@proposal.cid);
            if self.verified_by_cid.entry(cid_key).read() != 0 {
                // Lost the race: first verified wins; full refund.
                proposal.status = STATUS_REJECTED;
                let proposer = proposal.proposer;
                let refund = proposal.tip + proposal.bond;
                let cid = proposal.cid.clone();
                self.proposals.entry(proposal_id).write(proposal);
                self._credit(proposer, refund);
                self.emit(Event::AnchorRejected(AnchorRejected { proposal_id, proposer, cid }));
                return;
            }

            // Fee split; with no active stake the validator share rolls into
            // the protocol treasury.
            let tip = proposal.tip;
            let mut validator_amount = tip * self.validator_bps.read().into() / BPS_DENOM;
            let platform = self.platforms.entry(proposal.platform_id).read();
            let platform_bps: u256 = self.platform_bps.read().into();
            let platform_fee_bps: u256 = platform.fee_bps.into();
            let effective_bps = if platform_fee_bps < platform_bps {
                platform_fee_bps
            } else {
                platform_bps
            };
            let platform_amount = tip * effective_bps / BPS_DENOM;
            let mut protocol_amount = tip - validator_amount - platform_amount;
            if validator_amount > 0 {
                let total_staked = self.total_staked.read();
                if total_staked > 0 {
                    self
                        .acc_reward_per_share
                        .write(
                            self.acc_reward_per_share.read()
                                + validator_amount * ACC_PRECISION / total_staked,
                        );
                } else {
                    protocol_amount += validator_amount;
                    validator_amount = 0;
                }
            }
            self._credit(platform.treasury, platform_amount);
            self._credit(self.protocol_treasury.read(), protocol_amount);
            self._credit(proposal.proposer, proposal.bond);

            proposal.status = STATUS_VERIFIED;
            proposal.verified_at = get_block_timestamp();
            let proposer = proposal.proposer;
            let cid = proposal.cid.clone();
            self.verified_by_cid.entry(cid_key).write(proposal_id);
            self.proposals.entry(proposal_id).write(proposal);
            self
                .emit(
                    Event::AnchorVerified(
                        AnchorVerified {
                            proposal_id,
                            proposer,
                            cid,
                            validator_amount,
                            platform_amount,
                            protocol_amount,
                        },
                    ),
                );
        }

        fn _resolve_challenger_wins(
            ref self: ContractState, proposal_id: u64, dispute: @Dispute,
        ) {
            let mut proposal = self.proposals.entry(proposal_id).read();
            proposal.status = STATUS_REJECTED;
            let proposer = proposal.proposer;
            let tip = proposal.tip;
            let bond = proposal.bond;
            let cid = proposal.cid.clone();
            self.proposals.entry(proposal_id).write(proposal);

            // Verification never happened: the tip returns to the proposer;
            // the proposer bond is slashed half challenger / half winners.
            self._credit(proposer, tip);
            self._credit(*dispute.challenger, *dispute.challenger_bond);
            let to_challenger = bond / 2;
            self._credit(*dispute.challenger, to_challenger);
            let mut juror_pool = bond - to_challenger;
            juror_pool += self._slash_losing_jurors(proposal_id, VOTE_UPHOLD);
            self._reward_winning_jurors(proposal_id, dispute, VOTE_REJECT, juror_pool);
            self.emit(Event::AnchorRejected(AnchorRejected { proposal_id, proposer, cid }));
        }

        /// Slash every juror who voted `losing_vote`; returns the pool for the
        /// winners. Non-voters are unslashed (v1).
        fn _slash_losing_jurors(
            ref self: ContractState, proposal_id: u64, losing_vote: u8,
        ) -> u256 {
            let mut pool: u256 = 0;
            let jury_size = self.jury_size.read();
            let mut i: u64 = 0;
            while i < jury_size {
                let juror = self.jurors.entry((proposal_id, i)).read();
                if self.votes.entry((proposal_id, juror)).read() == losing_vote {
                    pool += self._slash_stake(juror);
                }
                i += 1;
            };
            pool
        }

        fn _slash_stake(ref self: ContractState, juror: ContractAddress) -> u256 {
            self._harvest(juror);
            let amount = self.juror_slash.read();
            let mut info = self.stakes.entry(juror).read();
            let from_active = if amount <= info.amount {
                amount
            } else {
                info.amount
            };
            let remainder = amount - from_active;
            let from_unbonding = if remainder <= info.unbonding_amount {
                remainder
            } else {
                info.unbonding_amount
            };
            info.amount -= from_active;
            info.unbonding_amount -= from_unbonding;
            info.reward_debt = info.amount * self.acc_reward_per_share.read() / ACC_PRECISION;
            let new_amount = info.amount;
            self.stakes.entry(juror).write(info);
            self.total_staked.write(self.total_staked.read() - from_active);
            self._sync_activation(juror, new_amount);
            let slashed = from_active + from_unbonding;
            if slashed > 0 {
                self.emit(Event::Slashed(Slashed { validator: juror, amount: slashed }));
            }
            slashed
        }

        /// Split `pool` evenly across jurors who voted `winning_vote`;
        /// rounding dust (or an empty winner set) goes to the protocol treasury.
        fn _reward_winning_jurors(
            ref self: ContractState,
            proposal_id: u64,
            dispute: @Dispute,
            winning_vote: u8,
            pool: u256,
        ) {
            if pool == 0 {
                return;
            }
            let winners: u256 = if winning_vote == VOTE_UPHOLD {
                (*dispute.votes_for).into()
            } else {
                (*dispute.votes_against).into()
            };
            if winners == 0 {
                let treasury = self.protocol_treasury.read();
                self._credit(treasury, pool);
                return;
            }
            let per_juror = pool / winners;
            let jury_size = self.jury_size.read();
            let mut i: u64 = 0;
            while i < jury_size {
                let juror = self.jurors.entry((proposal_id, i)).read();
                if self.votes.entry((proposal_id, juror)).read() == winning_vote {
                    self._credit(juror, per_juror);
                }
                i += 1;
            };
            let treasury = self.protocol_treasury.read();
            self._credit(treasury, pool - per_juror * winners);
        }

        fn _is_juror(self: @ContractState, proposal_id: u64, who: ContractAddress) -> bool {
            let jury_size = self.jury_size.read();
            let mut i: u64 = 0;
            let mut found = false;
            while i < jury_size {
                if self.jurors.entry((proposal_id, i)).read() == who {
                    found = true;
                    break;
                }
                i += 1;
            };
            found
        }

        fn _harvest(ref self: ContractState, validator: ContractAddress) {
            let mut info = self.stakes.entry(validator).read();
            if info.amount > 0 {
                let accumulated = info.amount * self.acc_reward_per_share.read() / ACC_PRECISION;
                info.pending_rewards += accumulated - info.reward_debt;
                info.reward_debt = accumulated;
                self.stakes.entry(validator).write(info);
            }
        }

        fn _sync_activation(
            ref self: ContractState, validator: ContractAddress, stake_amount: u256,
        ) {
            let index = self.validator_index.entry(validator).read(); // 1-based
            let should_be_active = stake_amount >= self.min_stake.read();
            if should_be_active && index == 0 {
                let count = self.validator_count.read();
                self.validators_by_index.entry(count).write(validator);
                self.validator_index.entry(validator).write(count + 1);
                self.validator_count.write(count + 1);
            } else if !should_be_active && index != 0 {
                let count = self.validator_count.read();
                let last_index = count - 1;
                if index - 1 != last_index {
                    let last = self.validators_by_index.entry(last_index).read();
                    self.validators_by_index.entry(index - 1).write(last);
                    self.validator_index.entry(last).write(index);
                }
                self.validator_count.write(last_index);
                self.validator_index.entry(validator).write(0);
            }
        }
    }
}
