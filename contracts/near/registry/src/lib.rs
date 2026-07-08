//! FileOnChain anchoring contract for NEAR.
//!
//! Chunk anchors stay free: `anchor_cid` records one CID anchor as a
//! NEP-297 event log whose `payload` field carries the versioned
//! `fileonchain` JSON verbatim (see packages/utils/src/anchor.ts) — no
//! storage growth, indexers stream `EVENT_JSON` logs.
//!
//! File-level anchors are paid proposals (the optimistic propose/verify
//! protocol, ported from the EVM FileRegistry + ValidatorStaking +
//! PlatformRegistry suite). NEAR has no token allowances, so every paid
//! action arrives as a NEP-141 `ft_transfer_call` on the FOC token with a
//! JSON `msg` that `ft_on_transfer` routes:
//!
//!   {"action":"propose","cid":"bafy...","content_hash":"...","uri":"...",
//!    "platform_id":1,"tip":"1000000000000000000"}   (amount = tip + bond)
//!   {"action":"challenge","proposal_id":7}          (amount = challenge bond)
//!   {"action":"stake"}                              (amount = stake)
//!
//! A panic inside `ft_on_transfer` refunds the transfer via the token's
//! resolve step, so mis-priced calls are safe. Unchallenged proposals
//! `finalize` after the challenge window and the tip splits
//! validator/platform/protocol (60/25/15 default) into an internal
//! pull-payment ledger (`withdraw` / `claim_rewards` pay out with
//! `ft_transfer` promises — recipients must be storage-registered on the
//! token). Challenges draw a jury from the staked validator set seeded by
//! `env::random_seed()` (block-producer-influenceable — documented v1
//! limitation), majority resolves, losing bonds and losing jurors are
//! slashed to the winners, ties default optimistic.
//!
//! Proposals are keyed by id with first-verified-wins per CID. Parameters
//! are admin-gated — the admin executes EVM governance decisions (see
//! docs/governance.md). v1 simplifications, documented: proposal storage
//! is economically covered by the propose bond (no per-byte NEP-145
//! accounting), payout promises are fire-and-forget (an unregistered
//! token account forfeits the transfer), and non-voting jurors are not
//! slashed.

use near_sdk::borsh::BorshSerialize;
use near_sdk::json_types::U128;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::serde_json::json;
use near_sdk::store::LookupMap;
use near_sdk::{
    env, near, AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise,
};

const BPS_DENOM: u128 = 10_000;
const ACC_PRECISION: u128 = 1_000_000_000_000;
const ONE_FOC: u128 = 1_000_000_000_000_000_000; // 18 decimals

const STATUS_PROPOSED: u8 = 1;
const STATUS_CHALLENGED: u8 = 2;
const STATUS_VERIFIED: u8 = 3;
const STATUS_REJECTED: u8 = 4;

const VOTE_NONE: u8 = 0;
const VOTE_UPHOLD: u8 = 1;
const VOTE_REJECT: u8 = 2;

/// `amount * acc / ACC_PRECISION` without overflowing u128 for realistic
/// FOC magnitudes (split multiplication).
fn mul_acc(amount: u128, acc: u128) -> u128 {
    (amount / ACC_PRECISION) * acc + (amount % ACC_PRECISION) * acc / ACC_PRECISION
}

#[derive(BorshSerialize, BorshStorageKey)]
#[borsh(crate = "near_sdk::borsh")]
enum StorageKey {
    Proposals,
    ProposalIdsByCid,
    VerifiedByCid,
    Withdrawable,
    Stakes,
    Platforms,
    Votes,
}

#[near(serializers = [borsh])]
pub struct Proposal {
    cid: String,
    content_hash: Option<String>,
    uri: Option<String>,
    proposer: AccountId,
    platform_id: u64,
    tip: u128,
    bond: u128,
    proposed_at: u64,
    challenge_deadline: u64,
    verified_at: u64,
    status: u8,
    dispute: Option<Dispute>,
}

#[near(serializers = [borsh])]
pub struct Dispute {
    challenger: AccountId,
    challenger_bond: u128,
    vote_deadline: u64,
    jurors: Vec<AccountId>,
    votes_for: u64,
    votes_against: u64,
}

#[near(serializers = [borsh])]
#[derive(Default)]
pub struct StakeInfo {
    amount: u128,
    reward_debt: u128,
    pending_rewards: u128,
    unbonding_amount: u128,
    unbonding_ends_at: u64,
}

#[near(serializers = [borsh])]
pub struct Platform {
    owner: AccountId,
    treasury: AccountId,
    fee_bps: u64,
    active: bool,
}

/// JSON view of a proposal (status: 1 proposed, 2 challenged, 3 verified,
/// 4 rejected).
#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct ProposalView {
    pub status: u8,
    pub proposer: AccountId,
    pub platform_id: u64,
    pub tip: U128,
    pub bond: U128,
    pub challenge_deadline: u64,
    pub verified_at: u64,
}

