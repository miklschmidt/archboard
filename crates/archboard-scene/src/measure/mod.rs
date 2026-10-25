//! How wide words are and where they break, in the faces a drawing names: the
//! core's text (`archboard-text`), and the measures of the subjects a layout
//! places, settled before it places them.
//!
//! Text width is shaped, never estimated, and never asked of the place that
//! draws: every layout and every painter reads the same numbers from here
//! (ADR 0057).

use archboard_text::{Face, Paragraph};

use crate::drawing::{DiagramFont, FontFamily};
use crate::js;

mod cards;
mod far;
mod labels;

pub use cards::{CardWords, measure_node};
pub use far::{FarBox, FarSubject, far_size_for};
pub use labels::{measure_caption, measure_label, message_lines, note_lines};

/// The face a font names: Onest or DM Mono, at 400 or at 500. A weight that
/// is not 500 is the regular face, the only other weight the files hold.
pub fn face(font: DiagramFont) -> Face {
    match (font.family, font.weight) {
        (FontFamily::Sans, 500) => Face::SansMedium,
        (FontFamily::Sans, _) => Face::SansRegular,
        (FontFamily::Mono, 500) => Face::MonoMedium,
        (FontFamily::Mono, _) => Face::MonoRegular,
    }
}

/// How wide one line of words is set, to a hundredth of a unit.
pub fn width(text: &str, font: DiagramFont, size: f64) -> f64 {
    js::round(set_width(text, font, size) * 100.0) / 100.0
}

/// How wide one line of words is set, as the text crate gives it.
pub(crate) fn set_width(text: &str, font: DiagramFont, size: f64) -> f64 {
    archboard_text::width(face(font), text, size)
}

/// Words prepared to be broken into lines in a face at a size.
pub fn paragraph(text: &str, font: DiagramFont, size: f64) -> Paragraph {
    Paragraph::new(face(font), size, text)
}

/// The ellipsis a cut line ends in.
const ELLIPSIS: &str = "…";

/// The line, or as much of it as fits the room followed by an ellipsis.
///
/// Each character is measured on its own, which is very slightly wider than
/// measuring the prefix, so a cut line never comes out over budget.
pub fn truncate(text: &str, font: DiagramFont, size: f64, room: f64) -> String {
    if width(text, font, size) <= room {
        return text.to_owned();
    }
    let characters: Vec<char> = text.chars().collect();
    let ellipsis = width(ELLIPSIS, font, size);
    let mut used = 0.0;
    let mut kept = 0;
    for character in &characters {
        let next = used + width(&character.to_string(), font, size);
        if next + ellipsis > room {
            break;
        }
        used = next;
        kept += 1;
    }
    if kept == 0 {
        return ELLIPSIS.to_owned();
    }
    let head: String = characters[..kept].iter().collect();
    format!("{}{ELLIPSIS}", js::trim_end(&head))
}

/// The size a title is set at: the largest step, at or below the size it
/// earned, where the whole title fits its run, and never below the floor.
pub fn fitted_size(
    label: &str,
    font: DiagramFont,
    earned: f64,
    budget: f64,
    floor: f64,
    step: f64,
) -> f64 {
    let mut size = earned;
    while size > floor && width(label, font, size) > budget {
        size = js::js_max(floor, size - step);
    }
    size
}
