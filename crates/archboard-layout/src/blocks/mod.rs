//! Blocks reserves measured source cells and channels in `planned`.
//! Track retains compound packing, local Graphviz ranks, and route settlement.
//! `place` selects one engine without a whole-board fallback between them.

pub(crate) mod assembly;
pub(crate) mod card_graph;
pub(crate) mod card_layout;
pub(crate) mod choosing;
pub(crate) mod clusters;
pub(crate) mod composition;
pub(crate) mod cycles;
pub(crate) mod fold;
pub(crate) mod fold_layout;
pub(crate) mod headers;
pub(crate) mod holding;
pub(crate) mod inline;
pub(crate) mod label_rules;
pub(crate) mod laid;
pub(crate) mod leaves;
mod legacy;
pub(crate) mod lone;
pub(crate) mod orders;
pub(crate) mod packing;
pub(crate) mod peers;
pub(crate) mod place;
mod planned;
pub(crate) mod projection;
pub(crate) mod readback;
pub(crate) mod routing;
pub(crate) mod settle;
pub(crate) mod sides;
pub(crate) mod steps;
#[cfg(test)]
mod steps_tests;
pub(crate) mod tree;
pub(crate) mod walls;
pub(crate) mod wraps;
