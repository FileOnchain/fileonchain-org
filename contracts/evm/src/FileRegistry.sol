// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ValidatorStaking} from "./ValidatorStaking.sol";
import {PlatformRegistry} from "./PlatformRegistry.sol";

/// @title FileRegistry
/// @notice Optimistic anchor registry for file CIDs.
///
/// File-level anchors are paid *proposals*: the proposer escrows a FOCAT tip
/// plus a bond and names the originating platform. An unchallenged proposal
/// can be finalized by anyone after the challenge window — it becomes
/// Verified and the tip splits `validatorBps`/`platformBps`/`protocolBps`
/// (60/25/15 by default) between staked validators, the platform's treasury,
/// and the protocol treasury. A challenger may escrow a counter-bond during
/// the window, which draws a pseudo-random jury from the staked validator
/// set; the majority resolves the dispute, the losing side's bond is slashed
/// to the winners, and losing jurors are slashed via ValidatorStaking.
///
/// Proposals are keyed by id, not CID: anyone may propose any CID, and the
/// *first proposal to reach Verified* permanently owns the CID record
/// ("first verified wins"). Later proposals for a settled CID are refunded.
///
/// Chunk anchors stay free: `anchorChunk` only emits an event, all chunk
/// linkage lives in the off-chain anchor payload vocabulary.
///
/// v1 limitations (accepted, documented): jury randomness is
/// prevrandao/blockhash-based (sequencer-influenceable on some L2s), voting
/// is public (no commit-reveal), non-voting jurors are not slashed, and
/// stake-weighted juries/delegation are follow-ups.
contract FileRegistry is Ownable, ReentrancyGuard {
  using SafeERC20 for IERC20;

  // ---------------------------------------------------------------------
  // Types
  // ---------------------------------------------------------------------

  enum ProposalStatus {
    None,
    Proposed,
    Challenged,
    Verified,
    Rejected
  }

  struct Proposal {
    bytes32 cidHash; // keccak256 of the CID string
    bytes32 contentHash; // SHA-256 of the original file
    string uri; // optional IPFS / Arweave pointer
    address proposer;
    uint256 platformId; // originating integrator (PlatformRegistry id)
    uint256 tip; // escrowed FOCAT, split on verification
    uint256 bond; // escrowed FOCAT, returned on verification / slashed on rejection
    uint64 proposedAt;
    uint64 challengeDeadline;
    uint64 verifiedAt; // 0 until Verified
    ProposalStatus status;
  }

  struct Dispute {
    address challenger;
    uint256 challengerBond;
    uint64 voteDeadline;
    address[] jurors;
    mapping(address => uint8) votes; // 0 = none, 1 = uphold proposal, 2 = uphold challenge
    uint16 votesFor; // uphold proposal
    uint16 votesAgainst; // uphold challenge
  }

  // ---------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------

  event ChunkAnchored(
    bytes32 indexed cidHash, bytes32 indexed contentHash, address indexed submitter, string uri, uint64 timestamp
  );
  event AnchorProposed(
    uint256 indexed proposalId,
    bytes32 indexed cidHash,
    address indexed proposer,
    bytes32 contentHash,
    uint256 platformId,
    uint256 tip,
    uint256 bond,
    uint64 challengeDeadline
  );
  event AnchorChallenged(
    uint256 indexed proposalId, address indexed challenger, uint256 challengerBond, uint64 voteDeadline
  );
  event JurorsSelected(uint256 indexed proposalId, address[] jurors);
  event JurorVoted(uint256 indexed proposalId, address indexed juror, bool upholdProposal);
  event AnchorVerified(uint256 indexed proposalId, bytes32 indexed cidHash, address indexed proposer);
  event AnchorRejected(uint256 indexed proposalId, bytes32 indexed cidHash, address indexed proposer);
  event FeesDistributed(
    uint256 indexed proposalId, uint256 validatorAmount, uint256 platformAmount, uint256 protocolAmount
  );
  event BondReturned(uint256 indexed proposalId, address indexed to, uint256 amount);
  event BondSlashed(uint256 indexed proposalId, address indexed from, uint256 amount);
  event Withdrawn(address indexed to, uint256 amount);
  event FeeSplitUpdated(uint16 validatorBps, uint16 platformBps, uint16 protocolBps);
  event BondsUpdated(uint256 proposeBond, uint256 challengeBond);
  event MinTipUpdated(uint256 minTip);
  event WindowsUpdated(uint64 challengeWindowSeconds, uint64 voteWindowSeconds);
  event JuryParamsUpdated(uint8 jurySize, uint256 jurorSlashAmount);
  event ProtocolTreasuryUpdated(address indexed previous, address indexed next);

  // ---------------------------------------------------------------------
  // Storage
  // ---------------------------------------------------------------------

  IERC20 public immutable token;
  ValidatorStaking public immutable staking;
  PlatformRegistry public immutable platformRegistry;

  address public protocolTreasury;

  // Governance parameters
  uint256 public proposeBond;
  uint256 public challengeBond;
  uint256 public minTip;
  uint64 public challengeWindowSeconds;
  uint64 public voteWindowSeconds;
  uint8 public jurySize; // odd
  uint256 public jurorSlashAmount;
  uint16 public validatorBps;
  uint16 public platformBps;
  uint16 public protocolBps;

  uint256 public nextProposalId = 1;
  mapping(uint256 => Proposal) private _proposals;
  mapping(uint256 => Dispute) private _disputes;
  mapping(bytes32 => uint256[]) private _proposalsByCid;
  mapping(bytes32 => uint256) public verifiedProposalId; // first verified wins, immutable once set
  mapping(address => uint256) public withdrawable; // pull payments

  // ---------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------

  constructor(
    IERC20 _token,
    ValidatorStaking _staking,
    PlatformRegistry _platformRegistry,
    address _protocolTreasury
  ) Ownable(msg.sender) {
    require(address(_token) != address(0), "FileRegistry: zero token");
    require(address(_staking) != address(0), "FileRegistry: zero staking");
    require(address(_platformRegistry) != address(0), "FileRegistry: zero platform registry");
    require(_protocolTreasury != address(0), "FileRegistry: zero treasury");
    token = _token;
    staking = _staking;
    platformRegistry = _platformRegistry;
    protocolTreasury = _protocolTreasury;

    // Defaults; all governance-settable.
    proposeBond = 100e18;
    challengeBond = 100e18;
    minTip = 1e18;
    challengeWindowSeconds = 24 hours;
    voteWindowSeconds = 48 hours;
    jurySize = 5;
    jurorSlashAmount = 50e18;
    validatorBps = 6000;
    platformBps = 2500;
    protocolBps = 1500;
  }

  // ---------------------------------------------------------------------
  // Chunk anchoring (free, event-only)
  // ---------------------------------------------------------------------

  /// @notice Anchor a chunk CID. Emits an event and stores nothing — chunk
  /// ordering and linkage live in the anchor payload vocabulary off-chain.
  function anchorChunk(bytes32 cidHash, bytes32 contentHash, string calldata uri) external {
    emit ChunkAnchored(cidHash, contentHash, msg.sender, uri, uint64(block.timestamp));
  }

  // ---------------------------------------------------------------------
  // Propose / finalize
  // ---------------------------------------------------------------------

  /// @notice Propose a file-level anchor. Escrows `tip + proposeBond` FOCAT
  /// (requires prior approval). The proposal verifies after the challenge
  /// window unless challenged.
  function proposeAnchor(
    bytes32 cidHash,
    bytes32 contentHash,
    string calldata uri,
    uint256 platformId,
    uint256 tip
  ) external nonReentrant returns (uint256 proposalId) {
    require(verifiedProposalId[cidHash] == 0, "FileRegistry: already verified");
    require(tip >= minTip, "FileRegistry: tip below minimum");
    require(platformRegistry.isActivePlatform(platformId), "FileRegistry: platform inactive");

    token.safeTransferFrom(msg.sender, address(this), tip + proposeBond);

    proposalId = nextProposalId++;
    uint64 deadline = uint64(block.timestamp) + challengeWindowSeconds;
    _proposals[proposalId] = Proposal({
      cidHash: cidHash,
      contentHash: contentHash,
      uri: uri,
      proposer: msg.sender,
      platformId: platformId,
      tip: tip,
      bond: proposeBond,
      proposedAt: uint64(block.timestamp),
      challengeDeadline: deadline,
      verifiedAt: 0,
      status: ProposalStatus.Proposed
    });
    _proposalsByCid[cidHash].push(proposalId);

    emit AnchorProposed(proposalId, cidHash, msg.sender, contentHash, platformId, tip, proposeBond, deadline);
  }

  /// @notice Finalize an unchallenged proposal after its challenge window.
  /// Callable by anyone. If another proposal already verified the CID, the
  /// race loser is rejected with a full refund.
  function finalize(uint256 proposalId) external nonReentrant {
    Proposal storage p = _proposals[proposalId];
    require(p.status == ProposalStatus.Proposed, "FileRegistry: not proposed");
    require(block.timestamp > p.challengeDeadline, "FileRegistry: window open");

    if (verifiedProposalId[p.cidHash] != 0) {
      p.status = ProposalStatus.Rejected;
      withdrawable[p.proposer] += p.tip + p.bond;
      emit BondReturned(proposalId, p.proposer, p.bond);
      emit AnchorRejected(proposalId, p.cidHash, p.proposer);
      return;
    }
    _verify(proposalId, p);
  }

  // ---------------------------------------------------------------------
  // Challenge / vote / resolve
  // ---------------------------------------------------------------------

  /// @notice Challenge a live proposal within its window. Escrows the
  /// challenger bond and draws a pseudo-random jury from staked validators.
  function challenge(uint256 proposalId) external nonReentrant {
    Proposal storage p = _proposals[proposalId];
    require(p.status == ProposalStatus.Proposed, "FileRegistry: not proposed");
    require(block.timestamp <= p.challengeDeadline, "FileRegistry: window closed");

    uint256 validatorCount = staking.activeValidatorCount();
    uint256 excluded = 0;
    if (staking.isActiveValidator(p.proposer)) excluded++;
    if (msg.sender != p.proposer && staking.isActiveValidator(msg.sender)) excluded++;
    require(validatorCount >= uint256(jurySize) + excluded, "FileRegistry: not enough validators");

    token.safeTransferFrom(msg.sender, address(this), challengeBond);

    p.status = ProposalStatus.Challenged;
    Dispute storage d = _disputes[proposalId];
    d.challenger = msg.sender;
    d.challengerBond = challengeBond;
    d.voteDeadline = uint64(block.timestamp) + voteWindowSeconds;
    _drawJury(proposalId, d, p.proposer, msg.sender, validatorCount);

    emit AnchorChallenged(proposalId, msg.sender, challengeBond, d.voteDeadline);
    emit JurorsSelected(proposalId, d.jurors);
  }

  /// @notice Cast a jury vote. `upholdProposal = true` sides with the
  /// proposer, `false` with the challenger.
  function castVote(uint256 proposalId, bool upholdProposal) external {
    Proposal storage p = _proposals[proposalId];
    require(p.status == ProposalStatus.Challenged, "FileRegistry: not challenged");
    Dispute storage d = _disputes[proposalId];
    require(block.timestamp <= d.voteDeadline, "FileRegistry: voting closed");
    require(_isJuror(d, msg.sender), "FileRegistry: not a juror");
    require(d.votes[msg.sender] == 0, "FileRegistry: already voted");

    if (upholdProposal) {
      d.votes[msg.sender] = 1;
      d.votesFor++;
    } else {
      d.votes[msg.sender] = 2;
      d.votesAgainst++;
    }
    emit JurorVoted(proposalId, msg.sender, upholdProposal);
  }

  /// @notice Resolve a dispute after the vote deadline. Callable by anyone.
  /// Majority wins; ties and zero participation default to the optimistic
  /// outcome (proposal verified, challenger refunded, nobody slashed).
  function resolveDispute(uint256 proposalId) external nonReentrant {
    Proposal storage p = _proposals[proposalId];
    require(p.status == ProposalStatus.Challenged, "FileRegistry: not challenged");
    Dispute storage d = _disputes[proposalId];
    require(block.timestamp > d.voteDeadline, "FileRegistry: voting open");

    if (d.votesAgainst > d.votesFor) {
      _resolveChallengerWins(proposalId, p, d);
    } else if (d.votesFor > d.votesAgainst) {
      _resolveProposerWins(proposalId, p, d);
    } else {
      _resolveTie(proposalId, p, d);
    }
  }

  // ---------------------------------------------------------------------
  // Withdrawals
  // ---------------------------------------------------------------------

  /// @notice Pull any FOCAT credited to the caller (fee shares, refunds,
  /// bond returns, juror rewards).
  function withdraw() external nonReentrant {
    uint256 amount = withdrawable[msg.sender];
    require(amount > 0, "FileRegistry: nothing to withdraw");
    withdrawable[msg.sender] = 0;
    token.safeTransfer(msg.sender, amount);
    emit Withdrawn(msg.sender, amount);
  }

  // ---------------------------------------------------------------------
  // Views
  // ---------------------------------------------------------------------

  function getProposal(uint256 proposalId) external view returns (Proposal memory) {
    return _proposals[proposalId];
  }

  function getProposalIds(bytes32 cidHash) external view returns (uint256[] memory) {
    return _proposalsByCid[cidHash];
  }

  /// @notice The verified proposal for a CID, or an empty proposal when the
  /// CID has not been verified yet.
  function getVerifiedRecord(bytes32 cidHash) external view returns (Proposal memory) {
    return _proposals[verifiedProposalId[cidHash]];
  }

  function isCIDVerified(bytes32 cidHash) external view returns (bool) {
    return verifiedProposalId[cidHash] != 0;
  }

  function getJurors(uint256 proposalId) external view returns (address[] memory) {
    return _disputes[proposalId].jurors;
  }

  function getDispute(
    uint256 proposalId
  )
    external
    view
    returns (address challenger, uint256 challengerBond, uint64 voteDeadline, uint16 votesFor, uint16 votesAgainst)
  {
    Dispute storage d = _disputes[proposalId];
    return (d.challenger, d.challengerBond, d.voteDeadline, d.votesFor, d.votesAgainst);
  }

  /// @return 0 = no vote, 1 = uphold proposal, 2 = uphold challenge
  function getVote(uint256 proposalId, address juror) external view returns (uint8) {
    return _disputes[proposalId].votes[juror];
  }

  // ---------------------------------------------------------------------
  // Governance (owner = timelock)
  // ---------------------------------------------------------------------

  function setBonds(uint256 newProposeBond, uint256 newChallengeBond) external onlyOwner {
    proposeBond = newProposeBond;
    challengeBond = newChallengeBond;
    emit BondsUpdated(newProposeBond, newChallengeBond);
  }

  function setMinTip(uint256 newMinTip) external onlyOwner {
    minTip = newMinTip;
    emit MinTipUpdated(newMinTip);
  }

  function setWindows(uint64 newChallengeWindowSeconds, uint64 newVoteWindowSeconds) external onlyOwner {
    require(newChallengeWindowSeconds > 0 && newVoteWindowSeconds > 0, "FileRegistry: zero window");
    challengeWindowSeconds = newChallengeWindowSeconds;
    voteWindowSeconds = newVoteWindowSeconds;
    emit WindowsUpdated(newChallengeWindowSeconds, newVoteWindowSeconds);
  }

  function setJuryParams(uint8 newJurySize, uint256 newJurorSlashAmount) external onlyOwner {
    require(newJurySize >= 1 && newJurySize % 2 == 1, "FileRegistry: jury size must be odd");
    jurySize = newJurySize;
    jurorSlashAmount = newJurorSlashAmount;
    emit JuryParamsUpdated(newJurySize, newJurorSlashAmount);
  }

  function setFeeSplit(uint16 newValidatorBps, uint16 newPlatformBps, uint16 newProtocolBps) external onlyOwner {
    require(
      uint256(newValidatorBps) + newPlatformBps + newProtocolBps == 10_000, "FileRegistry: split must sum to 100%"
    );
    validatorBps = newValidatorBps;
    platformBps = newPlatformBps;
    protocolBps = newProtocolBps;
    emit FeeSplitUpdated(newValidatorBps, newPlatformBps, newProtocolBps);
  }

  function setProtocolTreasury(address newTreasury) external onlyOwner {
    require(newTreasury != address(0), "FileRegistry: zero treasury");
    emit ProtocolTreasuryUpdated(protocolTreasury, newTreasury);
    protocolTreasury = newTreasury;
  }

  // ---------------------------------------------------------------------
  // Internal — verification & fee distribution
  // ---------------------------------------------------------------------

  function _verify(uint256 proposalId, Proposal storage p) internal {
    p.status = ProposalStatus.Verified;
    p.verifiedAt = uint64(block.timestamp);
    verifiedProposalId[p.cidHash] = proposalId;
    _distributeFees(proposalId, p);
    withdrawable[p.proposer] += p.bond;
    emit BondReturned(proposalId, p.proposer, p.bond);
    emit AnchorVerified(proposalId, p.cidHash, p.proposer);
  }

  function _distributeFees(uint256 proposalId, Proposal storage p) internal {
    uint256 tip = p.tip;
    uint256 validatorShare = (tip * validatorBps) / 10_000;
    PlatformRegistry.Platform memory platform = platformRegistry.getPlatform(p.platformId);
    uint16 effectivePlatformBps = platform.feeBps < platformBps ? platform.feeBps : platformBps;
    uint256 platformShare = (tip * effectivePlatformBps) / 10_000;
    uint256 protocolShare = tip - validatorShare - platformShare;

    // With no active stake the validator share rolls into the protocol treasury.
    if (validatorShare > 0) {
      if (staking.totalStaked() > 0) {
        token.forceApprove(address(staking), validatorShare);
        staking.notifyReward(validatorShare);
      } else {
        protocolShare += validatorShare;
        validatorShare = 0;
      }
    }
    if (platformShare > 0) withdrawable[platform.treasury] += platformShare;
    if (protocolShare > 0) withdrawable[protocolTreasury] += protocolShare;

    emit FeesDistributed(proposalId, validatorShare, platformShare, protocolShare);
  }

  // ---------------------------------------------------------------------
  // Internal — dispute resolution
  // ---------------------------------------------------------------------

  function _resolveChallengerWins(uint256 proposalId, Proposal storage p, Dispute storage d) internal {
    p.status = ProposalStatus.Rejected;
    // Verification never happened: the tip goes back to the proposer.
    withdrawable[p.proposer] += p.tip;
    // Challenger bond returned; proposer bond slashed 50% challenger / 50% winning jurors.
    withdrawable[d.challenger] += d.challengerBond;
    uint256 toChallenger = p.bond / 2;
    withdrawable[d.challenger] += toChallenger;
    uint256 jurorPool = p.bond - toChallenger;
    emit BondSlashed(proposalId, p.proposer, p.bond);

    jurorPool += _slashLosingJurors(d, 1);
    _rewardWinningJurors(d, 2, jurorPool);

    emit AnchorRejected(proposalId, p.cidHash, p.proposer);
  }

  function _resolveProposerWins(uint256 proposalId, Proposal storage p, Dispute storage d) internal {
    // Challenger bond slashed 50% proposer / 50% winning jurors.
    uint256 toProposer = d.challengerBond / 2;
    withdrawable[p.proposer] += toProposer;
    uint256 jurorPool = d.challengerBond - toProposer;
    emit BondSlashed(proposalId, d.challenger, d.challengerBond);

    jurorPool += _slashLosingJurors(d, 2);
    _rewardWinningJurors(d, 1, jurorPool);

    _settleUpheldProposal(proposalId, p);
  }

  function _resolveTie(uint256 proposalId, Proposal storage p, Dispute storage d) internal {
    // Optimistic default: challenger refunded, nobody slashed.
    withdrawable[d.challenger] += d.challengerBond;
    _settleUpheldProposal(proposalId, p);
  }

  /// @dev A dispute upheld the proposal, but the CID may have been verified
  /// by a racing proposal while the dispute ran — first verified still wins.
  function _settleUpheldProposal(uint256 proposalId, Proposal storage p) internal {
    if (verifiedProposalId[p.cidHash] != 0) {
      p.status = ProposalStatus.Rejected;
      withdrawable[p.proposer] += p.tip + p.bond;
      emit BondReturned(proposalId, p.proposer, p.bond);
      emit AnchorRejected(proposalId, p.cidHash, p.proposer);
      return;
    }
    _verify(proposalId, p);
  }

  /// @dev Slash every juror who voted `losingVote`; returns the total actually
  /// slashed (added to the winning jurors' pool). Non-voters are not slashed (v1).
  function _slashLosingJurors(Dispute storage d, uint8 losingVote) internal returns (uint256 pool) {
    uint256 len = d.jurors.length;
    for (uint256 i = 0; i < len; i++) {
      address juror = d.jurors[i];
      if (d.votes[juror] == losingVote) {
        pool += staking.slash(juror, jurorSlashAmount, address(this));
      }
    }
  }

  /// @dev Split `pool` evenly across jurors who voted `winningVote`; rounding
  /// dust goes to the protocol treasury. With no winners the pool goes to the
  /// protocol treasury.
  function _rewardWinningJurors(Dispute storage d, uint8 winningVote, uint256 pool) internal {
    if (pool == 0) return;
    uint16 winners = winningVote == 1 ? d.votesFor : d.votesAgainst;
    if (winners == 0) {
      withdrawable[protocolTreasury] += pool;
      return;
    }
    uint256 perJuror = pool / winners;
    uint256 len = d.jurors.length;
    for (uint256 i = 0; i < len; i++) {
      address juror = d.jurors[i];
      if (d.votes[juror] == winningVote) {
        withdrawable[juror] += perJuror;
      }
    }
    uint256 dust = pool - perJuror * winners;
    if (dust > 0) withdrawable[protocolTreasury] += dust;
  }

  // ---------------------------------------------------------------------
  // Internal — jury selection
  // ---------------------------------------------------------------------

  /// @dev Rejection-sample `jurySize` distinct active validators, excluding
  /// the proposer and challenger. Seeded from prevrandao + parent blockhash —
  /// weak randomness accepted for v1 (see contract NatSpec).
  function _drawJury(
    uint256 proposalId,
    Dispute storage d,
    address proposer,
    address challenger,
    uint256 validatorCount
  ) internal {
    bytes32 seed =
      keccak256(abi.encode(block.prevrandao, blockhash(block.number - 1), proposalId, challenger));
    uint256 target = jurySize;
    uint256 maxIterations = target * 16;
    uint256 found = 0;
    for (uint256 i = 0; i < maxIterations && found < target; i++) {
      address candidate = staking.validatorAt(uint256(keccak256(abi.encode(seed, i))) % validatorCount);
      if (candidate == proposer || candidate == challenger) continue;
      bool duplicate = false;
      for (uint256 j = 0; j < found; j++) {
        if (d.jurors[j] == candidate) {
          duplicate = true;
          break;
        }
      }
      if (duplicate) continue;
      d.jurors.push(candidate);
      found++;
    }
    require(found == target, "FileRegistry: jury draw failed");
  }

  function _isJuror(Dispute storage d, address who) internal view returns (bool) {
    uint256 len = d.jurors.length;
    for (uint256 i = 0; i < len; i++) {
      if (d.jurors[i] == who) return true;
    }
    return false;
  }
}
