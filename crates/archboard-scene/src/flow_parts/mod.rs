//! Flow part measures: the size of each part a sequence or a flowchart places,
//! measured where the painter draws it from.
//!
//! A flow layout learns a part's size here and never reads the painter's sizes,
//! which stay private to this crate (ADR 0088). The layout keeps where parts
//! go and how far apart; a part's own geometry, from its outer box inward, is
//! answered here and drawn by the painter from the same private sheet.

mod cards;
mod flow_tab;
mod fragments;
mod messages;
mod shapes;

pub use cards::{ColumnLimits, HeadCard, HeadCards, sequence_cards};
pub use flow_tab::{FlowTab, flow_tab};
pub use fragments::{FragmentHead, Size, fragment_bounds, fragment_head};
pub use messages::{
    ArrowEnds, MessagePlate, NotePlate, activation_span, message_ends, message_plate, note_plate,
    self_loop,
};
pub use shapes::{ShapeWords, shape_words};

/// A stretch across the page.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Span {
    /// Where it starts.
    pub x: f64,
    /// How wide it is.
    pub width: f64,
}
