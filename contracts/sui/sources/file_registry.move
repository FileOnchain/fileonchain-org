/// FileOnChain anchoring module for Sui. Mirrors the Aptos module's API —
/// `file_registry::anchor_cid(cid, payload)` — but is a separate
/// implementation: Sui's object model and event system share no code with
/// Aptos Move. The `payload` field carries the versioned `fileonchain` JSON
/// verbatim (see packages/sdk/src/anchor.ts).
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
        let ctx = tx_context::dummy();
        anchor_cid(
            b"bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi".to_string(),
            b"{\"p\":\"fileonchain\",\"v\":1,\"op\":\"anchor\",\"cid\":\"bafy...\"}".to_string(),
            &ctx,
        );
    }
}
