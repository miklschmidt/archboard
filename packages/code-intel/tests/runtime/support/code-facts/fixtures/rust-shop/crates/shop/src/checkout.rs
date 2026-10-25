use ledger::money::{self, Money};
use ledger::{record as book, Account};

/// Check out: post the basket and read what it holds.
pub fn run() {
    let entry = book(5);
    let held = entry.balance();
    let total: Money = ledger::money::Money::from_cents(held);
    let _ = (total.cents, money::ZERO.cents, ledger::cents!(2));
}
