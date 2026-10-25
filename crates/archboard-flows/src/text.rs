//! What the layout asks of the host's text, until the core shapes text itself
//! (TASK-520.07): the width of a line, as the painter measures it, and lines
//! broken as the host's line breaker breaks them (`text/measurement.ts`).

use archboard_scene::drawing::{DiagramFont, TextRun};
use archboard_scene::measure::Measure;
use archboard_scene::request::WordLine;

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