#[derive(Deserialize)]
#[serde(tag = "action", rename_all = "snake_case", crate = "near_sdk::serde")]
enum TransferMsg {
    Propose {
        cid: String,
        content_hash: Option<String>,
        uri: Option<String>,
        platform_id: u64,
        tip: U128,
    },
    Challenge {
        proposal_id: u64,
    },
    Stake,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct FileRegistry {
    admin: AccountId,
    protocol_treasury: AccountId,
    token: AccountId,
    // params
    propose_bond: u128,
    challenge_bond: u128,
    min_tip: u128,
    challenge_window_secs: u64,
    vote_window_secs: u64,
    jury_size: u64,
    juror_slash: u128,
    validator_bps: u64,
    platform_bps: u64,
    protocol_bps: u64,
    // proposals
    next_proposal_id: u64,
    proposals: LookupMap<u64, Proposal>,
    proposal_ids_by_cid: LookupMap<String, Vec<u64>>,
    verified_by_cid: LookupMap<String, u64>,
    withdrawable: LookupMap<AccountId, u128>,
    // disputes
    votes: LookupMap<(u64, AccountId), u8>,
    // staking
    min_stake: u128,
    unbonding_secs: u64,
    validators: Vec<AccountId>,
    stakes: LookupMap<AccountId, StakeInfo>,
    total_staked: u128,
    acc_reward_per_share: u128,
    // platforms
    next_platform_id: u64,
    platforms: LookupMap<u64, Platform>,
    max_platform_fee_bps: u64,
}

fn now_secs() -> u64 {
    env::block_timestamp_ms() / 1_000
}

fn log_event(event: &str, data: near_sdk::serde_json::Value) {
    let event = json!({
        "standard": "fileonchain",
        "version": "1.0.0",
        "event": event,
        "data": [data],
    });
    env::log_str(&format!("EVENT_JSON:{event}"));
}

#[near]
impl FileRegistry {
    /// Deploy with the FOC token account and treasuries. The deployer
    /// becomes the admin and owner of platform 1 (FileOnChain).
    #[init]
    pub fn new(
        token: AccountId,
        protocol_treasury: AccountId,
        platform_treasury: AccountId,
    ) -> Self {
        let admin = env::predecessor_account_id();
        let mut contract = Self {
            admin: admin.clone(),
            protocol_treasury,
            token,
            propose_bond: 100 * ONE_FOC,
            challenge_bond: 100 * ONE_FOC,
            min_tip: ONE_FOC,
            challenge_window_secs: 86_400,
            vote_window_secs: 172_800,
            jury_size: 5,
            juror_slash: 50 * ONE_FOC,
            validator_bps: 6_000,
            platform_bps: 2_500,
            protocol_bps: 1_500,
            next_proposal_id: 1,
            proposals: LookupMap::new(StorageKey::Proposals),
            proposal_ids_by_cid: LookupMap::new(StorageKey::ProposalIdsByCid),
            verified_by_cid: LookupMap::new(StorageKey::VerifiedByCid),
            withdrawable: LookupMap::new(StorageKey::Withdrawable),
            votes: LookupMap::new(StorageKey::Votes),
            min_stake: 1_000 * ONE_FOC,
            unbonding_secs: 604_800,
            validators: Vec::new(),
            stakes: LookupMap::new(StorageKey::Stakes),
            total_staked: 0,
            acc_reward_per_share: 0,
            next_platform_id: 1,
            platforms: LookupMap::new(StorageKey::Platforms),
            max_platform_fee_bps: 2_500,
        };
        contract.internal_register_platform(admin.clone(), platform_treasury, 2_500);
        contract
    }

    // ---------------------------------------------------------------
    // Chunk anchoring (free, event-only) — unchanged legacy surface
    // ---------------------------------------------------------------

    /// Anchor one CID. Stateless: anchors live in the event log stream.
    /// Re-anchoring the same CID is allowed — the earliest event wins for
    /// indexers.
    pub fn anchor_cid(&mut self, cid: String, payload: String) {
        let event = json!({
            "standard": "fileonchain",
            "version": "1.0.0",
            "event": "cid_anchored",
            "data": [{
                "submitter": env::predecessor_account_id(),
                "cid": cid,
                "payload": payload,
            }]
        });
        env::log_str(&format!("EVENT_JSON:{event}"));
    }

    // ---------------------------------------------------------------
    // NEP-141 receiver — all paid actions arrive here
    // ---------------------------------------------------------------

    /// Handle `ft_transfer_call` from the FOC token. Panics refund the
    /// transfer through the token's resolve step; returning "0" keeps the
    /// full amount escrowed.
    pub fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> U128 {
        assert_eq!(
            env::predecessor_account_id(),
            self.token,
            "FileRegistry: only the FOC token may call ft_on_transfer"
        );
        let parsed: TransferMsg =
            near_sdk::serde_json::from_str(&msg).expect("FileRegistry: unparseable msg");
        match parsed {
            TransferMsg::Propose {
                cid,
                content_hash,
                uri,
                platform_id,
                tip,
            } => self.internal_propose(sender_id, amount.0, cid, content_hash, uri, platform_id, tip.0),
            TransferMsg::Challenge { proposal_id } => {
                self.internal_challenge(sender_id, amount.0, proposal_id)
            }
            TransferMsg::Stake => self.internal_stake(sender_id, amount.0),
        }
        U128(0)
    }

    // ---------------------------------------------------------------
    // Finalize / dispute (plain calls, no payment)
    // ---------------------------------------------------------------

    /// Finalize an unchallenged proposal after its window (anyone may call).
    /// A proposal that lost the CID race is rejected with a full refund.
    pub fn finalize(&mut self, proposal_id: u64) {
        let proposal = self
            .proposals
            .get(&proposal_id)
            .expect("FileRegistry: unknown proposal");
        assert_eq!(proposal.status, STATUS_PROPOSED, "FileRegistry: not proposed");
        assert!(
            now_secs() > proposal.challenge_deadline,
            "FileRegistry: window open"
        );
        self.settle_upheld_proposal(proposal_id);
    }

    /// Cast a jury vote; `uphold_proposal = true` sides with the proposer.
    pub fn cast_vote(&mut self, proposal_id: u64, uphold_proposal: bool) {
        let juror = env::predecessor_account_id();
        let proposal = self
            .proposals
            .get_mut(&proposal_id)
            .expect("FileRegistry: unknown proposal");
        assert_eq!(proposal.status, STATUS_CHALLENGED, "FileRegistry: not challenged");
        let dispute = proposal.dispute.as_mut().expect("FileRegistry: no dispute");
        assert!(now_secs() <= dispute.vote_deadline, "FileRegistry: voting closed");
        assert!(dispute.jurors.contains(&juror), "FileRegistry: not a juror");
        if uphold_proposal {
            dispute.votes_for += 1;
        } else {
            dispute.votes_against += 1;
        }
        let key = (proposal_id, juror.clone());
        assert_eq!(
            self.votes.get(&key).copied().unwrap_or(VOTE_NONE),
            VOTE_NONE,
            "FileRegistry: already voted"
        );
        self.votes
            .insert(key, if uphold_proposal { VOTE_UPHOLD } else { VOTE_REJECT });
        log_event(
            "juror_voted",
            json!({"proposal_id": proposal_id, "juror": juror, "uphold_proposal": uphold_proposal}),
        );
    }

    /// Resolve a dispute after the vote deadline (anyone may call).
    /// Majority wins; ties and zero participation default optimistic.
    pub fn resolve_dispute(&mut self, proposal_id: u64) {
        let proposal = self
            .proposals
            .get_mut(&proposal_id)
            .expect("FileRegistry: unknown proposal");
        assert_eq!(proposal.status, STATUS_CHALLENGED, "FileRegistry: not challenged");
        let dispute = proposal.dispute.take().expect("FileRegistry: no dispute");
        assert!(now_secs() > dispute.vote_deadline, "FileRegistry: voting open");

        if dispute.votes_against > dispute.votes_for {
            self.resolve_challenger_wins(proposal_id, &dispute);
        } else if dispute.votes_for > dispute.votes_against {
            let proposer = self.proposals.get(&proposal_id).unwrap().proposer.clone();
            let to_proposer = dispute.challenger_bond / 2;
            self.credit(&proposer, to_proposer);
            let mut juror_pool = dispute.challenger_bond - to_proposer;
            juror_pool += self.slash_losing_jurors(proposal_id, &dispute, VOTE_REJECT);
            self.reward_winning_jurors(proposal_id, &dispute, VOTE_UPHOLD, juror_pool);
            self.settle_upheld_proposal(proposal_id);
        } else {
            let challenger = dispute.challenger.clone();
            self.credit(&challenger, dispute.challenger_bond);
            self.settle_upheld_proposal(proposal_id);
        }
    }

