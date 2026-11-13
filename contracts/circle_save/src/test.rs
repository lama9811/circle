#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    vec, Address, Env,
};

const AMOUNT: i128 = 10_0000000; // 10 tokens at 7 decimals
const WEEK: u64 = 7 * 24 * 60 * 60;

struct Setup<'a> {
    env: Env,
    client: CircleSaveClient<'a>,
    token: TokenClient<'a>,
    organizer: Address,
    members: [Address; 3],
}

fn setup<'a>() -> Setup<'a> {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(admin);
    let token = TokenClient::new(&env, &sac.address());
    let minter = StellarAssetClient::new(&env, &sac.address());

    let members = [
        Address::generate(&env),
        Address::generate(&env),
        Address::generate(&env),
    ];
    for m in members.iter() {
        minter.mint(m, &(AMOUNT * 10));
    }

    let id = env.register(CircleSave, ());
    let client = CircleSaveClient::new(&env, &id);
    let organizer = members[0].clone();
    Setup { env, client, token, organizer, members }
}

fn create(s: &Setup) -> u32 {
    let m = &s.members;
    s.client.create_circle(
        &s.organizer,
        &s.token.address,
        &AMOUNT,
        &vec![&s.env, m[0].clone(), m[1].clone(), m[2].clone()],
        &WEEK,
    )
}

fn join_all(s: &Setup, id: u32) {
    for m in s.members.iter() {
        s.client.join(&id, m);
    }
}

#[test]
fn full_circle_three_members_three_rounds() {
    let s = setup();
    let id = create(&s);
    assert_eq!(s.client.get_circle(&id).status, Status::Forming);

    join_all(&s, id);
    let c = s.client.get_circle(&id);
    assert_eq!(c.status, Status::Active);
    assert_eq!(s.token.balance(&s.client.address), AMOUNT * 3); // deposits held

    for round in 0..3u32 {
        for m in s.members.iter() {
            s.client.contribute(&id, m);
        }
        let before = s.token.balance(&s.members[round as usize]);
        let recipient = s.client.payout(&id);
        assert_eq!(recipient, s.members[round as usize]);
        assert_eq!(s.token.balance(&recipient), before + AMOUNT * 3);
    }

    assert_eq!(s.client.get_circle(&id).status, Status::Completed);
    s.client.close(&id);
    assert_eq!(s.client.get_circle(&id).status, Status::Closed);
    assert_eq!(s.token.balance(&s.client.address), 0);

    // Everyone ends exactly where they started: saved and received 30.
    for m in s.members.iter() {
        assert_eq!(s.token.balance(m), AMOUNT * 10);
        let r = s.client.get_reputation(m);
        assert_eq!(r, Reputation { on_time: 3, total: 3 });
        assert_eq!(s.client.get_member_circles(m), vec![&s.env, id]);
    }
}

#[test]
fn payout_requires_everyone_paid() {
    let s = setup();
    let id = create(&s);
    join_all(&s, id);
    s.client.contribute(&id, &s.members[0]);
    s.client.contribute(&id, &s.members[1]);
    let res = s.client.try_payout(&id);
    assert_eq!(res, Err(Ok(ce(Error::RoundIncomplete))));
}

#[test]
fn cannot_contribute_before_everyone_joins() {
    let s = setup();
    let id = create(&s);
    s.client.join(&id, &s.members[0]);
    let res = s.client.try_contribute(&id, &s.members[0]);
    assert_eq!(res, Err(Ok(ce(Error::NotActive))));
}

#[test]
fn rejects_double_payment_and_strangers() {
    let s = setup();
    let id = create(&s);
    join_all(&s, id);
    s.client.contribute(&id, &s.members[0]);
    assert_eq!(
        s.client.try_contribute(&id, &s.members[0]),
        Err(Ok(ce(Error::AlreadyPaid)))
    );
    let stranger = Address::generate(&s.env);
    assert_eq!(
        s.client.try_contribute(&id, &stranger),
        Err(Ok(ce(Error::NotAMember)))
    );
    assert_eq!(s.client.try_join(&id, &s.members[0]), Err(Ok(ce(Error::NotForming))));
}

#[test]
fn default_after_payout_is_covered_by_deposit() {
    let s = setup();
    let id = create(&s);
    join_all(&s, id);
    let [a, b, c] = &s.members;

    // Round 0: everyone pays, `a` takes the pot.
    for m in s.members.iter() {
        s.client.contribute(&id, m);
    }
    s.client.payout(&id);

    // Round 1: `a` (already paid out) stops paying.
    s.client.contribute(&id, b);
    s.client.contribute(&id, c);
    assert_eq!(
        s.client.try_mark_default(&id, a),
        Err(Ok(ce(Error::DeadlineNotPassed)))
    );

    s.env.ledger().with_mut(|l| l.timestamp += WEEK + 1);
    s.client.mark_default(&id, a);

    let b_before = s.token.balance(b);
    s.client.payout(&id);
    // `b` still receives the full pot thanks to `a`'s deposit.
    assert_eq!(s.token.balance(b), b_before + AMOUNT * 3);

    let circle = s.client.get_circle(&id);
    assert_eq!(circle.deposits.get_unchecked(0), 0);
    assert_eq!(circle.defaults.get_unchecked(0), 1);
    assert_eq!(s.client.get_reputation(a), Reputation { on_time: 1, total: 2 });

    // A second default by `a` can't be covered.
    s.client.contribute(&id, b);
    s.client.contribute(&id, c);
    s.env.ledger().with_mut(|l| l.timestamp += WEEK + 1);
    assert_eq!(s.client.try_mark_default(&id, a), Err(Ok(ce(Error::NoDepositLeft))));

    // `a` pays late instead: allowed, but not on time.
    s.client.contribute(&id, a);
    s.client.payout(&id);
    assert_eq!(s.client.get_reputation(a), Reputation { on_time: 1, total: 3 });

    s.client.close(&id);
    // `a` gets no deposit back; b and c get theirs.
    assert_eq!(s.token.balance(&s.client.address), 0);
}

#[test]
fn validates_create_inputs() {
    let s = setup();
    let m = &s.members;
    let one = vec![&s.env, m[0].clone()];
    assert_eq!(
        s.client.try_create_circle(&s.organizer, &s.token.address, &AMOUNT, &one, &WEEK),
        Err(Ok(ce(Error::TooFewMembers)))
    );
    let dup = vec![&s.env, m[0].clone(), m[0].clone()];
    assert_eq!(
        s.client.try_create_circle(&s.organizer, &s.token.address, &AMOUNT, &dup, &WEEK),
        Err(Ok(ce(Error::DuplicateMember)))
    );
    let two = vec![&s.env, m[0].clone(), m[1].clone()];
    assert_eq!(
        s.client.try_create_circle(&s.organizer, &s.token.address, &0, &two, &WEEK),
        Err(Ok(ce(Error::InvalidAmount)))
    );
}

/// The contract panics with `Error`; the test client surfaces it as a generic contract error.
fn ce(e: Error) -> soroban_sdk::Error {
    soroban_sdk::Error::from_contract_error(e as u32)
}
