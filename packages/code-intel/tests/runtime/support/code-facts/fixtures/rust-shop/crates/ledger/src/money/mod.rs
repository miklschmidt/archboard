/// An amount of money.
pub struct Money {
    pub cents: i64,
}

impl Money {
    pub fn from_cents(cents: i64) -> Self {
        Money { cents }
    }
}

/// No money.
pub const ZERO: Money = Money { cents: 0 };

/// The currency of every amount.
pub static CURRENCY: &str = "EUR";

/// Whole cents.
pub type Cents = i64;

/// Which way money moves.
pub enum Kind {
    Debit,
    Credit,
}
