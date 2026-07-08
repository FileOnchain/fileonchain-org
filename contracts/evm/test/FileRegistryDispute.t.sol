// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./ProtocolBase.t.sol";

contract FileRegistryDisputeTest is ProtocolBase {
  address internal carol = makeAddr("carol");

  function setUp() public override {
    super.setUp();
    vm.prevrandao(bytes32(uint256(42)));
    token.transfer(carol, 10_000e18);
    vm.prank(carol);
    token.approve(address(registry), type(uint256).max);
  }

  function challengeDefault(uint256 proposalId) internal {
    vm.prank(bob);
    registry.challenge(proposalId);
  }

  /// @dev Cast `upholds` votes for the proposal and `rejects` votes against it,
  /// in juror order. Returns the jurors array.
  function voteSplit(uint256 proposalId, uint256 upholds, uint256 rejects) internal returns (address[] memory jurors) {
    jurors = registry.getJurors(proposalId);
    require(upholds + rejects <= jurors.length, "voteSplit: too many votes");
    for (uint256 i = 0; i < upholds; i++) {
      vm.prank(jurors[i]);
      registry.castVote(proposalId, true);
    }
    for (uint256 i = 0; i < rejects; i++) {
      vm.prank(jurors[upholds + i]);
      registry.castVote(proposalId, false);
    }
  }

  function isValidator(address who) internal view returns (bool) {
    for (uint256 i = 0; i < validators.length; i++) {
      if (validators[i] == who) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------
  // Challenge
  // ---------------------------------------------------------------------

  function test_ChallengeEscrowsAndDrawsJury() public {
    uint256 id = proposeDefault();
    uint256 bobBefore = token.balanceOf(bob);

    challengeDefault(id);

    assertEq(token.balanceOf(bob), bobBefore - CHALLENGE_BOND);
    assertEq(uint8(registry.getProposal(id).status), uint8(FileRegistry.ProposalStatus.Challenged));

    (address challenger, uint256 challengerBond, uint64 voteDeadline, uint16 votesFor, uint16 votesAgainst) =
      registry.getDispute(id);
    assertEq(challenger, bob);
    assertEq(challengerBond, CHALLENGE_BOND);
    assertEq(voteDeadline, uint64(block.timestamp) + registry.voteWindowSeconds());
    assertEq(votesFor, 0);
    assertEq(votesAgainst, 0);

    // Jury: correct size, all distinct active validators, no proposer/challenger.
    address[] memory jurors = registry.getJurors(id);
    assertEq(jurors.length, registry.jurySize());
    for (uint256 i = 0; i < jurors.length; i++) {
      assertTrue(isValidator(jurors[i]), "juror must be an active validator");
      assertTrue(jurors[i] != alice && jurors[i] != bob, "proposer/challenger excluded");
      for (uint256 j = i + 1; j < jurors.length; j++) {
        assertTrue(jurors[i] != jurors[j], "jurors must be distinct");
      }
    }
  }

  function test_ChallengeExcludesValidatorProposer() public {
    // Make the proposer an active validator; the jury (5 of 7) must skip them.
    vm.startPrank(alice);
    token.approve(address(staking), type(uint256).max);
    staking.stake(STAKE);
    vm.stopPrank();

    uint256 id = proposeDefault();
    challengeDefault(id);

    address[] memory jurors = registry.getJurors(id);
    for (uint256 i = 0; i < jurors.length; i++) {
      assertTrue(jurors[i] != alice, "validator-proposer excluded from jury");
    }
  }

  function test_RevertWhen_ChallengeAfterWindow() public {
    uint256 id = proposeDefault();
    warpPastChallengeWindow();
    vm.prank(bob);
    vm.expectRevert(bytes("FileRegistry: window closed"));
    registry.challenge(id);
  }

  function test_RevertWhen_ChallengeTwice() public {
    uint256 id = proposeDefault();
    challengeDefault(id);
    vm.prank(carol);
    vm.expectRevert(bytes("FileRegistry: not proposed"));
    registry.challenge(id);
  }

  function test_RevertWhen_NotEnoughValidators() public {
    for (uint256 i = 0; i < 2; i++) {
      vm.prank(validators[i]);
      staking.requestUnstake(STAKE);
    }
    assertEq(staking.activeValidatorCount(), 4);

    uint256 id = proposeDefault();
    vm.prank(bob);
    vm.expectRevert(bytes("FileRegistry: not enough validators"));
    registry.challenge(id);
  }

  function test_RevertWhen_ExclusionsShrinkPoolBelowJury() public {
    // 6 validators, but the challenger is one of them: 5 eligible is enough;
    // drop one more so eligible = 4 < 5.
    vm.prank(validators[0]);
    staking.requestUnstake(STAKE);
    assertEq(staking.activeValidatorCount(), 5);

    uint256 id = proposeDefault();
    vm.startPrank(validators[1]); // challenger is an active validator
    token.approve(address(registry), type(uint256).max);
    vm.expectRevert(bytes("FileRegistry: not enough validators"));
    registry.challenge(id);
    vm.stopPrank();
  }

  // ---------------------------------------------------------------------
  // Voting
  // ---------------------------------------------------------------------

  function test_CastVoteTallies() public {
    uint256 id = proposeDefault();
    challengeDefault(id);
    address[] memory jurors = registry.getJurors(id);

    vm.expectEmit(true, true, true, true);
    emit FileRegistry.JurorVoted(id, jurors[0], true);
    vm.prank(jurors[0]);
    registry.castVote(id, true);
    vm.prank(jurors[1]);
    registry.castVote(id, false);

    (,,, uint16 votesFor, uint16 votesAgainst) = registry.getDispute(id);
    assertEq(votesFor, 1);
    assertEq(votesAgainst, 1);
    assertEq(registry.getVote(id, jurors[0]), 1);
    assertEq(registry.getVote(id, jurors[1]), 2);
    assertEq(registry.getVote(id, jurors[2]), 0);
  }

  function test_RevertWhen_NotJuror() public {
    uint256 id = proposeDefault();
    challengeDefault(id);
    vm.prank(carol);
    vm.expectRevert(bytes("FileRegistry: not a juror"));
    registry.castVote(id, true);
  }

  function test_RevertWhen_DoubleVote() public {
    uint256 id = proposeDefault();
    challengeDefault(id);
    address juror = registry.getJurors(id)[0];
    vm.prank(juror);
    registry.castVote(id, true);
    vm.prank(juror);
    vm.expectRevert(bytes("FileRegistry: already voted"));
    registry.castVote(id, false);
  }

  function test_RevertWhen_VoteAfterDeadline() public {
    uint256 id = proposeDefault();
    challengeDefault(id);
    warpPastVoteWindow();
    address juror = registry.getJurors(id)[0];
    vm.prank(juror);
    vm.expectRevert(bytes("FileRegistry: voting closed"));
    registry.castVote(id, true);
  }

  function test_RevertWhen_VoteOnUnchallenged() public {
    uint256 id = proposeDefault();
    vm.prank(validators[0]);
    vm.expectRevert(bytes("FileRegistry: not challenged"));
    registry.castVote(id, true);
  }

  // ---------------------------------------------------------------------
  // Resolution: challenger wins
  // ---------------------------------------------------------------------

  function test_ResolveChallengerWins() public {
    uint256 id = proposeDefault();
    challengeDefault(id);
    address[] memory jurors = voteSplit(id, 2, 3); // 2 uphold, 3 reject -> challenger wins
    warpPastVoteWindow();

    vm.expectEmit(true, true, true, true);
    emit FileRegistry.AnchorRejected(id, CID_A, alice);
    registry.resolveDispute(id);

    assertEq(uint8(registry.getProposal(id).status), uint8(FileRegistry.ProposalStatus.Rejected));
    assertFalse(registry.isCIDVerified(CID_A));

    // Proposer: tip refunded, bond slashed.
    assertEq(registry.withdrawable(alice), TIP);
    // Challenger: own bond back + half the proposer bond.
    assertEq(registry.withdrawable(bob), CHALLENGE_BOND + PROPOSE_BOND / 2);
    // Losing jurors (voted uphold) slashed from stake.
    uint256 slashPerJuror = registry.jurorSlashAmount();
    assertEq(staking.stakeOf(jurors[0]), STAKE - slashPerJuror);
    assertEq(staking.stakeOf(jurors[1]), STAKE - slashPerJuror);
    // Winning jurors split half the proposer bond + the slashed stake.
    uint256 pool = PROPOSE_BOND / 2 + 2 * slashPerJuror;
    uint256 perWinner = pool / 3;
    assertEq(registry.withdrawable(jurors[2]), perWinner);
    assertEq(registry.withdrawable(jurors[3]), perWinner);
    assertEq(registry.withdrawable(jurors[4]), perWinner);
    // No fee distribution happened.
    assertEq(registry.withdrawable(platformTreasury), 0);
    assertEq(registry.withdrawable(protocolTreasury), pool - perWinner * 3);
  }

  function test_ProposeAgainAfterRejected() public {
    uint256 id = proposeDefault();
    challengeDefault(id);
    voteSplit(id, 0, 3);
    warpPastVoteWindow();
    registry.resolveDispute(id);

    // The CID is unverified again; a corrected proposal is allowed.
    vm.prank(carol);
    uint256 second = registry.proposeAnchor(CID_A, CONTENT_B, "", PLATFORM_ID, TIP);
    assertEq(uint8(registry.getProposal(second).status), uint8(FileRegistry.ProposalStatus.Proposed));
  }

  // ---------------------------------------------------------------------
  // Resolution: proposer wins
  // ---------------------------------------------------------------------

  function test_ResolveProposerWins() public {
    uint256 id = proposeDefault();
    challengeDefault(id);
    address[] memory jurors = voteSplit(id, 3, 2); // proposer wins
    warpPastVoteWindow();

    vm.expectEmit(true, true, true, true);
    emit FileRegistry.AnchorVerified(id, CID_A, alice);
    registry.resolveDispute(id);

    assertEq(uint8(registry.getProposal(id).status), uint8(FileRegistry.ProposalStatus.Verified));
    assertEq(registry.verifiedProposalId(CID_A), id);

    // Proposer: bond back + half the challenger bond.
    assertEq(registry.withdrawable(alice), PROPOSE_BOND + CHALLENGE_BOND / 2);
    // Challenger loses the bond entirely.
    assertEq(registry.withdrawable(bob), 0);
    // Losing jurors slashed; winners split half challenger bond + slashed stake.
    uint256 slashPerJuror = registry.jurorSlashAmount();
    assertEq(staking.stakeOf(jurors[3]), STAKE - slashPerJuror);
    assertEq(staking.stakeOf(jurors[4]), STAKE - slashPerJuror);
    uint256 pool = CHALLENGE_BOND / 2 + 2 * slashPerJuror;
    uint256 perWinner = pool / 3;
    assertEq(registry.withdrawable(jurors[0]), perWinner);
    assertEq(registry.withdrawable(jurors[1]), perWinner);
    assertEq(registry.withdrawable(jurors[2]), perWinner);
    // Fees distributed on verification.
    assertEq(registry.withdrawable(platformTreasury), 25e18);
  }

  // ---------------------------------------------------------------------
  // Resolution: ties and no-shows
  // ---------------------------------------------------------------------

  function test_ResolveTieDefaultsOptimistic() public {
    uint256 id = proposeDefault();
    challengeDefault(id);
    address[] memory jurors = voteSplit(id, 1, 1);
    warpPastVoteWindow();

    registry.resolveDispute(id);

    assertEq(uint8(registry.getProposal(id).status), uint8(FileRegistry.ProposalStatus.Verified));
    // Challenger refunded, nobody slashed.
    assertEq(registry.withdrawable(bob), CHALLENGE_BOND);
    for (uint256 i = 0; i < jurors.length; i++) {
      assertEq(staking.stakeOf(jurors[i]), STAKE);
      assertEq(registry.withdrawable(jurors[i]), 0);
    }
    assertEq(registry.withdrawable(alice), PROPOSE_BOND);
  }

  function test_ResolveZeroVotesDefaultsOptimistic() public {
    uint256 id = proposeDefault();
    challengeDefault(id);
    warpPastVoteWindow();

    registry.resolveDispute(id);

    assertEq(uint8(registry.getProposal(id).status), uint8(FileRegistry.ProposalStatus.Verified));
    assertEq(registry.withdrawable(bob), CHALLENGE_BOND);
  }

  // ---------------------------------------------------------------------
  // Resolution timing / repeats
  // ---------------------------------------------------------------------

  function test_RevertWhen_ResolveBeforeDeadline() public {
    uint256 id = proposeDefault();
    challengeDefault(id);
    vm.expectRevert(bytes("FileRegistry: voting open"));
    registry.resolveDispute(id);
  }

  function test_RevertWhen_ResolveTwice() public {
    uint256 id = proposeDefault();
    challengeDefault(id);
    warpPastVoteWindow();
    registry.resolveDispute(id);
    vm.expectRevert(bytes("FileRegistry: not challenged"));
    registry.resolveDispute(id);
  }

  // ---------------------------------------------------------------------
  // Race between a dispute and a parallel verification
  // ---------------------------------------------------------------------

  function test_UpheldProposalLosesRaceDuringDispute() public {
    uint256 challenged = proposeDefault();
    challengeDefault(challenged);

    // A parallel proposal for the same CID verifies while the dispute runs.
    vm.prank(carol);
    uint256 parallel = registry.proposeAnchor(CID_A, CONTENT_A, "", PLATFORM_ID, TIP);
    voteSplit(challenged, 3, 2); // dispute upholds the proposal...
    warpPastChallengeWindow();
    registry.finalize(parallel);
    assertEq(registry.verifiedProposalId(CID_A), parallel);

    warpPastVoteWindow();
    registry.resolveDispute(challenged);

    // ...but first-verified-wins: the challenged proposal is rejected with a
    // full refund, while the challenger still pays for the lost dispute.
    assertEq(uint8(registry.getProposal(challenged).status), uint8(FileRegistry.ProposalStatus.Rejected));
    assertEq(registry.verifiedProposalId(CID_A), parallel);
    assertEq(registry.withdrawable(alice), TIP + PROPOSE_BOND + CHALLENGE_BOND / 2);
    assertEq(registry.withdrawable(bob), 0);
  }
}
