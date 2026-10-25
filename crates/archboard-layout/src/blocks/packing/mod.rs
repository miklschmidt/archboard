//! A block of blocks, as the Blocks engine lays it out: its child blocks
//! packed in rows or columns (`pack.rs`), the ways to pack them
//! (`packings.rs`), and the trunks between them routed by the orthogonal
//! router (`trunks.rs`).

mod away;
mod edges;
mod open_edge;
mod pack;
mod packings;
mod port_columns;
mod slides;
mod trunks;

pub(crate) use open_edge::{Span, nearest_free, open_stretch};
pub(crate) use pack::{PACK_GAP, PackLayout};
pub(crate) use packings::Packing;
pub(crate) use port_columns::{separate_facing_ports, spread};
pub(crate) use trunks::{TRUNK_CLEARANCE, routed_weighed};