    // ---------------------------------------------------------------
    // Payouts (pull payments; ft_transfer promises)
    // ---------------------------------------------------------------

    /// Pull any FOC credited to the caller (fees, refunds, juror rewards).
    /// The caller must be storage-registered on the FOC token.
    pub fn withdraw(&mut self) -> Promise {
        let to = env::predecessor_account_id();
        let amount = self.withdrawable.get(&to).copied().unwrap_or(0);
        assert!(amount > 0, "FileRegistry: nothing to withdraw");
        self.withdrawable.insert(to.clone(), 0);
        log_event("withdrawn", json!({"to": to, "amount": U128(amount)}));
        self.ft_payout(&to, amount)
    }

    /// Start (or extend) the unbonding cooldown for part of the stake.
    pub fn request_unstake(&mut self, amount: U128) {
        let validator = env::predecessor_account_id();
        self.harvest(&validator);
        let acc = self.acc_reward_per_share;
        let unbonding_secs = self.unbonding_secs;
        let info = self.stakes.get_mut(&validator).expect("FileRegistry: no stake");
        assert!(
            amount.0 > 0 && amount.0 <= info.amount,
            "FileRegistry: bad amount"
        );
        info.amount -= amount.0;
        info.reward_debt = mul_acc(info.amount, acc);
        info.unbonding_amount += amount.0;
        info.unbonding_ends_at = now_secs() + unbonding_secs;
        let new_amount = info.amount;
        self.total_staked -= amount.0;
        self.sync_activation(&validator, new_amount);
        log_event(
            "unstake_requested",
            json!({"validator": validator, "amount": amount}),
        );
    }

    /// Withdraw unbonded stake after the cooldown.
    pub fn withdraw_unstaked(&mut self) -> Promise {
        let validator = env::predecessor_account_id();
        let info = self
            .stakes
            .get_mut(&validator)
            .expect("FileRegistry: nothing unbonding");
        assert!(info.unbonding_amount > 0, "FileRegistry: nothing unbonding");
        assert!(
            now_secs() >= info.unbonding_ends_at,
            "FileRegistry: still unbonding"
        );
        let amount = info.unbonding_amount;
        info.unbonding_amount = 0;
        self.ft_payout(&validator, amount)
    }

    /// Claim accumulated validator tip rewards.
    pub fn claim_rewards(&mut self) -> Promise {
        let validator = env::predecessor_account_id();
        self.harvest(&validator);
        let info = self
            .stakes
            .get_mut(&validator)
            .expect("FileRegistry: nothing to claim");
        let amount = info.pending_rewards;
        assert!(amount > 0, "FileRegistry: nothing to claim");
        info.pending_rewards = 0;
        self.ft_payout(&validator, amount)
    }

    // ---------------------------------------------------------------
    // Admin (the EVM-governance executor; see docs/governance.md)
    // ---------------------------------------------------------------

    pub fn set_admin(&mut self, new_admin: AccountId) {
        self.assert_admin();
        self.admin = new_admin;
    }

    pub fn set_protocol_treasury(&mut self, treasury: AccountId) {
        self.assert_admin();
        self.protocol_treasury = treasury;
    }

    pub fn set_bonds(&mut self, propose_bond: U128, challenge_bond: U128) {
        self.assert_admin();
        self.propose_bond = propose_bond.0;
        self.challenge_bond = challenge_bond.0;
    }

    pub fn set_min_tip(&mut self, min_tip: U128) {
        self.assert_admin();
        self.min_tip = min_tip.0;
    }

    pub fn set_windows(&mut self, challenge_window_secs: u64, vote_window_secs: u64) {
        self.assert_admin();
        assert!(
            challenge_window_secs > 0 && vote_window_secs > 0,
            "FileRegistry: zero window"
        );
        self.challenge_window_secs = challenge_window_secs;
        self.vote_window_secs = vote_window_secs;
    }

    pub fn set_jury_params(&mut self, jury_size: u64, juror_slash: U128) {
        self.assert_admin();
        assert!(
            jury_size >= 1 && jury_size % 2 == 1,
            "FileRegistry: jury size must be odd"
        );
        self.jury_size = jury_size;
        self.juror_slash = juror_slash.0;
    }

    pub fn set_fee_split(&mut self, validator_bps: u64, platform_bps: u64, protocol_bps: u64) {
        self.assert_admin();
        assert_eq!(
            validator_bps + platform_bps + protocol_bps,
            10_000,
            "FileRegistry: split must sum to 100%"
        );
        self.validator_bps = validator_bps;
        self.platform_bps = platform_bps;
        self.protocol_bps = protocol_bps;
    }

    pub fn set_staking_params(&mut self, min_stake: U128, unbonding_secs: u64) {
        self.assert_admin();
        assert!(min_stake.0 > 0, "FileRegistry: zero min stake");
        self.min_stake = min_stake.0;
        self.unbonding_secs = unbonding_secs;
    }

    pub fn register_platform(&mut self, owner: AccountId, treasury: AccountId, fee_bps: u64) -> u64 {
        self.assert_admin();
        self.internal_register_platform(owner, treasury, fee_bps)
    }

    pub fn set_platform_active(&mut self, platform_id: u64, active: bool) {
        self.assert_admin();
        let platform = self
            .platforms
            .get_mut(&platform_id)
            .expect("FileRegistry: unknown platform");
        platform.active = active;
    }

    pub fn update_platform(&mut self, platform_id: u64, treasury: AccountId, fee_bps: u64) {
        assert!(
            fee_bps <= self.max_platform_fee_bps,
            "FileRegistry: fee above cap"
        );
        let caller = env::predecessor_account_id();
        let platform = self
            .platforms
            .get_mut(&platform_id)
            .expect("FileRegistry: unknown platform");
        assert_eq!(platform.owner, caller, "FileRegistry: not platform owner");
        platform.treasury = treasury;
        platform.fee_bps = fee_bps;
    }

    // ---------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------

    pub fn get_proposal(&self, proposal_id: u64) -> Option<ProposalView> {
        self.proposals.get(&proposal_id).map(|p| ProposalView {
            status: p.status,
            proposer: p.proposer.clone(),
            platform_id: p.platform_id,
            tip: U128(p.tip),
            bond: U128(p.bond),
            challenge_deadline: p.challenge_deadline,
            verified_at: p.verified_at,
        })
    }

