//! FileOnChain anchoring contract for NEAR.
//!
//! Minimal by design: `anchor_cid` emits one NEP-297 event whose `payload`
//! field carries the versioned `fileonchain` JSON verbatim (see
//! packages/utils/src/anchor.ts). Anchors are free beyond gas — no token,
//! no bonds, no economics. What an anchor proves is exactly what the chain
//! proves: this payload was written by this account in this block.
//! Independent verification happens off-chain against the transaction
//! receipt and the FileOnChain evidence-package vocabulary.

use near_sdk::serde_json::json;
use near_sdk::{env, near, PanicOnDefault};

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct FileRegistry {}

#[near]
impl FileRegistry {
    #[init]
    pub fn new() -> Self {
        Self {}
    }

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
    use near_sdk::test_utils::{accounts, get_logs, VMContextBuilder};
    use near_sdk::testing_env;

    fn set_context(predecessor: near_sdk::AccountId) {
        let context = VMContextBuilder::new()
            .predecessor_account_id(predecessor)
            .build();
        testing_env!(context);
    }

    #[test]
    fn anchor_cid_emits_nep297_event() {
        set_context(accounts(1));
        let mut contract = FileRegistry::new();
        contract.anchor_cid(
            "bafybeigdyrzt5examplecid".to_string(),
            r#"{"p":"fileonchain","v":1,"op":"anchor","cid":"bafybeigdyrzt5examplecid"}"#.to_string(),
        );

        let logs = get_logs();
        assert_eq!(logs.len(), 1);
        assert!(logs[0].starts_with("EVENT_JSON:"));
        assert!(logs[0].contains(r#""event":"cid_anchored""#));
        assert!(logs[0].contains("bafybeigdyrzt5examplecid"));
        assert!(logs[0].contains(accounts(1).as_str()));
    }

    #[test]
    fn re_anchoring_is_allowed() {
        set_context(accounts(1));
        let mut contract = FileRegistry::new();
        contract.anchor_cid("bafycid".to_string(), "{}".to_string());
        contract.anchor_cid("bafycid".to_string(), "{}".to_string());
        assert_eq!(get_logs().len(), 2);
    }
}
