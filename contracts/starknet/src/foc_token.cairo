//! FOC — the FileOnChain protocol token on Starknet. A deliberately minimal
//! ERC-20 (no external dependencies, matching this package's cairo-test
//! setup): fixed supply minted to the initial holder, standard
//! transfer/approve surface, 18 decimals like the EVM FileOnChainToken.
//! Denominates anchor tips, propose/challenge bonds, and validator stakes
//! for the AnchorRegistry contract.

use starknet::ContractAddress;

#[starknet::interface]
pub trait IERC20<TContractState> {
    fn name(self: @TContractState) -> ByteArray;
    fn symbol(self: @TContractState) -> ByteArray;
    fn decimals(self: @TContractState) -> u8;
    fn total_supply(self: @TContractState) -> u256;
    fn balance_of(self: @TContractState, account: ContractAddress) -> u256;
    fn allowance(self: @TContractState, owner: ContractAddress, spender: ContractAddress) -> u256;
    fn transfer(ref self: TContractState, recipient: ContractAddress, amount: u256) -> bool;
    fn transfer_from(
        ref self: TContractState,
        sender: ContractAddress,
        recipient: ContractAddress,
        amount: u256,
    ) -> bool;
    fn approve(ref self: TContractState, spender: ContractAddress, amount: u256) -> bool;
}

#[starknet::contract]
pub mod FocToken {
    use core::num::traits::Zero;
    use starknet::storage::{
        Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_caller_address};

    #[storage]
    struct Storage {
        total_supply: u256,
        balances: Map<ContractAddress, u256>,
        allowances: Map<(ContractAddress, ContractAddress), u256>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        Transfer: Transfer,
        Approval: Approval,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Transfer {
        #[key]
        pub from: ContractAddress,
        #[key]
        pub to: ContractAddress,
        pub value: u256,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Approval {
        #[key]
        pub owner: ContractAddress,
        #[key]
        pub spender: ContractAddress,
        pub value: u256,
    }

    #[constructor]
    fn constructor(ref self: ContractState, initial_holder: ContractAddress, initial_supply: u256) {
        assert!(!initial_holder.is_zero(), "FOC: zero holder");
        self.total_supply.write(initial_supply);
        self.balances.entry(initial_holder).write(initial_supply);
        self
            .emit(
                Event::Transfer(
                    Transfer { from: 0.try_into().unwrap(), to: initial_holder, value: initial_supply },
                ),
            );
    }

    #[abi(embed_v0)]
    impl ERC20Impl of super::IERC20<ContractState> {
        fn name(self: @ContractState) -> ByteArray {
            "FileOnChain"
        }

        fn symbol(self: @ContractState) -> ByteArray {
            "FOC"
        }

        fn decimals(self: @ContractState) -> u8 {
            18
        }

        fn total_supply(self: @ContractState) -> u256 {
            self.total_supply.read()
        }

        fn balance_of(self: @ContractState, account: ContractAddress) -> u256 {
            self.balances.entry(account).read()
        }

        fn allowance(
            self: @ContractState, owner: ContractAddress, spender: ContractAddress,
        ) -> u256 {
            self.allowances.entry((owner, spender)).read()
        }

        fn transfer(ref self: ContractState, recipient: ContractAddress, amount: u256) -> bool {
            self._transfer(get_caller_address(), recipient, amount);
            true
        }

        fn transfer_from(
            ref self: ContractState,
            sender: ContractAddress,
            recipient: ContractAddress,
            amount: u256,
        ) -> bool {
            let caller = get_caller_address();
            let allowed = self.allowances.entry((sender, caller)).read();
            assert!(allowed >= amount, "FOC: insufficient allowance");
            self.allowances.entry((sender, caller)).write(allowed - amount);
            self._transfer(sender, recipient, amount);
            true
        }

        fn approve(ref self: ContractState, spender: ContractAddress, amount: u256) -> bool {
            let owner = get_caller_address();
            self.allowances.entry((owner, spender)).write(amount);
            self.emit(Event::Approval(Approval { owner, spender, value: amount }));
            true
        }
    }

    #[generate_trait]
    impl Internal of InternalTrait {
        fn _transfer(
            ref self: ContractState,
            sender: ContractAddress,
            recipient: ContractAddress,
            amount: u256,
        ) {
            assert!(!recipient.is_zero(), "FOC: transfer to zero");
            let sender_balance = self.balances.entry(sender).read();
            assert!(sender_balance >= amount, "FOC: insufficient balance");
            self.balances.entry(sender).write(sender_balance - amount);
            self.balances.entry(recipient).write(self.balances.entry(recipient).read() + amount);
            self.emit(Event::Transfer(Transfer { from: sender, to: recipient, value: amount }));
        }
    }
}
