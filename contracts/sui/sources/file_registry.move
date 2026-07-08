/// FileOnChain anchoring module for Sui. Mirrors the Aptos module's API —
/// `file_registry::anchor_cid(cid, payload)` — but is a separate
/// implementation: Sui's object model and event system share no code with
/// Aptos Move. The `payload` field carries the versioned `fileonchain` JSON
/// verbatim (see packages/utils/src/anchor.ts).
module fileonchain::file_registry {
    use std::string::String;
    use sui::event;

    public struct CIDAnchored has copy, drop {
        submitter: address,
        /// CIDv1 of the anchored file or chunk.
        cid: String,
        /// The `fileonchain` v1 JSON payload, verbatim.
        payload: String,
    }

    /// Anchor one CID. Stateless: anchors live in the event stream, so
    /// chunked uploads cost no storage growth and no shared-object
    /// contention. Re-anchoring the same CID is allowed — the earliest
    /// event wins for indexers.
    public entry fun anchor_cid(cid: String, payload: String, ctx: &TxContext) {
        event::emit(CIDAnchored {
            submitter: ctx.sender(),
            cid,
            payload,
        });
    }

    #[test]
    fun anchor_emits_event() {
        let mut scenario = sui::test_scenario::begin(@0xA11CE);
        anchor_cid(
            b"bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi".to_string(),
            b"{\"p\":\"fileonchain\",\"v\":1,\"op\":\"anchor\",\"cid\":\"bafy...\"}".to_string(),
            scenario.ctx(),
        );

        let events = event::events_by_type<CIDAnchored>();
        assert!(events.length() == 1);
        let e = &events[0];
        assert!(e.submitter == @0xA11CE);
        assert!(e.cid == b"bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi".to_string());
        // The fileonchain JSON must ride along verbatim.
        assert!(e.payload == b"{\"p\":\"fileonchain\",\"v\":1,\"op\":\"anchor\",\"cid\":\"bafy...\"}".to_string());
        scenario.end();
    }

    #[test]
    fun reanchoring_same_cid_is_allowed() {
        // Stateless by design: a second anchor of the same CID must not
        // abort, and both events land in the stream.
        let mut scenario = sui::test_scenario::begin(@0xA11CE);
        anchor_cid(b"bafy-cid".to_string(), b"payload-one".to_string(), scenario.ctx());
        anchor_cid(b"bafy-cid".to_string(), b"payload-two".to_string(), scenario.ctx());

        let events = event::events_by_type<CIDAnchored>();
        assert!(events.length() == 2);
        assert!(events[0].payload == b"payload-one".to_string());
        assert!(events[1].payload == b"payload-two".to_string());
        scenario.end();
    }

    #[test]
    fun submitter_tracks_sender() {
        let ctx = tx_context::dummy();
        anchor_cid(b"bafy-cid".to_string(), b"payload".to_string(), &ctx);

        let events = event::events_by_type<CIDAnchored>();
        assert!(events.length() == 1);
        assert!(events[0].submitter == ctx.sender());
    }
}
