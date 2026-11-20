//! A decision's or a loop's fragment: the tab its operator stands in, the
//! narrowest it holds its own words at, and how far it reaches round the ink
//! it holds.

use crate::js;
use crate::measure::width;
use crate::names::word;
use crate::request::FrameOperator;
use crate::sequence_picture::guard_words;
use crate::sizes::{
    FRAME_GUARD_HEIGHT, FRAME_HEAD_HEIGHT, FRAME_PAD, FRAME_TAB_PADDING, PILL_FONT, PILL_TEXT_SIZE,
};

use super::Span;

/// How wide some words of a fragment are set.
fn words_width(words: &str) -> f64 {
    width(words, PILL_FONT, PILL_TEXT_SIZE)
}

/// A width and a height.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Size {
    /// How wide.
    pub width: f64,
    /// How tall.
    pub height: f64,
}

/// A fragment's head, measured before what it holds is placed.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct FragmentHead {
    /// The tab at its top left corner that its operator stands in: as tall as
    /// the head row its words stand on.
    pub tab: Size,
    /// The narrowest the fragment is and still holds its tab, its words and
    /// each alternative's label.
    pub least_width: f64,
    /// The height of the row an alternative's label stands on.
    pub guard_height: f64,
}

/// A fragment's head: the tab its operator stands in, beside it the words of
/// its head row (a decision's question, a loop's condition), and the labels of
/// a decision's alternatives.
pub fn fragment_head(operator: FrameOperator, words: &str, guards: &[&str]) -> FragmentHead {
    let tab_width = (words_width(word(&operator)) + FRAME_TAB_PADDING * 2.0).ceil();
    let mut widest = tab_width + FRAME_TAB_PADDING + words_width(words) + FRAME_PAD;
    for guard in guards {
        widest = js::js_max(widest, words_width(&guard_words(guard)) + FRAME_PAD * 2.0);
    }
    FragmentHead {
        tab: Size {
            width: tab_width,
            height: FRAME_HEAD_HEIGHT,
        },
        least_width: widest.ceil(),
        guard_height: FRAME_GUARD_HEIGHT,
    }
}

/// How far a fragment reaches across the page: round the ink it holds by its
/// room on each side, in whole units, or across the columns when it holds no
/// drawn ink, and never narrower than its head.
pub fn fragment_bounds(ink: Option<Span>, columns: Span, head: &FragmentHead) -> Span {
    let (left, right) = match ink {
        None => (columns.x, columns.x + columns.width),
        Some(ink) => (
            (ink.x - FRAME_PAD).floor(),
            (ink.x + ink.width + FRAME_PAD).ceil(),
        ),
    };
    Span {
        x: left,
        width: js::js_max(right - left, head.least_width),
    }
}
