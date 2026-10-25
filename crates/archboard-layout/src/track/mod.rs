//! The track router (TASK-349): a block's placement read back as bands of
//! items, and every line inside it drawn on tracks of its own in the channels
//! between them.

pub(crate) mod chains;
pub(crate) mod channels;
pub(crate) mod clear;
pub(crate) mod columns;
pub(crate) mod containers;
pub(crate) mod graphviz;
pub(crate) mod grid;
pub(crate) mod hold_slots;
pub(crate) mod jogs;
pub(crate) mod label_runs;
pub(crate) mod labels;
pub(crate) mod parting;
pub(crate) mod points;
pub(crate) mod readings;
pub(crate) mod relay;
pub(crate) mod route;
pub(crate) mod scene;
pub(crate) mod score;
pub(crate) mod sides;
pub(crate) mod spacing;
pub(crate) mod straighten;
pub(crate) mod stranded;
pub(crate) mod sweep;
pub(crate) mod title_rows;
pub(crate) mod tracks;
pub(crate) mod wrap_columns;
