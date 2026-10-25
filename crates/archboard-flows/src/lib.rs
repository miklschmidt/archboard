//! The layout of a board's flows (ADR 0057): a variant's flows laid out as a
//! stack of message sequences ([`sequence`]) or as a flowchart
//! ([`flowchart`]), each answered as the paint request the painter
//! (`archboard-scene`) turns into a scene.
//!
//! Text is the host's until the core shapes it (TASK-520.07): its widths and
//! its line breaks ([`text::Text`]). A flowchart is laid out by the track
//! engine, which is the host's until the core holds it (TASK-520.04).

pub mod board;
pub mod flowchart;
mod routes;
pub mod sequence;
pub mod text;
