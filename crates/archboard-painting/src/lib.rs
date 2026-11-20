//! Painting: the measurer and the painter of the renderer core (ADR 0059). It
//! measures every word a layout places, and paints a settled drawing into the
//! scene (`archboard_scene::scene::Scene`) that every painter draws.
//!
//! Words are shaped and broken by the core's own text ([`measure_label`],
//! [`measure_node`], over the `archboard-text` crate), and a run of words carries
//! its glyphs, so every painter draws the same glyphs at the same places. A flow
//! layout learns each part's size from Flow part measures ([`sequence_cards`] and
//! its siblings), never from the painter's sizes, which stay this crate's own
//! (ADR 0088). [`paint()`] turns a request into its scene, and [`viewer_marks`]
//! gives a viewer the marks the painter draws by.

mod flow_parts;
mod measure;
mod paint;
mod sizes;

pub use flow_parts::{
    ArrowEnds, ColumnLimits, FragmentHead, HeadCard, MessagePlate, ShapeWords, Span,
    activation_span, flow_tab, fragment_bounds, fragment_head, message_ends, message_plate,
    note_plate, self_loop, sequence_cards, shape_words,
};
pub use measure::{CardWords, LabelPlates, Part, measure_label, measure_node};
pub use paint::{
    ViewerMarks, diagram_margin, header_padding, junction_boxes, own_icons, paint,
    straight_card_top_contains, tab_width, viewer_marks,
};
