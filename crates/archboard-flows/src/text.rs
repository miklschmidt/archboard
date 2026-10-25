//! What the layout asks of the host's text, until the core shapes text itself
//! (TASK-520.07): the width of a line, as the painter measures it, and lines
//! broken as the host's line breaker breaks them (`text/measurement.ts`).

use archboard_scene::drawing::{DiagramFont, FontFamily, TextRun};
use archboard_scene::measure::Measure;
use archboard_scene::request::WordLine;

/// A participant's name, and every face a card's title is set in.
pub const CARD_TITLE_FONT: DiagramFont = DiagramFont {
    family: FontFamily::Sans,
    weight: 500,
};
/// A participant's responsibility, and a step's note.
pub const CARD_NOTE_FONT: DiagramFont = DiagramFont {
    family: FontFamily::Sans,
    weight: 400,
};
/// A message's words, and a frame's.
pub const PILL_FONT: DiagramFont = DiagramFont {
    family: FontFamily::Sans,
    weight: 500,
};

/// The host's text: each width to a hundredth of a unit ([`Measure`]), and
/// lines broken as its line breaker breaks them.
pub trait Text: Measure {
    /// A note's words wrapped to a width in the note face, each line whole
    /// with its painted width, its baseline measured from the block's top
    /// (`measureNoteLines`).
    fn note_lines(&self, text: &str, width: f64, size: f64, line_height: f64) -> Vec<TextRun>;

    /// A message's words wrapped, balanced, to a width in the label face,
    /// each line whole with its painted width (`measureMessageLines`).
    fn message_lines(&self, text: &str, width: f64, size: f64, line_height: f64) -> Vec<WordLine>;
}

/// The size a title is set at: the largest step, at or below the size it
/// earned, where the whole title fits its run, and never below the floor.
pub fn fitted_size(
    text: &impl Measure,
    label: &str,
    font: DiagramFont,
    earned: f64,
    budget: f64,
    floor: f64,
    step: f64,
) -> f64 {
    let mut size = earned;
    while size > floor && text.width(label, font, size) > budget {
        size = archboard_scene::js::js_max(floor, size - step);
    }
    size
}

#[cfg(test)]
pub mod fixed {
    //! Text for tests: every character half its size wide, and lines broken
    //! at spaces where the next word would pass the width.
    use super::Text;
    use archboard_scene::drawing::{DiagramFont, TextRole, TextRun};
    use archboard_scene::measure::Measure;
    use archboard_scene::request::WordLine;

    use super::CARD_NOTE_FONT;

    pub struct Monospace;

    fn width_of(text: &str, size: f64) -> f64 {
        text.chars().count() as f64 * size * 0.5
    }

    fn broken(text: &str, width: f64, size: f64) -> Vec<String> {
        let mut lines: Vec<String> = Vec::new();
        for word in text.split(' ').filter(|word| !word.is_empty()) {
            match lines.last_mut() {
                Some(line) if width_of(&format!("{line} {word}"), size) <= width => {
                    line.push(' ');
                    line.push_str(word);
                }
                _ => lines.push(word.to_owned()),
            }
        }
        lines
    }

    impl Measure for Monospace {
        fn width(&self, text: &str, _font: DiagramFont, size: f64) -> f64 {
            width_of(text, size)
        }
    }

    impl Text for Monospace {
        fn note_lines(&self, text: &str, width: f64, size: f64, line_height: f64) -> Vec<TextRun> {
            broken(text, width, size)
                .into_iter()
                .enumerate()
                .map(|(index, line)| TextRun {
                    width: width_of(&line, size),
                    text: line,
                    x: 0.0,
                    y: size + index as f64 * line_height,
                    font: CARD_NOTE_FONT,
                    font_size: size,
                    role: TextRole::Note,
                })
                .collect()
        }

        fn message_lines(
            &self,
            text: &str,
            width: f64,
            size: f64,
            _line_height: f64,
        ) -> Vec<WordLine> {
            broken(text, width, size)
                .into_iter()
                .map(|line| WordLine {
                    width: width_of(&line, size),
                    text: line,
                })
                .collect()
        }
    }
}
