//! FileOnChain anchoring contract for Starknet. A Cairo port of the EVM
//! FileRegistry's anchoring surface: `anchor_cid` emits one event whose
//! `payload` field carries the versioned `fileonchain` JSON verbatim
//! (see packages/utils/src/anchor.ts). Starknet is its own chain family in
//! the SDK (`starknet:*`) — this is not EVM bytecode.

#[starknet::interface]
pub trait IFileRegistry<TContractState> {
    fn anchor_cid(ref self: TContractState, cid: ByteArray, payload: ByteArray);
}

#[starknet::contract]
pub mod FileRegistry {
    use starknet::{ContractAddress, get_caller_address};

    #[storage]
    struct Storage {}

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        CIDAnchored: CIDAnchored,
    }

    /// One anchor. Stateless by design — anchors live in the event stream,
    /// so chunked uploads cost no storage growth. Re-anchoring the same CID
    /// is allowed; the earliest event wins for indexers.
    #[derive(Drop, starknet::Event)]
    pub struct CIDAnchored {
        #[key]
        pub submitter: ContractAddress,
        /// CIDv1 of the anchored file or chunk.
        pub cid: ByteArray,
        /// The `fileonchain` v1 JSON payload, verbatim.
        pub payload: ByteArray,
    }

    #[abi(embed_v0)]
    impl FileRegistryImpl of super::IFileRegistry<ContractState> {
        fn anchor_cid(ref self: ContractState, cid: ByteArray, payload: ByteArray) {
            self.emit(Event::CIDAnchored(CIDAnchored { submitter: get_caller_address(), cid, payload }));
        }
    }
}
