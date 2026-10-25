//! The size a picture's card names are set at from far away: one for all of
//! them, so they read as one set.

use crate::geometry::Rect;
use crate::js::{js_max, js_min};
use crate::measure::cards::{Style, TITLE};
use crate::measure::{exact_width, paragraph};

/// Room a far name keeps from its card's sides.
const FAR_PADDING_X: f64 = 16.0;
/// Room a far name keeps from its card's top and bottom.
const FAR_PADDING_Y: f64 = 12.0;
/// The largest a far name is set.
const FAR_MAX_SIZE: f64 = 44.0;
/// The most of a card's height one line of its far name may take: set larger,
/// a name fills its card like a word in a box rather than a title on a card.
const FAR_HEIGHT_SHARE: f64 = 0.36;
/// The step between one line of a far name and the next, per unit of its size: display leading.
const FAR_LINE: f64 = 1.15;
/// A far card's chip, per unit of its name's size.
const FAR_CHIP: f64 = 1.25;
/// The gap between a far chip and its name, per unit of the name's size.
const FAR_GAP: f64 = 0.5;
/// The most lines a far name takes.
const FAR_LINES: usize = 2;
/// How much smaller a picture's far names may be set to keep every one of them
/// on one line: a picture whose names all read on one line reads as one set,
/// where a mix of one and two lines reads as ragged.
const FAR_ONE_LINE_SHARE: f64 = 0.85;

/// The box a far name stands in: a card.
pub type FarBox = Rect;

/// A title a picture draws from far away: its words and the box it stands in.
#[derive(Clone, Copy, Debug)]
pub struct FarSubject<'a> {
    /// The card's name.
    pub name: &'a str,
    /// The card's box.
    pub bounds: FarBox,
}

/// The size a picture's far names are set at: the largest every name fits at
/// on one line, when that is not much smaller than the largest every name
/// fits at on two, else that. A picture with no cards sets them at the largest.
pub fn far_size_for(subjects: &[FarSubject<'_>]) -> f64 {
    let one = shared_far_size(subjects, 1);
    let two = shared_far_size(subjects, FAR_LINES);
    if one >= two * FAR_ONE_LINE_SHARE {
        one
    } else {
        two
    }
}

/// The largest size every one of some names fits at from far away.
fn shared_far_size(subjects: &[FarSubject<'_>], lines: usize) -> f64 {
    subjects
        .iter()
        .map(|subject| far_size_of(subject.name, subject.bounds, lines))
        .fold(FAR_MAX_SIZE, js_min)
}

/// The largest size a name fits at from far away: its balanced wrap on at
/// most some lines beside its type chip grown to match, a line taking no more
/// than a share of the box, and never smaller than the name drawn near.
fn far_size_of(name: &str, bounds: FarBox, lines: usize) -> f64 {
    let mut low = TITLE.size;
    let mut high = js_max(low, js_min(FAR_MAX_SIZE, bounds.height * FAR_HEIGHT_SHARE));
    while high - low > 0.5 {
        let middle = f64::midpoint(low, high);
        if far_lines(name, bounds, middle, lines).is_none() {
            high = middle;
        } else {
            low = middle;
        }
    }
    (low * 2.0).floor() / 2.0
}

/// Every run of white space as one space, as `split(/\s+/u).join(" ")` makes it.
fn collapsed(name: &str) -> String {
    let mut out = String::with_capacity(name.len());
    let mut spaced = false;
    for character in name.chars() {
        if character.is_whitespace() {
            if !spaced {
                out.push(' ');
            }
            spaced = true;
        } else {
            out.push(character);
            spaced = false;
        }
    }
    out
}

/// A far name's lines at one size, when they fit the box beside the chip on
/// at most some lines, broken only between words.
fn far_lines(name: &str, bounds: FarBox, size: f64, most: usize) -> Option<Vec<String>> {
    let style = far_style(size);
    let lines = far_wrap(name, bounds, size);
    // At a size where one word is wider than the room, the wrap breaks it,
    // which a far name never is.
    let whole = lines.join(" ") == collapsed(name);
    let fits = whole
        && lines.len() <= most
        && lines.len() as f64 * style.line <= bounds.height - FAR_PADDING_Y * 2.0
        && lines
            .iter()
            .all(|line| exact_width(line, style.font, style.size) <= far_room(bounds, size));
    fits.then_some(lines)
}

/// A far name wrapped, balanced, to the room beside the chip at one size, as
/// the name drawn near would wrap: a word wider than the room breaks.
fn far_wrap(name: &str, bounds: FarBox, size: f64) -> Vec<String> {
    let style = far_style(size);
    let prepared = paragraph(name, style.font, style.size);
    prepared
        .lines(prepared.balanced_width(far_room(bounds, size)))
        .into_iter()
        .map(|line| line.text)
        .collect()
}

/// A far name's face at one size: the title's, with display leading.
fn far_style(size: f64) -> Style {
    Style {
        size,
        line: size * FAR_LINE,
        ..TITLE
    }
}

/// The width a far name has beside its chip at one size.
fn far_room(bounds: FarBox, size: f64) -> f64 {
    bounds.width - FAR_PADDING_X * 2.0 - far_chip(bounds, size) - size * FAR_GAP
}

/// A far chip's side at one name size: in proportion to the name, and no
/// taller than the box holds.
fn far_chip(bounds: FarBox, size: f64) -> f64 {
    js_min(size * FAR_CHIP, bounds.height - FAR_PADDING_Y * 2.0)
}