    /// The verified proposal id for a CID; 0 when unverified.
    pub fn verified_proposal_id(&self, cid: String) -> u64 {
        self.verified_by_cid.get(&cid).copied().unwrap_or(0)
    }

    pub fn proposal_ids_for_cid(&self, cid: String) -> Vec<u64> {
        self.proposal_ids_by_cid.get(&cid).cloned().unwrap_or_default()
    }

    pub fn withdrawable_of(&self, account_id: AccountId) -> U128 {
        U128(self.withdrawable.get(&account_id).copied().unwrap_or(0))
    }

    pub fn stake_of(&self, account_id: AccountId) -> U128 {
        U128(self.stakes.get(&account_id).map(|s| s.amount).unwrap_or(0))
    }

    pub fn pending_rewards(&self, account_id: AccountId) -> U128 {
        U128(
            self.stakes
                .get(&account_id)
                .map(|s| s.pending_rewards + mul_acc(s.amount, self.acc_reward_per_share) - s.reward_debt)
                .unwrap_or(0),
        )
    }

    pub fn active_validator_count(&self) -> u64 {
        self.validators.len() as u64
    }

    pub fn jurors_of(&self, proposal_id: u64) -> Vec<AccountId> {
        self.proposals
            .get(&proposal_id)
            .and_then(|p| p.dispute.as_ref())
            .map(|d| d.jurors.clone())
            .unwrap_or_default()
    }

    pub fn get_vote(&self, proposal_id: u64, juror: AccountId) -> u8 {
        self.votes
            .get(&(proposal_id, juror))
            .copied()
            .unwrap_or(VOTE_NONE)
    }

    /// (min_tip, propose_bond, challenge_bond, challenge_window_secs)
    pub fn propose_params(&self) -> (U128, U128, U128, u64) {
        (
            U128(self.min_tip),
            U128(self.propose_bond),
            U128(self.challenge_bond),
            self.challenge_window_secs,
        )
    }
}

impl FileRegistry {
    fn assert_admin(&self) {
        assert_eq!(
            env::predecessor_account_id(),
            self.admin,
            "FileRegistry: not admin"
        );
    }

    fn ft_payout(&self, to: &AccountId, amount: u128) -> Promise {
        Promise::new(self.token.clone()).function_call(
            "ft_transfer".to_string(),
            json!({"receiver_id": to, "amount": U128(amount)})
                .to_string()
                .into_bytes(),
            NearToken::from_yoctonear(1),
            Gas::from_tgas(10),
        )
    }

    fn credit(&mut self, to: &AccountId, amount: u128) {
        if amount == 0 {
            return;
        }
        let balance = self.withdrawable.get(to).copied().unwrap_or(0);
        self.withdrawable.insert(to.clone(), balance + amount);
    }

    fn internal_register_platform(
        &mut self,
        owner: AccountId,
        treasury: AccountId,
        fee_bps: u64,
    ) -> u64 {
        assert!(
            fee_bps <= self.max_platform_fee_bps,
            "FileRegistry: fee above cap"
        );
        let platform_id = self.next_platform_id;
        self.next_platform_id += 1;
        log_event(
            "platform_registered",
            json!({"platform_id": platform_id, "owner": owner, "treasury": treasury, "fee_bps": fee_bps}),
        );
        self.platforms.insert(
            platform_id,
            Platform {
                owner,
                treasury,
                fee_bps,
                active: true,
            },
        );
        platform_id
    }

    fn internal_propose(
        &mut self,
        proposer: AccountId,
        amount: u128,
        cid: String,
        content_hash: Option<String>,
        uri: Option<String>,
        platform_id: u64,
        tip: u128,
    ) {
        assert!(
            self.verified_by_cid.get(&cid).is_none(),
            "FileRegistry: already verified"
        );
        assert!(tip >= self.min_tip, "FileRegistry: tip below minimum");
        let platform_active = self
            .platforms
            .get(&platform_id)
            .map(|p| p.active)
            .unwrap_or(false);
        assert!(platform_active, "FileRegistry: platform inactive");
        assert_eq!(
            amount,
            tip + self.propose_bond,
            "FileRegistry: amount must equal tip + propose bond"
        );

        let proposal_id = self.next_proposal_id;
        self.next_proposal_id += 1;
        let now = now_secs();
        let challenge_deadline = now + self.challenge_window_secs;
        self.proposals.insert(
            proposal_id,
            Proposal {
                cid: cid.clone(),
                content_hash,
                uri,
                proposer: proposer.clone(),
                platform_id,
                tip,
                bond: self.propose_bond,
                proposed_at: now,
                challenge_deadline,
                verified_at: 0,
                status: STATUS_PROPOSED,
                dispute: None,
            },
        );
        let mut ids = self.proposal_ids_by_cid.get(&cid).cloned().unwrap_or_default();
        ids.push(proposal_id);
        self.proposal_ids_by_cid.insert(cid.clone(), ids);
        log_event(
            "anchor_proposed",
            json!({
                "proposal_id": proposal_id,
                "cid": cid,
                "proposer": proposer,
                "platform_id": platform_id,
                "tip": U128(tip),
                "bond": U128(self.propose_bond),
                "challenge_deadline": challenge_deadline,
            }),
        );
    }

    fn internal_challenge(&mut self, challenger: AccountId, amount: u128, proposal_id: u64) {
        let (proposer, deadline, status) = {
            let proposal = self
                .proposals
                .get(&proposal_id)
                .expect("FileRegistry: unknown proposal");
            (
                proposal.proposer.clone(),
                proposal.challenge_deadline,
                proposal.status,
            )
        };
        assert_eq!(status, STATUS_PROPOSED, "FileRegistry: not proposed");
        assert!(now_secs() <= deadline, "FileRegistry: window closed");
        assert_eq!(
            amount, self.challenge_bond,
            "FileRegistry: amount must equal the challenge bond"
        );

        let validator_count = self.validators.len() as u64;
        let mut excluded = 0;
        if self.validators.contains(&proposer) {
            excluded += 1;
        }
        if challenger != proposer && self.validators.contains(&challenger) {
            excluded += 1;
        }
        assert!(
            validator_count >= self.jury_size + excluded,
            "FileRegistry: not enough validators"
        );

        let jurors = self.draw_jury(proposal_id, &proposer, &challenger);
        let vote_deadline = now_secs() + self.vote_window_secs;
        log_event(
            "anchor_challenged",
            json!({
                "proposal_id": proposal_id,
                "challenger": challenger,
                "challenger_bond": U128(amount),
                "vote_deadline": vote_deadline,
                "jurors": jurors,
            }),
        );
        let proposal = self.proposals.get_mut(&proposal_id).unwrap();
        proposal.status = STATUS_CHALLENGED;
        proposal.dispute = Some(Dispute {
            challenger,
            challenger_bond: amount,
            vote_deadline,
            jurors,
            votes_for: 0,
            votes_against: 0,
        });
    }

