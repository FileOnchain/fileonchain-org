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

        let e = std::vector::borrow(&events, 0);
        assert!(e.submitter == @0xA11CE, 1);
        assert!(
            e.cid == string::utf8(b"bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi"),
            2,
        );
        // The fileonchain JSON must ride along verbatim.
        assert!(
            e.payload == string::utf8(b"{\"p\":\"fileonchain\",\"v\":1,\"op\":\"anchor\",\"cid\":\"bafy...\"}"),
            3,
        );
    }

    #[test(user = @0xA11CE)]
    fun reanchoring_same_cid_is_allowed(user: &signer) {
        use std::string;
        // Stateless by design: a second anchor of the same CID must not
        // abort, and both events land in the stream.
        anchor_cid(user, string::utf8(b"bafy-cid"), string::utf8(b"payload-one"));
        anchor_cid(user, string::utf8(b"bafy-cid"), string::utf8(b"payload-two"));

        let events = event::emitted_events<CIDAnchored>();
        assert!(std::vector::length(&events) == 2, 0);
        assert!(std::vector::borrow(&events, 0).payload == string::utf8(b"payload-one"), 1);
        assert!(std::vector::borrow(&events, 1).payload == string::utf8(b"payload-two"), 2);
    }

    #[test(alice = @0xA11CE, bob = @0xB0B)]
    fun submitter_tracks_caller(alice: &signer, bob: &signer) {
        use std::string;
        anchor_cid(alice, string::utf8(b"bafy-cid"), string::utf8(b"payload"));
        anchor_cid(bob, string::utf8(b"bafy-cid"), string::utf8(b"payload"));

        let events = event::emitted_events<CIDAnchored>();
        assert!(std::vector::length(&events) == 2, 0);
        assert!(std::vector::borrow(&events, 0).submitter == @0xA11CE, 1);
        assert!(std::vector::borrow(&events, 1).submitter == @0xB0B, 2);
    }
}
