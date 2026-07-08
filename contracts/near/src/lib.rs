//! FileOnChain anchoring contract for NEAR. `anchor_cid` records one CID
//! anchor as a NEP-297 event log whose `payload` field carries the versioned
//! `fileonchain` JSON verbatim (see packages/utils/src/anchor.ts), so indexers
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
    use near_sdk::serde_json::Value;
    use near_sdk::test_utils::{get_logs, VMContextBuilder};
    use near_sdk::{testing_env, AccountId};

    const CID: &str = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
    const PAYLOAD: &str = r#"{"p":"fileonchain","v":1,"op":"anchor","cid":"bafy..."}"#;

    fn set_predecessor(account: &str) {
        let context = VMContextBuilder::new()
            .predecessor_account_id(account.parse::<AccountId>().unwrap())
            .build();
        testing_env!(context);
    }

    /// Parse the NEP-297 log line back into JSON so field assertions are
    /// exact rather than substring matches.
    fn parse_event(log: &str) -> Value {
        let json = log.strip_prefix("EVENT_JSON:").expect("NEP-297 prefix");
        near_sdk::serde_json::from_str(json).expect("valid event JSON")
    }

    #[test]
    fn anchor_logs_nep297_event() {
        set_predecessor("alice.near");
        let mut contract = FileRegistry::default();
        contract.anchor_cid(CID.to_string(), PAYLOAD.to_string());

        let logs = get_logs();
        assert_eq!(logs.len(), 1);

        let event = parse_event(&logs[0]);
        assert_eq!(event["standard"], "fileonchain");
        assert_eq!(event["version"], "1.0.0");
        assert_eq!(event["event"], "cid_anchored");

        let data = &event["data"][0];
        assert_eq!(data["submitter"], "alice.near");
        assert_eq!(data["cid"], CID);
        assert_eq!(data["payload"], PAYLOAD, "payload must be carried verbatim");
    }

    #[test]
    fn reanchoring_same_cid_is_allowed() {
        set_predecessor("alice.near");
        let mut contract = FileRegistry::default();
        contract.anchor_cid(CID.to_string(), PAYLOAD.to_string());
        contract.anchor_cid(CID.to_string(), r#"{"v":1,"op":"anchor","second":true}"#.to_string());

        // Stateless by design: both anchors land in the log stream and the
        // earliest event wins for indexers.
        let logs = get_logs();
        assert_eq!(logs.len(), 2);
        assert_eq!(parse_event(&logs[0])["data"][0]["cid"], CID);
        assert_eq!(parse_event(&logs[1])["data"][0]["cid"], CID);
    }

    #[test]
    fn submitter_tracks_predecessor_account() {
        set_predecessor("bob.near");
        let mut contract = FileRegistry::default();
        contract.anchor_cid(CID.to_string(), PAYLOAD.to_string());

        let event = parse_event(&get_logs()[0]);
        assert_eq!(event["data"][0]["submitter"], "bob.near");
    }
}
