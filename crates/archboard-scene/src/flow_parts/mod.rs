//! Flow part measures: the size of each part a sequence or a flowchart places,
//! measured where the painter draws it from.
//!
//! A flow layout learns a part's size here and never reads the painter's sizes,
//! which stay private to this crate (ADR 0088). The layout keeps where parts
//! go and how far apart; a part's own geometry, from its outer box inward, is
//! answered here and drawn by the painter from the same private sheet.

mod cards;

pub use cards::{ColumnLimits, HeadCard, HeadCards, sequence_cards};
