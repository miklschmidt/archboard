//! The layout of a board's flows (ADR 0057): a variant's flows laid out as a
//! stack of message sequences ([`sequence`]) or as a flowchart
//! ([`flowchart`]), each answered as the paint request the painter
//! (`archboard-scene`) turns into a scene.
//!
//! Every width and line break is the core's own
//! (`archboard_scene::measure`). A flowchart is laid out by the track engine,
//! as an architecture is (`archboard_layout::draw`).

pub mod board;
pub mod flowchart;
pub mod sequence;
