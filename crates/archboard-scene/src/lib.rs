//! The renderer core's drawing contract, its scene, and the painter that turns
//! a drawing into a scene (ADR 0059).
//!
//! Layout answers a drawing ([`drawing`], [`request`]). The painter
//! ([`paint::paint`]) turns it into a [`scene::Scene`]: the ordered and
//! positioned list of what the picture is made of, as typed values. Each
//! frontend paints the scene; the SVG painter is the `archboard-svg` crate.
//!
//! Words are shaped and broken by the core's own text ([`width`], [`measure_label`], over the
//! `archboard-text` crate), and a run of words carries its glyphs, so every
//! painter draws the same glyphs at the same places.

pub mod drawing;
mod ecma;
pub mod geometry;
pub mod js;
mod measure;
pub mod names;
pub mod paint;
pub mod request;
mod route;
pub mod scene;
mod sequence_picture;
mod sizes;

pub use measure::{
    CardWords, fitted_size, measure_flow_frame, measure_label, measure_node, message_lines,
    narrow_label, note_lines, width,
};
