//! The block engine as Track runs it (TASK-349): the board, every group
//! region packed whole and every column a block folds into are blocks, each
//! laid out on its own from its cards and child blocks, Graphviz ranking them
//! and the track router drawing their lines; every container and every other
//! group region is drawn inline, as a cluster of the block that lays it out.

pub(crate) mod assembly;
pub(crate) mod card_graph;
pub(crate) mod card_layout;
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
pub(crate) mod place;
pub(crate) mod projection;
pub(crate) mod readback;
pub(crate) mod routing;
pub(crate) mod settle;
pub(crate) mod sides;
pub(crate) mod stacking;
pub(crate) mod steps;
pub(crate) mod tree;
pub(crate) mod walls;
pub(crate) mod weighing;
pub(crate) mod wraps;
