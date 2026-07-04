/// FileOnChain anchoring module. The Aptos counterpart of the EVM
/// FileRegistry: `anchor_cid` records one CID anchor as a module event whose
/// `payload` field carries the versioned `fileonchain` JSON verbatim, so a
/// single indexer can parse anchors from any chain family
/// (see packages/utils/src/anchor.ts).
///
/// The SDK's Aptos client (`@fileonchain/sdk/aptos`) calls
/// `<moduleAddress>::file_registry::anchor_cid` — keep the module and
/// function names stable.
module fileonchain::file_registry {
    use std::signer;
    use std::string::String;
    use aptos_framework::event;

    #[event]
    struct CIDAnchored has drop, store {
        submitter: address,
        /// CIDv1 of the anchored file or chunk.
        cid: String,
        /// The `fileonchain` v1 JSON payload, verbatim.
        payload: String,
    }

    /// Anchor one CID. Stateless by design: anchors live in the event
    /// stream (and the tx itself), not in storage, so chunked uploads cost
    /// no per-chunk storage growth. Re-anchoring the same CID is allowed —
    /// the earliest event wins for indexers.
    public entry fun anchor_cid(caller: &signer, cid: String, payload: String) {
        event::emit(CIDAnchored {
            submitter: signer::address_of(caller),
            cid,
            payload,
        });
    }

    #[test(user = @0xA11CE)]
    fun anchor_emits_event(user: &signer) {
        use std::string;
        anchor_cid(
            user,
            string::utf8(b"bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi"),
            string::utf8(b"{\"p\":\"fileonchain\",\"v\":1,\"op\":\"anchor\",\"cid\":\"bafy...\"}"),
        );
        let events = event::emitted_events<CIDAnchored>();
        assert!(std::vector::length(&events) == 1, 0);
    }
}
