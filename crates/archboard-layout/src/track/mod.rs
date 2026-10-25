//! The track router (TASK-349): a block's placement read back as bands of
//! items, and every line inside it drawn on tracks of its own in the channels
//! between them.

pub mod chains;
pub mod channels;
pub mod clear;
pub mod columns;
pub mod containers;
pub mod graphviz;
pub mod grid;
pub mod hold_slots;
pub mod jogs;
pub mod label_runs;
pub mod labels;
pub mod parting;
pub mod points;
pub mod readings;
pub mod relay;
pub mod route;
pub mod scene;
pub mod score;
pub mod sides;
pub mod spacing;
pub mod straighten;
pub mod stranded;
pub mod sweep;
pub mod title_rows;
pub mod tracks;
pub mod wrap_columns;
