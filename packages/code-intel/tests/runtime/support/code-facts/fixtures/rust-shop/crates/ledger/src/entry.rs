use super::Account;
use crate::money::Money;

/// One entry of the ledger.
pub struct Entry {
    pub amount: Money,
    note: String,
}

impl Entry {
    pub fn new(amount: Money) -> Self {
        Self { amount, note: String::new() }
    }

    fn noted(&self) -> &str {
        &self.note
    }
}

impl Account for Entry {
    fn balance(&self) -> i64 {
        self.amount.cents
    }
}

/// Post an amount of cents.
pub fn post(cents: i64) -> Entry {
    crate::audit();
    let entry = Entry::new(Money::from_cents(cents));
    let _ = entry.noted();
    entry
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn posts() {
        assert_eq!(post(1).balance(), 1);
    }
}
