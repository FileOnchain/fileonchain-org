//! Tests for the FileRegistry anchoring contract. Run with `scarb test`.

use fileonchain::{FileRegistry, IFileRegistryDispatcher, IFileRegistryDispatcherTrait};
use starknet::syscalls::deploy_syscall;
use starknet::{ContractAddress, SyscallResultTrait};

fn deploy() -> IFileRegistryDispatcher {
    let (address, _) = deploy_syscall(
        fileonchain::FileRegistry::TEST_CLASS_HASH.try_into().unwrap(),
        0,
        array![].span(),
        false,
    )
        .unwrap_syscall();
    IFileRegistryDispatcher { contract_address: address }
}

fn pop_anchored(registry: IFileRegistryDispatcher) -> FileRegistry::CIDAnchored {
    let event = starknet::testing::pop_log::<FileRegistry::Event>(registry.contract_address)
        .expect('expected a CIDAnchored event');
    match event {
        FileRegistry::Event::CIDAnchored(e) => e,
    }
}

#[test]
fn anchor_cid_emits_event_with_caller_cid_and_payload() {
    let registry = deploy();
    let caller: ContractAddress = 0xA11CE.try_into().unwrap();
    // The test itself acts as the calling contract, so this sets the caller
    // the registry observes.
    starknet::testing::set_contract_address(caller);

    registry
        .anchor_cid(
            "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
            "{\"p\":\"fileonchain\",\"v\":1,\"op\":\"anchor\",\"cid\":\"bafy...\"}",
        );

    let e = pop_anchored(registry);
    assert_eq!(e.submitter, caller);
    assert_eq!(e.cid, "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi");
    // The fileonchain JSON must ride along verbatim.
    assert_eq!(e.payload, "{\"p\":\"fileonchain\",\"v\":1,\"op\":\"anchor\",\"cid\":\"bafy...\"}");
}

#[test]
fn anchor_cid_allows_reanchoring() {
    let registry = deploy();
    // Stateless by design: the earliest event wins for indexers, and a
    // second anchor of the same CID must not revert.
    registry.anchor_cid("bafy-cid", "payload-one");
    registry.anchor_cid("bafy-cid", "payload-two");

    let first = pop_anchored(registry);
    let second = pop_anchored(registry);
    assert_eq!(first.payload, "payload-one");
    assert_eq!(second.payload, "payload-two");
}

#[test]
fn submitter_tracks_caller() {
    let registry = deploy();

    let alice: ContractAddress = 0xA11CE.try_into().unwrap();
    starknet::testing::set_contract_address(alice);
    registry.anchor_cid("bafy-cid", "payload");

    let bob: ContractAddress = 0xB0B.try_into().unwrap();
    starknet::testing::set_contract_address(bob);
    registry.anchor_cid("bafy-cid", "payload");

    assert_eq!(pop_anchored(registry).submitter, alice);
    assert_eq!(pop_anchored(registry).submitter, bob);
}
