//! The renderer core's drawing contract, its scene, and the painter that turns
//! a drawing into a scene (ADR 0059).
//!
//! Layout answers a drawing ([`drawing`], [`request`]). The painter
//! ([`paint::paint`]) turns it into a [`scene::Scene`]: the ordered and
//! positioned list of what the picture is made of, as typed values. Each
//! frontend paints the scene; the SVG painter is the `archboard-svg` crate.
//!
//! Words are shaped and broken by the core's own text ([`measure`], over the
//! `archboard-text` crate), and a run of words carries its glyphs, so every
//! painter draws the same glyphs at the same places.

pub mod drawing;
pub mod geometry;
pub mod js;
pub mod measure;
pub mod names;
pub mod paint;
pub mod request;
pub mod route;
pub mod scene;
mod sequence_picture;
