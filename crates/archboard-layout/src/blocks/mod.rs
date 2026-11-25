//! The block engine (TASK-349, TASK-351): every block is laid out on its own
//! from its cards and child blocks, Graphviz ranking the cards and the track
//! router drawing their lines, and a block of blocks packed with the trunks
//! between them routed round them (`packing`). Drawn as blocks, every
//! container and group region is a block; drawn inline (Track), only the
//! picture, every group region packed whole and every column a block folds
//! into are, and every other container and region is a cluster of the block
//! that lays it out (`tree.rs`).

mod assembly;
mod card_graph;
mod card_layout;
mod clusters;
mod composition;
mod cycles;
mod fanouts;
mod fold;
mod fold_layout;
mod headers;
mod holding;
mod inline;
mod label_rules;
mod laid;
mod leaves;
mod legacy;
mod lone;
mod nested;
mod orders;
mod packing;
mod peers;
pub(crate) mod place;
mod planned;
mod projection;
mod readback;
mod routing;
mod settle;
mod sides;
mod steps;
#[cfg(test)]
mod steps_tests;
mod tree;
mod walls;
mod wraps;