    /// Rejection-sample `jury_size` distinct active validators, excluding
    /// the proposer and challenger, seeded from `env::random_seed()`
    /// (block-producer-influenceable — documented v1 limitation).
    fn draw_jury(
        &self,
        proposal_id: u64,
        proposer: &AccountId,
        challenger: &AccountId,
    ) -> Vec<AccountId> {
        let mut seed = env::random_seed();
        seed.extend_from_slice(&proposal_id.to_le_bytes());
        let validator_count = self.validators.len() as u64;
        let target = self.jury_size as usize;
        let max_iterations = target * 16;
        let mut jurors: Vec<AccountId> = Vec::with_capacity(target);
        let mut i: u64 = 0;
        while (i as usize) < max_iterations && jurors.len() < target {
            let mut material = seed.clone();
            material.extend_from_slice(&i.to_le_bytes());
            let digest = env::sha256(&material);
            let value = u64::from_le_bytes(digest[..8].try_into().unwrap());
            let candidate = &self.validators[(value % validator_count) as usize];
            i += 1;
            if candidate == proposer || candidate == challenger || jurors.contains(candidate) {
                continue;
            }
            jurors.push(candidate.clone());
        }
        assert_eq!(jurors.len(), target, "FileRegistry: jury draw failed");
        jurors
    }

    fn internal_stake(&mut self, validator: AccountId, amount: u128) {
        assert!(amount > 0, "FileRegistry: zero amount");
        if self.stakes.get(&validator).is_none() {
            self.stakes.insert(validator.clone(), StakeInfo::default());
        }
        self.harvest(&validator);
        let acc = self.acc_reward_per_share;
        let info = self.stakes.get_mut(&validator).unwrap();
        info.amount += amount;
        info.reward_debt = mul_acc(info.amount, acc);
        let new_amount = info.amount;
        self.total_staked += amount;
        self.sync_activation(&validator, new_amount);
        log_event(
            "staked",
            json!({"validator": validator, "amount": U128(amount), "total_stake": U128(new_amount)}),
        );
    }

    fn harvest(&mut self, validator: &AccountId) {
        let acc = self.acc_reward_per_share;
        if let Some(info) = self.stakes.get_mut(validator) {
            if info.amount > 0 {
                let accumulated = mul_acc(info.amount, acc);
                info.pending_rewards += accumulated - info.reward_debt;
                info.reward_debt = accumulated;
            }
        }
    }

    fn sync_activation(&mut self, validator: &AccountId, stake_amount: u128) {
        let position = self.validators.iter().position(|v| v == validator);
        let should_be_active = stake_amount >= self.min_stake;
        match (should_be_active, position) {
            (true, None) => self.validators.push(validator.clone()),
            (false, Some(index)) => {
                self.validators.swap_remove(index);
            }
            _ => {}
        }
    }

    fn settle_upheld_proposal(&mut self, proposal_id: u64) {
        let (cid, proposer, tip, bond, platform_id) = {
            let p = self.proposals.get(&proposal_id).unwrap();
            (
                p.cid.clone(),
                p.proposer.clone(),
                p.tip,
                p.bond,
                p.platform_id,
            )
        };
        if self.verified_by_cid.get(&cid).is_some() {
            // Lost the race: first verified wins; full refund.
            self.proposals.get_mut(&proposal_id).unwrap().status = STATUS_REJECTED;
            self.credit(&proposer, tip + bond);
            log_event(
                "anchor_rejected",
                json!({"proposal_id": proposal_id, "cid": cid, "proposer": proposer}),
            );
            return;
        }

        // Fee split; with no active stake the validator share rolls into the
        // protocol treasury.
        let mut validator_amount = tip * self.validator_bps as u128 / BPS_DENOM;
        let (platform_treasury, platform_fee_bps) = {
            let platform = self.platforms.get(&platform_id).unwrap();
            (platform.treasury.clone(), platform.fee_bps)
        };
        let effective_bps = platform_fee_bps.min(self.platform_bps) as u128;
        let platform_amount = tip * effective_bps / BPS_DENOM;
        let mut protocol_amount = tip - validator_amount - platform_amount;
        if validator_amount > 0 {
            if self.total_staked > 0 {
                self.acc_reward_per_share += validator_amount * ACC_PRECISION / self.total_staked;
            } else {
                protocol_amount += validator_amount;
                validator_amount = 0;
            }
        }
        self.credit(&platform_treasury, platform_amount);
        let protocol_treasury = self.protocol_treasury.clone();
        self.credit(&protocol_treasury, protocol_amount);
        self.credit(&proposer, bond);

        self.verified_by_cid.insert(cid.clone(), proposal_id);
        let now = now_secs();
        let p = self.proposals.get_mut(&proposal_id).unwrap();
        p.status = STATUS_VERIFIED;
        p.verified_at = now;
        log_event(
            "anchor_verified",
            json!({
                "proposal_id": proposal_id,
                "cid": cid,
                "proposer": proposer,
                "validator_amount": U128(validator_amount),
                "platform_amount": U128(platform_amount),
                "protocol_amount": U128(protocol_amount),
            }),
        );
    }

    fn resolve_challenger_wins(&mut self, proposal_id: u64, dispute: &Dispute) {
        let (cid, proposer, tip, bond) = {
            let p = self.proposals.get_mut(&proposal_id).unwrap();
            p.status = STATUS_REJECTED;
            (p.cid.clone(), p.proposer.clone(), p.tip, p.bond)
        };
        // Verification never happened: the tip returns to the proposer; the
        // proposer bond is slashed half challenger / half winning jurors.
        self.credit(&proposer, tip);
        let challenger = dispute.challenger.clone();
        self.credit(&challenger, dispute.challenger_bond);
        let to_challenger = bond / 2;
        self.credit(&challenger, to_challenger);
        let mut juror_pool = bond - to_challenger;
        juror_pool += self.slash_losing_jurors(proposal_id, dispute, VOTE_UPHOLD);
        self.reward_winning_jurors(proposal_id, dispute, VOTE_REJECT, juror_pool);
        log_event(
            "anchor_rejected",
            json!({"proposal_id": proposal_id, "cid": cid, "proposer": proposer}),
        );
    }

