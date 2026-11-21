//! Flow part measures: the size of each part a sequence or a flowchart places,
//! measured where the painter draws it from.
//!
//! A flow layout learns a part's size here and never reads the painter's sizes,
//! which stay private to this crate (ADR 0088). The layout keeps where parts
//! go and how far apart; a part's own geometry, from its outer box inward, is
//! answered here and drawn by the painter from the same private sheet.

mod cards;
mod fragments;
mod messages;
mod shapes;
mod tab;

pub use cards::{ColumnLimits, HeadCard, sequence_cards};
pub(crate) use fragments::guard_words;
pub use fragments::{FragmentHead, fragment_bounds, fragment_head};
pub use messages::{
    ArrowEnds, MessagePlate, activation_span, message_ends, message_plate, note_plate, self_loop,
};
pub use shapes::{ShapeWords, shape_words};
pub use tab::flow_tab;

/// A stretch across the page.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Span {
    /// Where it starts.
    pub x: f64,
    /// How wide it is.
    pub width: f64,
}
