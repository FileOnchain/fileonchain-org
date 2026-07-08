//! Tests for the FOCAT token's bridge and admin surface. Run with `scarb test`.

use fileonchain::foc_token::{
    IERC20Dispatcher, IERC20DispatcherTrait, ITokenAdminDispatcher, ITokenAdminDispatcherTrait,
};
use starknet::syscalls::deploy_syscall;
use starknet::{ContractAddress, SyscallResultTrait};

const SUPPLY: u256 = 1_000_000_000_000000000000000000;
const FOCAT_UNIT: u256 = 1_000000000000000000;

fn admin() -> ContractAddress {
    0xAD.try_into().unwrap()
}

fn bridge() -> ContractAddress {
    0xB41D6E.try_into().unwrap()
}

fn alice() -> ContractAddress {
    0xA11CE.try_into().unwrap()
}

fn as_caller(who: ContractAddress) {
    starknet::testing::set_contract_address(who);
}

fn deploy_token(initial_supply: u256) -> (IERC20Dispatcher, ITokenAdminDispatcher) {
    let mut args = array![];
    admin().serialize(ref args);
    initial_supply.serialize(ref args);
    admin().serialize(ref args);
    let (address, _) = deploy_syscall(
        fileonchain::foc_token::FocToken::TEST_CLASS_HASH.try_into().unwrap(), 0, args.span(), false,
    )
        .unwrap_syscall();
    (IERC20Dispatcher { contract_address: address }, ITokenAdminDispatcher { contract_address: address })
}

#[test]
fn bridge_mints_and_burns() {
    let (token, token_admin) = deploy_token(SUPPLY);
    as_caller(admin());
    token_admin.set_bridge(bridge(), true);
    assert!(token_admin.is_bridge(bridge()));

    // Destination side: arriving supply mints to the recipient.
    as_caller(bridge());
    token_admin.bridge_mint(alice(), 5 * FOCAT_UNIT);
    assert_eq!(token.balance_of(alice()), 5 * FOCAT_UNIT);
    assert_eq!(token.total_supply(), SUPPLY + 5 * FOCAT_UNIT);

    // Source side: departing supply burns from the bridge's own balance.
    token_admin.bridge_mint(bridge(), 3 * FOCAT_UNIT);
    token_admin.bridge_burn(3 * FOCAT_UNIT);
    assert_eq!(token.balance_of(bridge()), 0);
    assert_eq!(token.total_supply(), SUPPLY + 5 * FOCAT_UNIT);
}

#[test]
fn remote_chain_deploys_with_zero_supply() {
    let (token, _) = deploy_token(0);
    assert_eq!(token.total_supply(), 0);
}

#[test]
#[should_panic(expected: ("FOCAT: not a bridge", 'ENTRYPOINT_FAILED'))]
fn unapproved_bridge_cannot_mint() {
    let (_, token_admin) = deploy_token(SUPPLY);
    as_caller(alice());
    token_admin.bridge_mint(alice(), FOCAT_UNIT);
}

#[test]
#[should_panic(expected: ("FOCAT: not a bridge", 'ENTRYPOINT_FAILED'))]
fn revoked_bridge_cannot_burn() {
    let (_, token_admin) = deploy_token(SUPPLY);
    as_caller(admin());
    token_admin.set_bridge(bridge(), true);
    as_caller(bridge());
    token_admin.bridge_mint(bridge(), FOCAT_UNIT);
    as_caller(admin());
    token_admin.set_bridge(bridge(), false);
    as_caller(bridge());
    token_admin.bridge_burn(FOCAT_UNIT);
}

#[test]
#[should_panic(expected: ("FOCAT: not admin", 'ENTRYPOINT_FAILED'))]
fn non_admin_cannot_set_bridge() {
    let (_, token_admin) = deploy_token(SUPPLY);
    as_caller(alice());
    token_admin.set_bridge(bridge(), true);
}

#[test]
#[should_panic(expected: ("FOCAT: not admin", 'ENTRYPOINT_FAILED'))]
fn non_admin_cannot_upgrade() {
    let (_, token_admin) = deploy_token(SUPPLY);
    as_caller(alice());
    token_admin.upgrade(fileonchain::foc_token::FocToken::TEST_CLASS_HASH.try_into().unwrap());
}
