//! The renderer core's drawing contract, its scene, and the painter that turns
//! a drawing into a scene (ADR 0059).
//!
//! Layout answers a drawing ([`drawing`], [`request`]). The painter
//! ([`paint::paint`]) turns it into a [`scene::Scene`]: the ordered and
//! positioned list of what the picture is made of, as typed values. Each
//! frontend paints the scene; the SVG painter is the `archboard-svg` crate.
//!
//! Words are shaped and broken by the core's own text ([`measure_label`], over the
//! `archboard-text` crate), and a run of words carries its glyphs, so every
//! painter draws the same glyphs at the same places. A flow layout learns each
//! part's size from Flow part measures ([`sequence_cards`] and its siblings), never
//! from the painter's sizes, which stay the crate's own (ADR 0088).

pub mod drawing;
mod flow_parts;
pub mod geometry;
mod measure;
pub mod names;
pub mod paint;
pub mod request;
mod route;
pub mod scene;
mod sequence_picture;
mod sizes;

pub use flow_parts::{
    ArrowEnds, ColumnLimits, FragmentHead, HeadCard, MessagePlate, ShapeWords, Span,
    activation_span, flow_tab, fragment_bounds, fragment_head, message_ends, message_plate,
    note_plate, self_loop, sequence_cards, shape_words,
};
pub use measure::{CardWords, LabelPlates, Part, measure_label, measure_node};
