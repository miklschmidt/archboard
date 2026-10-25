//! The block engine as Track runs it (TASK-349): the board, every group
//! region packed whole and every column a block folds into are blocks, each
//! laid out on its own from its cards and child blocks, Graphviz ranking them
//! and the track router drawing their lines; every container and every other
//! group region is drawn inline, as a cluster of the block that lays it out.

pub mod assembly;
pub mod card_layout;
pub mod clusters;
pub mod fold;
pub mod fold_layout;
pub mod headers;
pub mod laid;
pub mod laying;
pub mod leaves;
pub mod lone;
pub mod place;
pub mod settle;
pub mod sides;
pub mod stacking;
pub mod steps;
pub mod tree;
pub mod walls;
pub mod weighing;
pub mod wraps;
