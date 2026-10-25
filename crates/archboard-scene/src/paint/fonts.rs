//! The faces a diagram is drawn in. The renderer registers its own type under
//! names of its own, so the file a browser draws from is the file the host
//! measured. Two weights, and only two: 400 and 500 ship as files.

use crate::drawing::{DiagramFont, FontFamily};
use crate::markup::Attrs;

/// The names the document registers. Deliberately not the shell's own names.
pub const SANS_CSS_FAMILY: &str = "Archboard Diagram Sans";
pub const MONO_CSS_FAMILY: &str = "Archboard Diagram Mono";

/// The stacks a document names, family first and then a generic.
pub const SANS_STACK: &str = "\"Archboard Diagram Sans\", ui-sans-serif, system-ui, sans-serif";
pub const MONO_STACK: &str = "\"Archboard Diagram Mono\", ui-monospace, monospace";

/// One registered face: its family and weight, its CSS family, and its file.
#[derive(Debug)]
pub struct Face {
    pub weight: u16,
    pub css_family: &'static str,
    pub file: &'static str,
}

/// Every face the document registers, used or not, so the stylesheet is the
/// same shape in every render.
pub const FACES: [Face; 4] = [
    Face {
        weight: 400,
        css_family: SANS_CSS_FAMILY,
        file: "Onest-wght-v1.000.ttf",
    },
    Face {
        weight: 500,
        css_family: SANS_CSS_FAMILY,
        file: "Onest-Medium-v1.000.ttf",
    },
    Face {
        weight: 400,
        css_family: MONO_CSS_FAMILY,
        file: "DMMono-Regular-v1.000.ttf",
    },
    Face {
        weight: 500,
        css_family: MONO_CSS_FAMILY,
        file: "DMMono-Medium-v1.000.ttf",
    },
];

/// Where the Archboard server serves the face files from.
pub const FONT_URL_PREFIX: &str = "/assets/diagram-fonts";

/// A card's name, and a container's or a flow's on its header slab.
pub const CARD_TITLE_FONT: DiagramFont = DiagramFont {
    family: FontFamily::Sans,
    weight: 500,
};
/// What a card, a container or a flow is responsible for.
pub const CARD_NOTE_FONT: DiagramFont = DiagramFont {
    family: FontFamily::Sans,
    weight: 400,
};
/// What a connection carries: small, technical, and on a plate.
pub const PILL_FONT: DiagramFont = DiagramFont {
    family: FontFamily::Sans,
    weight: 500,
};

/// The family and weight attributes a piece of text carries.
pub fn font_attributes(font: DiagramFont) -> Attrs {
    let family = match font.family {
        FontFamily::Mono => MONO_STACK,
        FontFamily::Sans => SANS_STACK,
    };
    Attrs::new()
        .set("font-family", family)
        .set("font-weight", f64::from(font.weight))
}