    /// Slash every juror who voted `losing_vote`; the slashed stake (already
    /// escrowed) moves into the winners' pool. Non-voters unslashed (v1).
    fn slash_losing_jurors(&mut self, proposal_id: u64, dispute: &Dispute, losing_vote: u8) -> u128 {
        let mut pool = 0;
        for juror in &dispute.jurors {
            if self
                .votes
                .get(&(proposal_id, juror.clone()))
                .copied()
                .unwrap_or(VOTE_NONE)
                == losing_vote
            {
                pool += self.slash_stake(juror.clone());
            }
        }
        pool
    }

    fn slash_stake(&mut self, juror: AccountId) -> u128 {
        if self.stakes.get(&juror).is_none() {
            return 0;
        }
        self.harvest(&juror);
        let amount = self.juror_slash;
        let acc = self.acc_reward_per_share;
        let info = self.stakes.get_mut(&juror).unwrap();
        let from_active = amount.min(info.amount);
        let from_unbonding = (amount - from_active).min(info.unbonding_amount);
        info.amount -= from_active;
        info.unbonding_amount -= from_unbonding;
        info.reward_debt = mul_acc(info.amount, acc);
        let new_amount = info.amount;
        self.total_staked -= from_active;
        self.sync_activation(&juror, new_amount);
        let slashed = from_active + from_unbonding;
        if slashed > 0 {
            log_event("slashed", json!({"validator": juror, "amount": U128(slashed)}));
        }
        slashed
    }

