//! The ledger: entries of money, and what an account answers.

mod entry;
pub mod money;

pub use entry::{post as record, Entry};

/// What every account answers.
pub trait Account {
    /// What it holds, in cents.
    fn balance(&self) -> i64;
    /// How it reads.
    fn describe(&self) -> String {
        format!("{} cents", self.balance())
    }
}

/// Counts a post, for the crate's own entries.
pub(crate) fn audit() {}

fn private_helper() -> i64 {
    0
}

/// Cents as a whole number of money.
#[macro_export]
macro_rules! cents {
    ($n:expr) => {
        $n * 100
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn helps() {
        assert_eq!(private_helper(), 0);
    }
}
