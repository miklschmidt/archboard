//! The words in a flowchart's diamonds, loops and terminals.
use crate::measure::message_lines;
use crate::sizes::{SHAPE_TEXT_LINE, SHAPE_TEXT_SIZE};

/// A shape's words, wrapped.
#[derive(Clone, Debug, PartialEq)]
pub struct ShapeWords {
    /// Each line, whole.
    pub lines: Vec<String>,
    /// How wide the widest line is set.
    pub width: f64,
    /// How tall the lines stand together.
    pub height: f64,
}

/// A shape's name wrapped, balanced, to a width, in the face and size the
/// painter sets a shape's words in.
pub fn shape_words(name: &str, width: f64) -> ShapeWords {
    let lines = message_lines(name, width, SHAPE_TEXT_SIZE, SHAPE_TEXT_LINE);
    ShapeWords {
        width: lines.iter().fold(0.0, |widest, line| {
            archboard_ecma::max([widest, line.width])
        }),
        height: lines.len() as f64 * SHAPE_TEXT_LINE,
        lines: lines.into_iter().map(|line| line.text).collect(),
    }
}
