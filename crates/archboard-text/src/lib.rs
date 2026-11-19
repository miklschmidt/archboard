//! The renderer core's text (ADR 0059): the faces a picture's words are set
//! in, carried in the build; a run of words shaped into glyphs with `harfrust`;
//! a paragraph broken into lines at a width; and each glyph's outline, drawn
//! by Skrifa.
//!
//! Every width a layout reads and every glyph a painter draws comes from
//! here, so every place draws a picture to the same numbers and no picture
//! needs a font loaded.

mod faces;
mod outline;
mod paragraph;
mod shape;

pub use faces::Face;
pub use outline::{Segment, outline};
pub use paragraph::Paragraph;
pub use shape::{shape, width};

#[cfg(test)]
mod tests;
