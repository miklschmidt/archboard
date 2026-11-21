//! What a picture carries beside its drawing: the legend entries of the key
//! read back from the drawn picture ([`entries`]), the symbol each entry is drawn with
//! ([`symbols`]), and the title, legend and frame of an exported picture
//! ([`export`]).

mod entries;
mod export;
mod symbols;

pub(super) use export::{exported_name, framed_for_export, placed_on};
