//! What a picture carries beside its drawing: the legend entries read back
//! from the drawn picture ([`entries`]), the symbol each entry is drawn with
//! ([`symbols`]), and the title, legend and frame of an exported picture
//! ([`export`]).

mod entries;
mod export;
mod symbols;

pub use entries::{Applied, Drawn, PictureLegend, picture_legend};
pub(super) use export::{exported_name, framed_for_export, placed_on};
