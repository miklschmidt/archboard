//! The renderer core's drawing contract, its scene, and the painter that turns
//! a drawing into a scene (ADR 0057).
//!
//! Layout answers a drawing ([`drawing`], [`request`]). The painter
//! ([`paint::paint`]) turns it into a [`scene::Scene`]: the ordered and
//! positioned list of what the picture is made of. Each frontend paints the
//! scene; the SVG painter is the `archboard-svg` crate.
//!
//! Text is measured by the host ([`measure::Measure`]): the canvas of the place
//! that draws the picture, until the core shapes text itself (TASK-520.07).

pub mod drawing;
pub mod geometry;
pub mod js;
pub mod markup;
pub mod measure;
pub mod paint;
pub mod request;
pub mod route;
pub mod scene;
mod sequence_picture;
