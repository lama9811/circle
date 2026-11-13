//! CircleSave — a rotating savings circle (chama / susu / tanda) run by a
//! Soroban contract instead of a human treasurer.
//!
//! Lifecycle of one circle:
//! 1. `create_circle` — organizer fixes the amount, round length and payout order.
//! 2. `join` — every member locks a security deposit equal to one contribution.
//!    The circle becomes Active only once every deposit is in.
//! 3. `contribute` — each member pays the round amount.
//! 4. `payout` — once everyone has paid, the full pot goes to this round's
//!    recipient and the next round starts.
//! 5. `mark_default` — after the deadline, anyone can use a late member's
//!    deposit to cover their share so the round can still pay out.
//! 6. `close` — after the last round, remaining deposits are returned.
//!
//! Every contribution updates the member's portable reputation
//! (on-time payments / total payments), readable via `get_reputation`.
#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, token,
    Address, Env, Vec,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    CircleNotFound = 1,
    InvalidAmount = 2,
    TooFewMembers = 3,
    DuplicateMember = 4,
    NotAMember = 5,
    AlreadyJoined = 6,
    NotForming = 7,
    NotActive = 8,
    AlreadyPaid = 9,
    RoundIncomplete = 10,
    DeadlineNotPassed = 11,
    NoDepositLeft = 12,
    NotCompleted = 13,
    InvalidRoundLength = 14,
    TooManyMembers = 15,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Status {
    /// Waiting for every member to join and lock a deposit.
    Forming,
    /// Rounds are running.
    Active,
    /// Every member has received the pot; deposits not yet returned.
    Completed,
    /// Deposits returned. Nothing left to do.
    Closed,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Circle {
    pub id: u32,
    pub organizer: Address,
    pub token: Address,
    /// Contribution per member per round (in token base units).
    pub amount: i128,
    /// Ordered member list; the order is the payout order.
    pub members: Vec<Address>,
    /// Seconds each round lasts before a non-payer can be marked in default.
    pub round_secs: u64,
    /// Current round, 0-based. Round `r` pays `members[r]`.
    pub round: u32,
    /// Unix timestamp after which unpaid members can be marked in default.
    pub deadline: u64,
    pub joined: Vec<bool>,
    pub paid: Vec<bool>,
    pub deposits: Vec<i128>,
    pub defaults: Vec<u32>,
    /// Funds collected for the current round.
    pub pot: i128,
    pub status: Status,
}

#[contracttype]
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct Reputation {
    pub on_time: u32,
    pub total: u32,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Count,
    Circle(u32),
    Rep(Address),
    MemberCircles(Address),
}

const MAX_MEMBERS: u32 = 20;
// ~30 days of ledgers at 5s per ledger; bumped on every write.
const TTL_THRESHOLD: u32 = 17_280 * 7;
const TTL_EXTEND: u32 = 17_280 * 30;

#[contract]
pub struct CircleSave;

#[contractimpl]
impl CircleSave {
    /// Create a circle. Returns its id. The organizer does not have to be a member.
    pub fn create_circle(
        env: Env,
        organizer: Address,
        token: Address,
        amount: i128,
        members: Vec<Address>,
        round_secs: u64,
    ) -> u32 {
        organizer.require_auth();
        if amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        if round_secs == 0 {
            panic_with_error!(&env, Error::InvalidRoundLength);
        }
        let n = members.len();
        if n < 2 {
            panic_with_error!(&env, Error::TooFewMembers);
        }
        if n > MAX_MEMBERS {
            panic_with_error!(&env, Error::TooManyMembers);
        }
        for i in 0..n {
            for j in (i + 1)..n {
                if members.get_unchecked(i) == members.get_unchecked(j) {
                    panic_with_error!(&env, Error::DuplicateMember);
                }
            }
        }

        let id: u32 = env.storage().instance().get(&DataKey::Count).unwrap_or(0);
        env.storage().instance().set(&DataKey::Count, &(id + 1));
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND);

        let circle = Circle {
            id,
            organizer: organizer.clone(),
            token,
            amount,
            members: members.clone(),
            round_secs,
            round: 0,
            deadline: 0,
            joined: filled(&env, n, false),
            paid: filled(&env, n, false),
            deposits: filled(&env, n, 0i128),
            defaults: filled(&env, n, 0u32),
            pot: 0,
            status: Status::Forming,
        };
        save(&env, &circle);

        for m in members.iter() {
            let key = DataKey::MemberCircles(m.clone());
            let mut ids: Vec<u32> = env.storage().persistent().get(&key).unwrap_or(Vec::new(&env));
            ids.push_back(id);
            env.storage().persistent().set(&key, &ids);
            env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
        }

        #[allow(deprecated)]
        env.events()
            .publish((symbol_short!("created"), id), (organizer, amount, n));
        id
    }

    /// Join a circle by locking a security deposit equal to one contribution.
    pub fn join(env: Env, circle_id: u32, member: Address) {
        member.require_auth();
        let mut c = load(&env, circle_id);
        if c.status != Status::Forming {
            panic_with_error!(&env, Error::NotForming);
        }
        let i = index_of(&env, &c, &member);
        if c.joined.get_unchecked(i) {
            panic_with_error!(&env, Error::AlreadyJoined);
        }

        token::Client::new(&env, &c.token).transfer(
            &member,
            &env.current_contract_address(),
            &c.amount,
        );
        c.joined.set(i, true);
        c.deposits.set(i, c.amount);

        if c.joined.iter().all(|j| j) {
            c.status = Status::Active;
            c.deadline = env.ledger().timestamp() + c.round_secs;
        }
        save(&env, &c);
        #[allow(deprecated)]
        env.events()
            .publish((symbol_short!("joined"), circle_id), member);
    }

    /// Pay this round's contribution.
    pub fn contribute(env: Env, circle_id: u32, member: Address) {
        member.require_auth();
        let mut c = load(&env, circle_id);
        if c.status != Status::Active {
            panic_with_error!(&env, Error::NotActive);
        }
        let i = index_of(&env, &c, &member);
        if c.paid.get_unchecked(i) {
            panic_with_error!(&env, Error::AlreadyPaid);
        }

        token::Client::new(&env, &c.token).transfer(
            &member,
            &env.current_contract_address(),
            &c.amount,
        );
        c.paid.set(i, true);
        c.pot += c.amount;

        let on_time = env.ledger().timestamp() <= c.deadline;
        bump_rep(&env, &member, on_time);
        save(&env, &c);
        #[allow(deprecated)]
        env.events().publish(
            (symbol_short!("paid"), circle_id),
            (member, c.round, on_time),
        );
    }

    /// If every member has paid (or been covered), send the pot to this
    /// round's recipient and start the next round. Callable by anyone.
    pub fn payout(env: Env, circle_id: u32) -> Address {
        let mut c = load(&env, circle_id);
        if c.status != Status::Active {
            panic_with_error!(&env, Error::NotActive);
        }
        if !c.paid.iter().all(|p| p) {
            panic_with_error!(&env, Error::RoundIncomplete);
        }

        let recipient = c.members.get_unchecked(c.round);
        let pot = c.pot;
        token::Client::new(&env, &c.token).transfer(
            &env.current_contract_address(),
            &recipient,
            &pot,
        );

        let finished_round = c.round;
        c.pot = 0;
        c.paid = filled(&env, c.members.len(), false);
        c.round += 1;
        if c.round >= c.members.len() {
            c.status = Status::Completed;
            c.deadline = 0;
        } else {
            c.deadline = env.ledger().timestamp() + c.round_secs;
        }
        save(&env, &c);
        #[allow(deprecated)]
        env.events().publish(
            (symbol_short!("payout"), circle_id),
            (recipient.clone(), finished_round, pot),
        );
        recipient
    }

    /// After the round deadline, use a non-paying member's deposit to cover
    /// their share. Lowers their reputation (counts as a missed payment).
    pub fn mark_default(env: Env, circle_id: u32, member: Address) {
        let mut c = load(&env, circle_id);
        if c.status != Status::Active {
            panic_with_error!(&env, Error::NotActive);
        }
        if env.ledger().timestamp() <= c.deadline {
            panic_with_error!(&env, Error::DeadlineNotPassed);
        }
        let i = index_of(&env, &c, &member);
        if c.paid.get_unchecked(i) {
            panic_with_error!(&env, Error::AlreadyPaid);
        }
        let deposit = c.deposits.get_unchecked(i);
        if deposit < c.amount {
            panic_with_error!(&env, Error::NoDepositLeft);
        }

        // The deposit already sits in the contract: move it into the pot.
        c.deposits.set(i, deposit - c.amount);
        c.pot += c.amount;
        c.paid.set(i, true);
        c.defaults.set(i, c.defaults.get_unchecked(i) + 1);
        bump_rep(&env, &member, false);
        save(&env, &c);
        #[allow(deprecated)]
        env.events().publish(
            (symbol_short!("default"), circle_id),
            (member, c.round),
        );
    }

    /// After the last payout, return every remaining deposit. Callable by anyone.
    pub fn close(env: Env, circle_id: u32) {
        let mut c = load(&env, circle_id);
        if c.status != Status::Completed {
            panic_with_error!(&env, Error::NotCompleted);
        }
        let tok = token::Client::new(&env, &c.token);
        for i in 0..c.members.len() {
            let d = c.deposits.get_unchecked(i);
            if d > 0 {
                tok.transfer(&env.current_contract_address(), &c.members.get_unchecked(i), &d);
                c.deposits.set(i, 0);
            }
        }
        c.status = Status::Closed;
        save(&env, &c);
        #[allow(deprecated)]
        env.events()
            .publish((symbol_short!("closed"), circle_id), ());
    }

    pub fn get_circle(env: Env, circle_id: u32) -> Circle {
        load(&env, circle_id)
    }

    pub fn get_reputation(env: Env, member: Address) -> Reputation {
        env.storage()
            .persistent()
            .get(&DataKey::Rep(member))
            .unwrap_or_default()
    }

    pub fn get_member_circles(env: Env, member: Address) -> Vec<u32> {
        env.storage()
            .persistent()
            .get(&DataKey::MemberCircles(member))
            .unwrap_or(Vec::new(&env))
    }

    pub fn circle_count(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::Count).unwrap_or(0)
    }
}