    /// Split `pool` evenly across jurors who voted `winning_vote`; rounding
    /// dust (or an empty winner set) goes to the protocol treasury.
    fn reward_winning_jurors(
        &mut self,
        proposal_id: u64,
        dispute: &Dispute,
        winning_vote: u8,
        pool: u128,
    ) {
        if pool == 0 {
            return;
        }
        let winners = if winning_vote == VOTE_UPHOLD {
            dispute.votes_for
        } else {
            dispute.votes_against
        } as u128;
        let protocol_treasury = self.protocol_treasury.clone();
        if winners == 0 {
            self.credit(&protocol_treasury, pool);
            return;
        }
        let per_juror = pool / winners;
        for juror in dispute.jurors.clone() {
            if self
                .votes
                .get(&(proposal_id, juror.clone()))
                .copied()
                .unwrap_or(VOTE_NONE)
                == winning_vote
            {
                self.credit(&juror, per_juror);
            }
        }
        self.credit(&protocol_treasury, pool - per_juror * winners);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::serde_json::Value;
    use near_sdk::test_utils::{get_logs, VMContextBuilder};
    use near_sdk::testing_env;

    const CID: &str = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
    const PAYLOAD: &str = r#"{"p":"fileonchain","v":1,"op":"anchor","cid":"bafy..."}"#;
    const TIP: u128 = 100 * ONE_FOC;
    const BOND: u128 = 100 * ONE_FOC;
    const STAKE: u128 = 1_000 * ONE_FOC;
    const JUROR_SLASH: u128 = 50 * ONE_FOC;

    fn account(name: &str) -> AccountId {
        name.parse().unwrap()
    }

    fn set_context(predecessor: &str, timestamp_secs: u64) {
        let context = VMContextBuilder::new()
            .predecessor_account_id(account(predecessor))
            .block_timestamp(timestamp_secs * 1_000_000_000)
            .random_seed([7u8; 32])
            .build();
        testing_env!(context);
    }

    /// Registry deployed by admin.near with six staked validators. The FOC
    /// escrow itself lives on the token contract; these tests exercise the
    /// registry's internal ledgers.
    fn setup() -> FileRegistry {
        set_context("admin.near", 0);
        let mut contract = FileRegistry::new(
            account("foc.near"),
            account("treasury.near"),
            account("platform-treasury.near"),
        );
        for i in 0..6 {
            set_context("foc.near", 0);
            contract.ft_on_transfer(
                account(&format!("validator{i}.near")),
                U128(STAKE),
                r#"{"action":"stake"}"#.to_string(),
            );
        }
        contract
    }

    fn propose(contract: &mut FileRegistry, proposer: &str, at_secs: u64) -> u64 {
        set_context("foc.near", at_secs);
        contract.ft_on_transfer(
            account(proposer),
            U128(TIP + BOND),
            json!({
                "action": "propose",
                "cid": CID,
                "content_hash": "c0ffee",
                "uri": "ipfs://bafy.../file",
                "platform_id": 1,
                "tip": U128(TIP),
            })
            .to_string(),
        );
        contract.next_proposal_id - 1
    }

    fn challenge(contract: &mut FileRegistry, challenger: &str, proposal_id: u64, at_secs: u64) {
        set_context("foc.near", at_secs);
        contract.ft_on_transfer(
            account(challenger),
            U128(BOND),
            json!({"action": "challenge", "proposal_id": proposal_id}).to_string(),
        );
    }

    fn vote_split(
        contract: &mut FileRegistry,
        proposal_id: u64,
        upholds: u64,
        rejects: u64,
        at_secs: u64,
    ) -> Vec<AccountId> {
        let jurors = contract.jurors_of(proposal_id);
        for (i, juror) in jurors.iter().enumerate().take((upholds + rejects) as usize) {
            set_context(juror.as_str(), at_secs);
            contract.cast_vote(proposal_id, (i as u64) < upholds);
        }
        jurors
    }

    fn parse_event(log: &str) -> Value {
        let json = log.strip_prefix("EVENT_JSON:").expect("NEP-297 prefix");
        near_sdk::serde_json::from_str(json).expect("valid event JSON")
    }

    // ------------------------------------------------------------------
    // Legacy chunk anchoring (unchanged surface)
    // ------------------------------------------------------------------

    #[test]
    fn anchor_logs_nep297_event() {
        let mut contract = setup();
        set_context("alice.near", 0);
        contract.anchor_cid(CID.to_string(), PAYLOAD.to_string());

        let logs = get_logs();
        assert_eq!(logs.len(), 1);
        let event = parse_event(&logs[0]);
        assert_eq!(event["standard"], "fileonchain");
        assert_eq!(event["event"], "cid_anchored");
        let data = &event["data"][0];
        assert_eq!(data["submitter"], "alice.near");
        assert_eq!(data["cid"], CID);
        assert_eq!(data["payload"], PAYLOAD, "payload must be carried verbatim");
    }

    #[test]
    fn reanchoring_same_cid_is_allowed() {
        let mut contract = setup();
        set_context("alice.near", 0);
        contract.anchor_cid(CID.to_string(), PAYLOAD.to_string());
        contract.anchor_cid(CID.to_string(), r#"{"v":1,"op":"anchor","second":true}"#.to_string());
        assert_eq!(get_logs().len(), 2);
    }

    // ------------------------------------------------------------------
    // Propose / finalize
    // ------------------------------------------------------------------

    #[test]
    fn propose_stores_and_finalize_splits_fees() {
        let mut contract = setup();
        let id = propose(&mut contract, "alice.near", 0);

        let view = contract.get_proposal(id).unwrap();
        assert_eq!(view.status, STATUS_PROPOSED);
        assert_eq!(view.proposer, account("alice.near"));
        assert_eq!(view.tip.0, TIP);
        assert_eq!(contract.proposal_ids_for_cid(CID.to_string()), vec![id]);

        set_context("anyone.near", 86_401);
        contract.finalize(id);

        assert_eq!(contract.get_proposal(id).unwrap().status, STATUS_VERIFIED);
        assert_eq!(contract.verified_proposal_id(CID.to_string()), id);
        // 25% platform / 15% protocol / bond back to the proposer.
        assert_eq!(
            contract.withdrawable_of(account("platform-treasury.near")).0,
            25 * ONE_FOC
        );
        assert_eq!(contract.withdrawable_of(account("treasury.near")).0, 15 * ONE_FOC);
        assert_eq!(contract.withdrawable_of(account("alice.near")).0, BOND);
        // 60% across six equal validators = 10 FOC each.
        assert_eq!(contract.pending_rewards(account("validator0.near")).0, 10 * ONE_FOC);
    }

    #[test]
    #[should_panic(expected = "FileRegistry: tip below minimum")]
    fn propose_rejects_low_tip() {
        let mut contract = setup();
        set_context("foc.near", 0);
        contract.ft_on_transfer(
            account("alice.near"),
            U128(BOND + 1),
            json!({"action": "propose", "cid": CID, "platform_id": 1, "tip": U128(1)}).to_string(),
        );
    }

    #[test]
    #[should_panic(expected = "FileRegistry: amount must equal tip + propose bond")]
    fn propose_rejects_wrong_amount() {
        let mut contract = setup();
        set_context("foc.near", 0);
        contract.ft_on_transfer(
            account("alice.near"),
            U128(TIP), // missing the bond
            json!({"action": "propose", "cid": CID, "platform_id": 1, "tip": U128(TIP)}).to_string(),
        );
    }

    #[test]
    #[should_panic(expected = "only the FOC token may call ft_on_transfer")]
    fn ft_on_transfer_rejects_other_tokens() {
        let mut contract = setup();
        set_context("evil-token.near", 0);
        contract.ft_on_transfer(account("alice.near"), U128(STAKE), r#"{"action":"stake"}"#.into());
    }

    #[test]
    #[should_panic(expected = "FileRegistry: window open")]
    fn finalize_rejects_open_window() {
        let mut contract = setup();
        let id = propose(&mut contract, "alice.near", 0);
        set_context("anyone.near", 10);
        contract.finalize(id);
    }

    #[test]
    #[should_panic(expected = "FileRegistry: already verified")]
    fn propose_rejects_verified_cid() {
        let mut contract = setup();
        let id = propose(&mut contract, "alice.near", 0);
        set_context("anyone.near", 86_401);
        contract.finalize(id);
        propose(&mut contract, "bob.near", 86_402);
    }

    #[test]
    fn race_loser_refunded() {
        let mut contract = setup();
        let first = propose(&mut contract, "alice.near", 0);
        let second = propose(&mut contract, "bob.near", 1);
        set_context("anyone.near", 86_402);
        contract.finalize(first);
        contract.finalize(second);
        assert_eq!(contract.get_proposal(second).unwrap().status, STATUS_REJECTED);
        assert_eq!(contract.verified_proposal_id(CID.to_string()), first);
        assert_eq!(contract.withdrawable_of(account("bob.near")).0, TIP + BOND);
    }

    // ------------------------------------------------------------------
    // Disputes
    // ------------------------------------------------------------------

    #[test]
    fn challenge_draws_distinct_jury() {
        let mut contract = setup();
        let id = propose(&mut contract, "alice.near", 0);
        challenge(&mut contract, "bob.near", id, 1);

        assert_eq!(contract.get_proposal(id).unwrap().status, STATUS_CHALLENGED);
        let jurors = contract.jurors_of(id);
        assert_eq!(jurors.len(), 5);
        for (i, juror) in jurors.iter().enumerate() {
            assert_ne!(juror, &account("alice.near"));
            assert_ne!(juror, &account("bob.near"));
            for other in &jurors[i + 1..] {
                assert_ne!(juror, other);
            }
        }
    }

    #[test]
    #[should_panic(expected = "FileRegistry: window closed")]
    fn challenge_rejects_closed_window() {
        let mut contract = setup();
        let id = propose(&mut contract, "alice.near", 0);
        challenge(&mut contract, "bob.near", id, 86_401);
    }

    #[test]
    #[should_panic(expected = "FileRegistry: not enough validators")]
    fn challenge_rejects_thin_validator_set() {
        let mut contract = setup();
        set_context("validator0.near", 0);
        contract.request_unstake(U128(STAKE));
        set_context("validator1.near", 0);
        contract.request_unstake(U128(STAKE));
        let id = propose(&mut contract, "alice.near", 0);
        challenge(&mut contract, "bob.near", id, 1);
    }

    #[test]
    fn challenger_wins_slashes_and_pays() {
        let mut contract = setup();
        let id = propose(&mut contract, "alice.near", 0);
        challenge(&mut contract, "bob.near", id, 1);
        let jurors = vote_split(&mut contract, id, 2, 3, 2); // challenger wins
        set_context("anyone.near", 1 + 172_801);
        contract.resolve_dispute(id);

        assert_eq!(contract.get_proposal(id).unwrap().status, STATUS_REJECTED);
        assert_eq!(contract.verified_proposal_id(CID.to_string()), 0);
        // Proposer: tip refunded, bond slashed.
        assert_eq!(contract.withdrawable_of(account("alice.near")).0, TIP);
        // Challenger: own bond back + half the proposer bond.
        assert_eq!(contract.withdrawable_of(account("bob.near")).0, BOND + BOND / 2);
        // Losing jurors slashed; winners split bond/2 + slashes.
        assert_eq!(contract.stake_of(jurors[0].clone()).0, STAKE - JUROR_SLASH);
        assert_eq!(contract.stake_of(jurors[1].clone()).0, STAKE - JUROR_SLASH);
        let per_winner = (BOND / 2 + 2 * JUROR_SLASH) / 3;
        assert_eq!(contract.withdrawable_of(jurors[2].clone()).0, per_winner);

        // The CID is free again — a corrected proposal is allowed.
        propose(&mut contract, "carol.near", 1 + 172_802);
    }

    #[test]
    fn proposer_wins_verifies_and_slashes_challenger() {
        let mut contract = setup();
        let id = propose(&mut contract, "alice.near", 0);
        challenge(&mut contract, "bob.near", id, 1);
        let jurors = vote_split(&mut contract, id, 3, 2, 2); // proposer wins
        set_context("anyone.near", 1 + 172_801);
        contract.resolve_dispute(id);

        assert_eq!(contract.get_proposal(id).unwrap().status, STATUS_VERIFIED);
        assert_eq!(contract.verified_proposal_id(CID.to_string()), id);
        assert_eq!(
            contract.withdrawable_of(account("alice.near")).0,
            BOND + BOND / 2
        );
        assert_eq!(contract.withdrawable_of(account("bob.near")).0, 0);
        assert_eq!(contract.stake_of(jurors[3].clone()).0, STAKE - JUROR_SLASH);
        assert_eq!(contract.stake_of(jurors[4].clone()).0, STAKE - JUROR_SLASH);
    }

    #[test]
    fn tie_defaults_optimistic() {
        let mut contract = setup();
        let id = propose(&mut contract, "alice.near", 0);
        challenge(&mut contract, "bob.near", id, 1);
        let jurors = vote_split(&mut contract, id, 1, 1, 2);
        set_context("anyone.near", 1 + 172_801);
        contract.resolve_dispute(id);

        assert_eq!(contract.get_proposal(id).unwrap().status, STATUS_VERIFIED);
        assert_eq!(contract.withdrawable_of(account("bob.near")).0, BOND);
        for juror in &jurors {
            assert_eq!(contract.stake_of(juror.clone()).0, STAKE); // nobody slashed
        }
    }

    #[test]
    #[should_panic(expected = "FileRegistry: not a juror")]
    fn vote_rejects_non_juror() {
        let mut contract = setup();
        let id = propose(&mut contract, "alice.near", 0);
        challenge(&mut contract, "bob.near", id, 1);
        set_context("alice.near", 2);
        contract.cast_vote(id, true);
    }

    #[test]
    #[should_panic(expected = "FileRegistry: already voted")]
    fn vote_rejects_double_vote() {
        let mut contract = setup();
        let id = propose(&mut contract, "alice.near", 0);
        challenge(&mut contract, "bob.near", id, 1);
        let juror = contract.jurors_of(id)[0].clone();
        set_context(juror.as_str(), 2);
        contract.cast_vote(id, true);
        contract.cast_vote(id, false);
    }

    #[test]
    #[should_panic(expected = "FileRegistry: voting open")]
    fn resolve_rejects_open_voting() {
        let mut contract = setup();
        let id = propose(&mut contract, "alice.near", 0);
        challenge(&mut contract, "bob.near", id, 1);
        set_context("anyone.near", 2);
        contract.resolve_dispute(id);
    }

    // ------------------------------------------------------------------
    // Staking
    // ------------------------------------------------------------------

    #[test]
    fn staking_lifecycle() {
        let mut contract = setup();
        assert_eq!(contract.active_validator_count(), 6);

        // Below-min stays inactive; top-up activates.
        set_context("foc.near", 0);
        contract.ft_on_transfer(account("dave.near"), U128(STAKE - 1), r#"{"action":"stake"}"#.into());
        assert_eq!(contract.active_validator_count(), 6);
        set_context("foc.near", 0);
        contract.ft_on_transfer(account("dave.near"), U128(1), r#"{"action":"stake"}"#.into());
        assert_eq!(contract.active_validator_count(), 7);

        // Unstaking below the minimum deactivates; cooldown gates withdrawal.
        set_context("dave.near", 0);
        contract.request_unstake(U128(STAKE));
        assert_eq!(contract.active_validator_count(), 6);
        set_context("dave.near", 604_800);
        let _promise = contract.withdraw_unstaked(); // ft_transfer promise, not executed in unit tests
        assert_eq!(contract.stake_of(account("dave.near")).0, 0);
    }

    #[test]
    #[should_panic(expected = "FileRegistry: still unbonding")]
    fn unstake_cooldown_enforced() {
        let mut contract = setup();
        set_context("validator0.near", 0);
        contract.request_unstake(U128(STAKE));
        let _promise = contract.withdraw_unstaked();
    }

    #[test]
    fn rewards_are_pro_rata() {
        let mut contract = setup();
        // Double one validator's stake: 7000 total, 2000 vs 1000 each.
        set_context("foc.near", 0);
        contract.ft_on_transfer(account("validator0.near"), U128(STAKE), r#"{"action":"stake"}"#.into());

        let id = propose(&mut contract, "alice.near", 0);
        set_context("anyone.near", 86_401);
        contract.finalize(id);

        let heavy = contract.pending_rewards(account("validator0.near")).0;
        let light = contract.pending_rewards(account("validator1.near")).0;
        assert_eq!(heavy, 2 * light);
    }

    // ------------------------------------------------------------------
    // Admin
    // ------------------------------------------------------------------

    #[test]
    fn admin_updates_params_and_platforms() {
        let mut contract = setup();
        set_context("admin.near", 0);
        contract.set_fee_split(7_000, 2_000, 1_000);
        contract.set_bonds(U128(1), U128(2));
        contract.set_min_tip(U128(1));
        contract.set_windows(3_600, 7_200);
        contract.set_jury_params(3, U128(1));
        contract.set_staking_params(U128(1), 1);
        let platform_id =
            contract.register_platform(account("food.near"), account("food.near"), 1_000);
        assert_eq!(platform_id, 2);
        contract.set_platform_active(platform_id, false);
        // The platform owner rotates treasury/fee themselves.
        set_context("food.near", 0);
        contract.update_platform(platform_id, account("beef.near"), 500);
    }

    #[test]
    #[should_panic(expected = "FileRegistry: not admin")]
    fn non_admin_cannot_set_params() {
        let mut contract = setup();
        set_context("alice.near", 0);
        contract.set_fee_split(7_000, 2_000, 1_000);
    }

    #[test]
    #[should_panic(expected = "FileRegistry: split must sum to 100%")]
    fn fee_split_must_sum() {
        let mut contract = setup();
        set_context("admin.near", 0);
        contract.set_fee_split(6_000, 2_500, 1_000);
    }

    #[test]
    fn withdraw_zeroes_ledger() {
        let mut contract = setup();
        let id = propose(&mut contract, "alice.near", 0);
        set_context("anyone.near", 86_401);
        contract.finalize(id);
        set_context("alice.near", 86_402);
        let _promise = contract.withdraw(); // ft_transfer promise, not executed in unit tests
        assert_eq!(contract.withdrawable_of(account("alice.near")).0, 0);
    }
}
