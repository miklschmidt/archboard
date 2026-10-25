//! The block engine (TASK-349, TASK-351): every block is laid out on its own
//! from its cards and child blocks, Graphviz ranking the cards and the track
//! router drawing their lines, and a block of blocks packed with the trunks
//! between them routed round them (`packing`). Drawn as blocks, every
//! container and group region is a block; drawn inline (Track), only the
//! board, every group region packed whole and every column a block folds
//! into are, and every other container and region is a cluster of the block
//! that lays it out (`tree.rs`).

pub(crate) mod assembly;
pub(crate) mod card_graph;
pub(crate) mod card_layout;
pub(crate) mod choosing;
pub(crate) mod clusters;
pub(crate) mod cycles;
pub(crate) mod fold;
pub(crate) mod fold_layout;
pub(crate) mod headers;
pub(crate) mod holding;
pub(crate) mod inline;
pub(crate) mod label_rules;
pub(crate) mod laid;
pub(crate) mod laying;
pub(crate) mod leaves;
pub(crate) mod lone;
pub(crate) mod nested;
pub(crate) mod orders;
pub(crate) mod packing;
pub(crate) mod place;
pub(crate) mod projection;
pub(crate) mod readback;
pub(crate) mod routing;
pub(crate) mod settle;
pub(crate) mod sides;
pub(crate) mod stacking;
pub(crate) mod steps;
#[cfg(test)]
mod steps_tests;
pub(crate) mod tree;
pub(crate) mod walls;
pub(crate) mod weighing;
pub(crate) mod wraps;