fn filled<T>(env: &Env, n: u32, v: T) -> Vec<T>
where
    T: Clone + soroban_sdk::IntoVal<Env, soroban_sdk::Val> + soroban_sdk::TryFromVal<Env, soroban_sdk::Val>,
{
    let mut out = Vec::new(env);
    for _ in 0..n {
        out.push_back(v.clone());
    }
    out
}

fn load(env: &Env, id: u32) -> Circle {
    env.storage()
        .persistent()
        .get(&DataKey::Circle(id))
        .unwrap_or_else(|| panic_with_error!(env, Error::CircleNotFound))
}

fn save(env: &Env, c: &Circle) {
    let key = DataKey::Circle(c.id);
    env.storage().persistent().set(&key, c);
    env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
}

fn index_of(env: &Env, c: &Circle, member: &Address) -> u32 {
    c.members
        .first_index_of(member)
        .unwrap_or_else(|| panic_with_error!(env, Error::NotAMember))
}

fn bump_rep(env: &Env, member: &Address, on_time: bool) {
    let key = DataKey::Rep(member.clone());
    let mut r: Reputation = env.storage().persistent().get(&key).unwrap_or_default();
    r.total += 1;
    if on_time {
        r.on_time += 1;
    }
    env.storage().persistent().set(&key, &r);
    env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
}

#[cfg(test)]
mod test;
