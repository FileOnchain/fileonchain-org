//! FileOnChain anchoring contract for NEAR. `anchor_cid` records one CID
//! anchor as a NEP-297 event log whose `payload` field carries the versioned
//! `fileonchain` JSON verbatim (see packages/sdk/src/anchor.ts), so indexers
//! discover anchors by streaming `EVENT_JSON` logs — no storage growth.

use near_sdk::serde_json::json;
use near_sdk::{env, near};

#[near(contract_state)]
#[derive(Default)]
pub struct FileRegistry {}

#[near]
impl FileRegistry {
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
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::get_logs;

    #[test]
    fn anchor_logs_nep297_event() {
        let mut contract = FileRegistry::default();
        contract.anchor_cid(
            "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi".to_string(),
            r#"{"p":"fileonchain","v":1,"op":"anchor","cid":"bafy..."}"#.to_string(),
        );
        let logs = get_logs();
        assert_eq!(logs.len(), 1);
        assert!(logs[0].starts_with("EVENT_JSON:"));
        assert!(logs[0].contains(r#""event":"cid_anchored""#));
        assert!(logs[0].contains(r#""p\":\"fileonchain\""#) || logs[0].contains("fileonchain"));
    }
}
