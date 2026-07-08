// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./ProtocolBase.t.sol";

contract FileRegistryTest is ProtocolBase {
  // ---------------------------------------------------------------------
  // Constructor / wiring
  // ---------------------------------------------------------------------

  function test_ConstructorWiring() public view {
    assertEq(address(registry.token()), address(token));
    assertEq(address(registry.staking()), address(staking));
    assertEq(address(registry.platformRegistry()), address(platforms));
    assertEq(registry.protocolTreasury(), protocolTreasury);
    assertEq(registry.validatorBps(), 6000);
    assertEq(registry.platformBps(), 2500);
    assertEq(registry.protocolBps(), 1500);
    assertEq(registry.jurySize(), 5);
    assertEq(registry.owner(), address(this));
  }

  function test_RevertWhen_InitializeZeroArgs() public {
    address implementation = address(new FileRegistry());
    vm.expectRevert(bytes("FileRegistry: zero token"));
    deployProxy(
      implementation,
      abi.encodeCall(
        FileRegistry.initialize, (IERC20(address(0)), staking, platforms, protocolTreasury, address(this))
      )
    );
    vm.expectRevert(bytes("FileRegistry: zero staking"));
    deployProxy(
      implementation,
      abi.encodeCall(
        FileRegistry.initialize,
        (IERC20(address(token)), ValidatorStaking(address(0)), platforms, protocolTreasury, address(this))
      )
    );
    vm.expectRevert(bytes("FileRegistry: zero platform registry"));
    deployProxy(
      implementation,
      abi.encodeCall(
        FileRegistry.initialize,
        (IERC20(address(token)), staking, PlatformRegistry(address(0)), protocolTreasury, address(this))
      )
    );
    vm.expectRevert(bytes("FileRegistry: zero treasury"));
    deployProxy(
      implementation,
      abi.encodeCall(
        FileRegistry.initialize, (IERC20(address(token)), staking, platforms, address(0), address(this))
      )
    );
  }

  // ---------------------------------------------------------------------
  // Chunk anchoring
  // ---------------------------------------------------------------------

  function test_AnchorChunkEmitsAndStoresNothing() public {
    vm.expectEmit(true, true, true, true);
    emit FileRegistry.ChunkAnchored(CID_A, CONTENT_A, alice, "ipfs://chunk", uint64(block.timestamp));
    vm.prank(alice);
    registry.anchorChunk(CID_A, CONTENT_A, "ipfs://chunk");

    // Chunk anchors leave no proposal state behind.
    assertEq(registry.getProposalIds(CID_A).length, 0);
    assertFalse(registry.isCIDVerified(CID_A));
  }

  // ---------------------------------------------------------------------
  // Propose
  // ---------------------------------------------------------------------

  function test_ProposeEscrowsAndStores() public {
    uint256 aliceBefore = token.balanceOf(alice);

    vm.expectEmit(true, true, true, true);
    emit FileRegistry.AnchorProposed(
      1,
      CID_A,
      alice,
      CONTENT_A,
      PLATFORM_ID,
      TIP,
      PROPOSE_BOND,
      uint64(block.timestamp) + registry.challengeWindowSeconds()
    );
    uint256 id = proposeDefault();

    assertEq(id, 1);
    assertEq(token.balanceOf(alice), aliceBefore - TIP - PROPOSE_BOND);
    assertEq(token.balanceOf(address(registry)), TIP + PROPOSE_BOND);

    FileRegistry.Proposal memory p = registry.getProposal(id);
    assertEq(p.cidHash, CID_A);
    assertEq(p.contentHash, CONTENT_A);
    assertEq(p.uri, "ipfs://bafy.../file");
    assertEq(p.proposer, alice);
    assertEq(p.platformId, PLATFORM_ID);
    assertEq(p.tip, TIP);
    assertEq(p.bond, PROPOSE_BOND);
    assertEq(uint8(p.status), uint8(FileRegistry.ProposalStatus.Proposed));

    uint256[] memory ids = registry.getProposalIds(CID_A);
    assertEq(ids.length, 1);
    assertEq(ids[0], id);
  }

  function test_RevertWhen_TipBelowMin() public {
    uint256 tooLow = registry.minTip() - 1; // read before prank: view calls consume it
    vm.prank(alice);
    vm.expectRevert(bytes("FileRegistry: tip below minimum"));
    registry.proposeAnchor(CID_A, CONTENT_A, "", PLATFORM_ID, tooLow);
  }

  function test_RevertWhen_PlatformUnknown() public {
    vm.prank(alice);
    vm.expectRevert(bytes("FileRegistry: platform inactive"));
    registry.proposeAnchor(CID_A, CONTENT_A, "", 99, TIP);
  }

  function test_RevertWhen_PlatformDeactivated() public {
    platforms.setPlatformActive(PLATFORM_ID, false);
    vm.prank(alice);
    vm.expectRevert(bytes("FileRegistry: platform inactive"));
    registry.proposeAnchor(CID_A, CONTENT_A, "", PLATFORM_ID, TIP);
  }

  function test_RevertWhen_ProposeAlreadyVerifiedCID() public {
    uint256 id = proposeDefault();
    warpPastChallengeWindow();
    registry.finalize(id);

    vm.prank(bob);
    vm.expectRevert(bytes("FileRegistry: already verified"));
    registry.proposeAnchor(CID_A, CONTENT_B, "", PLATFORM_ID, TIP);
  }

  // ---------------------------------------------------------------------
  // Finalize
  // ---------------------------------------------------------------------

  function test_RevertWhen_FinalizeBeforeWindow() public {
    uint256 id = proposeDefault();
    vm.expectRevert(bytes("FileRegistry: window open"));
    registry.finalize(id);
  }

  function test_RevertWhen_FinalizeUnknownProposal() public {
    vm.expectRevert(bytes("FileRegistry: not proposed"));
    registry.finalize(42);
  }

  function test_FinalizeVerifiesAndSplitsFees() public {
    uint256 id = proposeDefault();
    warpPastChallengeWindow();

    vm.expectEmit(true, true, true, true);
    emit FileRegistry.FeesDistributed(id, 60e18, 25e18, 15e18);
    vm.expectEmit(true, true, true, true);
    emit FileRegistry.AnchorVerified(id, CID_A, alice);
    registry.finalize(id);

    FileRegistry.Proposal memory p = registry.getProposal(id);
    assertEq(uint8(p.status), uint8(FileRegistry.ProposalStatus.Verified));
    assertEq(p.verifiedAt, block.timestamp);
    assertTrue(registry.isCIDVerified(CID_A));
    assertEq(registry.verifiedProposalId(CID_A), id);

    // 60% of the tip moved into the staking reward pool.
    assertEq(token.balanceOf(address(staking)), STAKE * validators.length + 60e18);
    // 25% / 15% credited as pull payments; bond returned to proposer.
    assertEq(registry.withdrawable(platformTreasury), 25e18);
    assertEq(registry.withdrawable(protocolTreasury), 15e18);
    assertEq(registry.withdrawable(alice), PROPOSE_BOND);

    // Validators can claim their pro-rata share (6 validators, equal stake).
    vm.prank(validators[0]);
    staking.claimRewards();
    assertEq(token.balanceOf(validators[0]), 10_000e18 - STAKE + 10e18);
  }

  function test_FinalizeWithNoStakeRoutesValidatorShareToProtocol() public {
    for (uint256 i = 0; i < validators.length; i++) {
      vm.prank(validators[i]);
      staking.requestUnstake(STAKE);
    }
    assertEq(staking.totalStaked(), 0);

    uint256 id = proposeDefault();
    warpPastChallengeWindow();
    registry.finalize(id);

    assertEq(registry.withdrawable(protocolTreasury), 60e18 + 15e18);
    assertEq(registry.withdrawable(platformTreasury), 25e18);
  }

  function test_FinalizeRaceLoserRefunded() public {
    uint256 first = proposeDefault();
    vm.prank(bob);
    uint256 second = registry.proposeAnchor(CID_A, CONTENT_B, "", PLATFORM_ID, TIP);
    warpPastChallengeWindow();

    registry.finalize(first);
    assertEq(registry.verifiedProposalId(CID_A), first);

    uint256 bobBefore = registry.withdrawable(bob);
    vm.expectEmit(true, true, true, true);
    emit FileRegistry.AnchorRejected(second, CID_A, bob);
    registry.finalize(second);

    FileRegistry.Proposal memory p = registry.getProposal(second);
    assertEq(uint8(p.status), uint8(FileRegistry.ProposalStatus.Rejected));
    assertEq(registry.withdrawable(bob), bobBefore + TIP + PROPOSE_BOND);
    // The verified record still points at the first proposal.
    assertEq(registry.verifiedProposalId(CID_A), first);
  }

  function test_RevertWhen_FinalizeTwice() public {
    uint256 id = proposeDefault();
    warpPastChallengeWindow();
    registry.finalize(id);
    vm.expectRevert(bytes("FileRegistry: not proposed"));
    registry.finalize(id);
  }

  function testFuzz_SplitSumsToTip(uint256 tip, uint16 platformFeeBps) public {
    tip = bound(tip, registry.minTip(), 1_000e18);
    platformFeeBps = uint16(bound(platformFeeBps, 0, platforms.maxPlatformFeeBps()));
    vm.prank(platformOwner);
    platforms.updatePlatform(PLATFORM_ID, platformTreasury, platformFeeBps);

    uint256 stakingBefore = token.balanceOf(address(staking));
    vm.prank(alice);
    uint256 id = registry.proposeAnchor(CID_A, CONTENT_A, "", PLATFORM_ID, tip);
    warpPastChallengeWindow();
    registry.finalize(id);

    uint256 distributed = (token.balanceOf(address(staking)) - stakingBefore)
      + registry.withdrawable(platformTreasury) + registry.withdrawable(protocolTreasury);
    assertEq(distributed, tip, "no wei may be lost in the split");
  }

  // ---------------------------------------------------------------------
  // Withdraw
  // ---------------------------------------------------------------------

  function test_WithdrawTransfersAndZeroes() public {
    uint256 id = proposeDefault();
    warpPastChallengeWindow();
    registry.finalize(id);

    uint256 before = token.balanceOf(platformTreasury);
    vm.expectEmit(true, true, true, true);
    emit FileRegistry.Withdrawn(platformTreasury, 25e18);
    vm.prank(platformTreasury);
    registry.withdraw();
    assertEq(token.balanceOf(platformTreasury), before + 25e18);
    assertEq(registry.withdrawable(platformTreasury), 0);
  }

  function test_RevertWhen_WithdrawNothing() public {
    vm.prank(bob);
    vm.expectRevert(bytes("FileRegistry: nothing to withdraw"));
    registry.withdraw();
  }

  // ---------------------------------------------------------------------
  // Views
  // ---------------------------------------------------------------------

  function test_GetVerifiedRecordLifecycle() public {
    FileRegistry.Proposal memory empty = registry.getVerifiedRecord(CID_A);
    assertEq(empty.proposer, address(0));

    uint256 id = proposeDefault();
    warpPastChallengeWindow();
    registry.finalize(id);

    FileRegistry.Proposal memory rec = registry.getVerifiedRecord(CID_A);
    assertEq(rec.proposer, alice);
    assertEq(rec.contentHash, CONTENT_A);
  }

  // ---------------------------------------------------------------------
  // Governance setters
  // ---------------------------------------------------------------------

  function test_GovernanceSetters() public {
    registry.setBonds(1e18, 2e18);
    assertEq(registry.proposeBond(), 1e18);
    assertEq(registry.challengeBond(), 2e18);

    registry.setMinTip(5e18);
    assertEq(registry.minTip(), 5e18);

    registry.setWindows(1 hours, 2 hours);
    assertEq(registry.challengeWindowSeconds(), 1 hours);
    assertEq(registry.voteWindowSeconds(), 2 hours);

    registry.setJuryParams(3, 10e18);
    assertEq(registry.jurySize(), 3);
    assertEq(registry.jurorSlashAmount(), 10e18);

    registry.setFeeSplit(7000, 2000, 1000);
    assertEq(registry.validatorBps(), 7000);

    registry.setProtocolTreasury(bob);
    assertEq(registry.protocolTreasury(), bob);
  }

  function test_RevertWhen_SetterValidationFails() public {
    vm.expectRevert(bytes("FileRegistry: zero window"));
    registry.setWindows(0, 1);
    vm.expectRevert(bytes("FileRegistry: jury size must be odd"));
    registry.setJuryParams(4, 10e18);
    vm.expectRevert(bytes("FileRegistry: split must sum to 100%"));
    registry.setFeeSplit(6000, 2500, 1000);
    vm.expectRevert(bytes("FileRegistry: zero treasury"));
    registry.setProtocolTreasury(address(0));
  }

  function test_RevertWhen_SetterNotOwner() public {
    vm.startPrank(alice);
    vm.expectRevert();
    registry.setBonds(1, 1);
    vm.expectRevert();
    registry.setMinTip(1);
    vm.expectRevert();
    registry.setWindows(1, 1);
    vm.expectRevert();
    registry.setJuryParams(3, 1);
    vm.expectRevert();
    registry.setFeeSplit(6000, 2500, 1500);
    vm.expectRevert();
    registry.setProtocolTreasury(alice);
    vm.stopPrank();
  }
}
