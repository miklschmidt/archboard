//! The renderer core's drawing contract and its scene (ADR 0059).
//!
//! Layout answers a drawing ([`drawing`], [`request`]). Painting
//! (`archboard-painting`) turns it into a [`scene::Scene`]: the ordered and
//! positioned list of what the picture is made of, as typed values. Each
//! frontend paints the scene; the SVG painter is the `archboard-svg` crate. A
//! picture's key is read back from its scene ([`legend`]), and an enum's value
//! is spelt by its name ([`names`]).

pub mod drawing;
pub mod legend;
pub mod names;
pub mod request;
pub mod scene;
mod sequence_picture;
