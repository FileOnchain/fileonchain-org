//! Tests for the FileRegistry anchoring contract. Run with `scarb test`.

use fileonchain::{IFileRegistryDispatcher, IFileRegistryDispatcherTrait};
use starknet::syscalls::deploy_syscall;
use starknet::SyscallResultTrait;

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

#[test]
fn anchor_cid_accepts_cid_and_payload() {
    let registry = deploy();
    registry
        .anchor_cid(
            "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
            "{\"p\":\"fileonchain\",\"v\":1,\"op\":\"anchor\",\"cid\":\"bafy...\"}",
        );
}

#[test]
fn anchor_cid_allows_reanchoring() {
    let registry = deploy();
    // Stateless by design: the earliest event wins for indexers, and a
    // second anchor of the same CID must not revert.
    registry.anchor_cid("bafy-cid", "payload-one");
    registry.anchor_cid("bafy-cid", "payload-two");
}
