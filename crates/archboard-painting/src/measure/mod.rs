//! How wide words are and where they break, in the faces a drawing names: the
//! core's text (`archboard-text`), and the measures of the subjects a layout
//! places, settled before it places them.
//!
//! Text width is shaped, never estimated, and never asked of the place that
//! draws: every layout and every painter reads the same numbers from here
//! (ADR 0059).

use archboard_text::{Face, Paragraph};

use archboard_scene::drawing::{DiagramFont, FontFamily};

mod cards;
mod far;
mod flow_frame;
mod labels;

#[cfg(test)]
pub(crate) use cards::TAB_NEAR;
pub use cards::{CardWords, Part, measure_node};
pub(crate) use cards::{door_far_runs, tab_far, tab_runs, tag_end, tag_top};
pub(crate) use far::{FarCard, FarWords, far_scale_for, far_words};
pub use labels::{LabelPlates, measure_label};
pub(crate) use labels::{message_lines, note_lines};

/// The face a font names: Onest at 400, 500 or 700, or Maple Mono NL at 400 or
/// 500. A weight the files do not hold is the regular face.
pub(crate) fn face(font: DiagramFont) -> Face {
    match (font.family, font.weight) {
        (FontFamily::Sans, 500) => Face::SansMedium,
        (FontFamily::Sans, 700) => Face::SansBold,
        (FontFamily::Sans, _) => Face::SansRegular,
        (FontFamily::Mono, 500) => Face::MonoMedium,
        (FontFamily::Mono, _) => Face::MonoRegular,
    }
}

/// How wide one line of words is set, to a hundredth of a unit.
pub(crate) fn width(text: &str, font: DiagramFont, size: f64) -> f64 {
    archboard_ecma::round(set_width(text, font, size) * 100.0) / 100.0
}

/// How wide one line of words is set, as the text crate gives it.
fn set_width(text: &str, font: DiagramFont, size: f64) -> f64 {
    archboard_text::width(face(font), text, size)
}

/// Words prepared to be broken into lines in a face at a size.
fn paragraph(text: &str, font: DiagramFont, size: f64) -> Paragraph {
    Paragraph::new(face(font), size, text)
}

/// `text.trimEnd()`.
fn trim_end(text: &str) -> &str {
    text.trim_end_matches(archboard_ecma::is_space)
}

/// `text.split(/\s+/u)`: the pieces between runs of white space, an empty one
/// at either end where the text starts or ends with white space.
fn split_spaces(text: &str) -> Vec<&str> {
    let mut pieces = Vec::new();
    let mut start = 0;
    let mut in_space = false;
    for (at, character) in text.char_indices() {
        if archboard_ecma::is_space(character) {
            if !in_space {
                pieces.push(&text[start..at]);
                in_space = true;
            }
        } else if in_space {
            start = at;
            in_space = false;
        }
    }
    pieces.push(if in_space { "" } else { &text[start..] });
    pieces
}

/// The ellipsis a cut line ends in.
const ELLIPSIS: &str = "…";

/// The line, or as much of it as fits the room followed by an ellipsis.
///
/// Each character is measured on its own, which is very slightly wider than
/// measuring the prefix, so a cut line never comes out over budget.
pub(crate) fn truncate(text: &str, font: DiagramFont, size: f64, room: f64) -> String {
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
    format!("{}{ELLIPSIS}", trim_end(&head))
}

/// A path, or as much of its tail as fits the room after an ellipsis. The tail
/// says what the path names, so it is what stays, from a folder's start when one fits.
fn keep_tail(path: &str, font: DiagramFont, size: f64, room: f64) -> String {
    if width(path, font, size) <= room {
        return path.to_owned();
    }
    let characters: Vec<char> = path.chars().collect();
    let budget = room - width(ELLIPSIS, font, size);
    let mut used = 0.0;
    let mut kept = 0;
    for character in characters.iter().rev() {
        let next = used + width(&character.to_string(), font, size);
        if next > budget {
            break;
        }
        used = next;
        kept += 1;
    }
    let tail = &characters[characters.len() - kept..];
    let folder = tail.iter().position(|character| *character == '/');
    let from = folder.unwrap_or(0);
    format!("{ELLIPSIS}{}", tail[from..].iter().collect::<String>())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_on_white_space() {
        assert_eq!(split_spaces(" a  b "), vec!["", "a", "b", ""]);
        assert_eq!(split_spaces("a"), vec!["a"]);
        assert_eq!(split_spaces(""), vec![""]);
    }
}
