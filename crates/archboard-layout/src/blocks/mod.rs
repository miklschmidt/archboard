//! Blocks (TASK-351): every block is laid out on its own from its cards and
//! child blocks, Graphviz ranking the cards and the lane router drawing their
//! lines, and a block of blocks packed with the trunks between them routed
//! round them (`packing`). The picture, every container, every group region
//! and every column a block folds into is a block (`tree.rs`).

pub(crate) mod assembly;
mod card_graph;
mod card_layout;
mod cycles;
mod fanouts;
mod fields;
mod fold;
mod fold_layout;
mod headers;
mod holding;
mod laid;
mod leaves;
mod legacy;
mod line_up;
mod lone;
mod nested;
mod orders;
mod packing;
pub(crate) mod place;
mod planned;
mod projection;
mod routing;
mod settle;
mod sides;
mod steps;
#[cfg(test)]
mod steps_tests;
mod tree;
mod walls;
mod wraps;
