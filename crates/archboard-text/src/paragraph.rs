//! A paragraph broken into lines at a width, as CSS breaks `white-space:
//! pre-wrap` text with `overflow-wrap: break-word`, and as Pretext broke it
//! before the core shaped text.
//!
//! A line may end where the Unicode line breaking algorithm (UAX #14) allows
//! one, after any space, and at every hard line break; never after the slash
//! of a path or a pair such as `thread/read`. The spaces a line ends in hang
//! past its end: they neither count against the width nor are painted. A word
//! wider than the whole width breaks between two of its graphemes, so no word
//! runs past the width unless one grapheme does.
//!
//! A line fits when the widths of its words and spaces, each shaped on its
//! own and taken to a hundredth of a unit as a canvas gave it, add up to
//! no more than the width and a two-hundredth of a unit. A word is a UAX #29 word segment, a run of
//! stops and marks held to the word beside it, as Pretext measured the
//! segments `Intl.Segmenter` gave it. So a pair of letters that kerns across
//! a space counts unkerned, and a line is painted shaped whole, a hair wider
//! or narrower than the sum its fit read.

use unicode_linebreak::linebreaks;
use unicode_segmentation::UnicodeSegmentation;

use crate::faces::Face;
use crate::shape::{hundredths, scaled, shape};

/// How much wider than the width a line may be and still fit.
const FIT_TOLERANCE: f64 = 0.005;

/// One line of a paragraph.
#[derive(Clone, Debug, PartialEq)]
pub struct Line {
    /// Its words, without the spaces it hangs past its end.
    pub text: String,
    /// How wide its words are set.
    pub width: f64,
    /// Whether it ends inside a word, which was wider than the width.
    pub broken: bool,
}

/// A line found by the walk: where it starts and ends, by grapheme bound.
#[derive(Clone, Copy, Debug)]
struct Span {
    /// The bound it starts at.
    start: usize,
    /// The bound its words end at, before the spaces it hangs.
    visible: usize,
    /// Whether it ends inside a word.
    broken: bool,
}

/// One run of a paragraph between two hard line breaks, its words shaped.
#[derive(Debug)]
struct Hard {
    words: String,
    /// Byte positions of tabs, whose advance depends on the line start.
    tabs: Vec<usize>,
    /// The byte each grapheme starts at, and the end of the words.
    bounds: Vec<usize>,
    /// The advance up to each bound, at the paragraph's size: of the words
    /// before it, each shaped on its own, and of the part of its own word
    /// before it, each to a hundredth of a unit.
    before: Vec<f64>,
    /// The bounds where a line can end without breaking a word.
    opens: Vec<usize>,
    /// The bound the words before each bound end at, the spaces before it left out.
    visible: Vec<usize>,
}

impl Hard {
    /// Shape one hard line and record its grapheme boundaries.
    fn of(face: Face, size: f64, words: &str) -> Hard {
        let mut bounds: Vec<usize> = words.grapheme_indices(true).map(|(at, _)| at).collect();
        bounds.push(words.len());
        Hard {
            words: words.to_owned(),
            tabs: words.match_indices('\t').map(|(at, _)| at).collect(),
            before: advances_before(face, size, words, &bounds),
            opens: opens(words, &bounds),
            visible: visible(words, &bounds),
            bounds,
        }
    }

    /// The line that starts at a bound, and the bound the next one starts at.
    fn next_line(&self, start: usize, fits: &impl Fn(usize, usize) -> bool) -> (Span, usize) {
        if start == self.last() {
            let empty = Span {
                start,
                visible: start,
                broken: false,
            };
            return (empty, start);
        }
        let endings = &self.opens[self.opens.partition_point(|&at| at <= start)..];
        let furthest = endings
            .iter()
            .copied()
            .take_while(|&at| fits(start, self.visible_end(start, at)))
            .last();
        furthest.map_or_else(
            || Self::broken_line(start, endings[0], fits),
            |end| {
                let whole = Span {
                    start,
                    visible: self.visible_end(start, end),
                    broken: false,
                };
                (whole, end)
            },
        )
    }

    /// The line that starts with a word that does not fit on its own: as many
    /// of its graphemes as fit, and always one.
    fn broken_line(
        start: usize,
        word_end: usize,
        fits: &impl Fn(usize, usize) -> bool,
    ) -> (Span, usize) {
        let mut end = start + 1;
        while end < word_end && fits(start, end + 1) {
            end += 1;
        }
        let broken = Span {
            start,
            visible: end,
            broken: end < word_end,
        };
        (broken, end)
    }

    /// The bound a line's words end at when the line ends at a bound.
    fn visible_end(&self, start: usize, end: usize) -> usize {
        self.visible[end].max(start)
    }

    /// The width of the words between two bounds.
    fn span(&self, start: usize, end: usize, face: Face, size: f64) -> f64 {
        let (from, to) = (self.bounds[start], self.bounds[end]);
        let next_tab = self.tabs.partition_point(|&at| at < from);
        if self.tabs.get(next_tab).is_some_and(|&at| at < to) {
            return crate::shape::width(face, &self.words[from..to], size);
        }
        self.before[end] - self.before[start]
    }

    /// The last bound.
    fn last(&self) -> usize {
        self.bounds.len() - 1
    }
}

/// The bounds where a line can end without breaking a word.
fn opens(words: &str, bounds: &[usize]) -> Vec<usize> {
    let mut opens = vec![false; bounds.len()];
    for (at, _) in linebreaks(words) {
        if let Ok(index) = bounds.binary_search(&at) {
            opens[index] = true;
        }
    }
    for index in 1..bounds.len() - 1 {
        let previous = &words[bounds[index - 1]..bounds[index]];
        let next = &words[bounds[index]..bounds[index + 1]];
        opens[index] = tailored(previous, next, opens[index]);
    }
    opens
        .into_iter()
        .enumerate()
        .filter_map(|(at, open)| open.then_some(at))
        .collect()
}

/// Whether a line may end between two graphemes, where the line breaking
/// algorithm says whether one may. Two tailorings keep the breaks the browsers
/// make: a line may end after any space, even before a word that opens with a
/// stop, such as `.archboard`; and a path or a pair such as `thread/read`
/// stays whole, where the algorithm breaks after its slash.
fn tailored(previous: &str, next: &str, open: bool) -> bool {
    if previous.ends_with('/') {
        return false;
    }
    open || (spacing(previous) && !spacing(next))
}

/// The bound the words before each bound end at, the spaces before it left out.
fn visible(words: &str, bounds: &[usize]) -> Vec<usize> {
    let mut visible = vec![0; bounds.len()];
    for index in 1..bounds.len() {
        let grapheme = &words[bounds[index - 1]..bounds[index]];
        visible[index] = if spacing(grapheme) {
            visible[index - 1]
        } else {
            index
        };
    }
    visible
}

/// Whether a grapheme is a space a line may break after: a space or a tab.
fn spacing(grapheme: &str) -> bool {
    grapheme == " " || grapheme == "\t"
}

/// Whether a segment is stops and marks: no letter, digit or space.
fn stops(segment: &str) -> bool {
    segment
        .chars()
        .all(|character| !character.is_alphanumeric() && !character.is_whitespace())
}

/// The words of a run, by their byte ranges: its UAX #29 word segments, a
/// segment of stops and marks held to the word before it, or to the word
/// after it where a space or the start comes before it.
fn segments(words: &str) -> Vec<(usize, usize)> {
    let mut held: Vec<(usize, usize)> = Vec::new();
    let mut opening: Option<usize> = None;
    for (at, segment) in words.split_word_bound_indices() {
        let end = at + segment.len();
        let after_word = held.last().is_some_and(|&(start, stop)| {
            opening.is_none() && !words[start..stop].trim().is_empty()
        });
        if stops(segment) && after_word {
            if let Some(last) = held.last_mut() {
                last.1 = end;
            }
            continue;
        }
        if stops(segment) {
            opening = Some(opening.unwrap_or(at));
            continue;
        }
        held.push((opening.take().unwrap_or(at), end));
    }
    if let Some(start) = opening {
        held.push((start, words.len()));
    }
    held
}

/// The advance up to each bound: of every word before it, each shaped on its
/// own, and of the glyphs of its own word whose clusters begin before it,
/// each to a hundredth of a unit.
fn advances_before(face: Face, size: f64, words: &str, bounds: &[usize]) -> Vec<f64> {
    let set = |units: i64| hundredths(scaled(units, face, size));
    let mut before = Vec::with_capacity(bounds.len());
    let mut base = 0.0;
    for (start, end) in segments(words) {
        let shaped = shape(face, &words[start..end]);
        let end_bound = bounds.partition_point(|&at| at < end);
        let positions = bounds[before.len()..end_bound].iter().map(|&at| at - start);
        before.extend(
            shaped
                .advances_before(positions)
                .into_iter()
                .map(|units| base + set(units)),
        );
        base += set(shaped.advance);
    }
    before.resize(bounds.len(), base);
    before
}

/// Words prepared to be broken into lines at any width: each run between hard
/// line breaks shaped once in its face.
#[derive(Debug)]
pub struct Paragraph {
    face: Face,
    size: f64,
    hards: Vec<Hard>,
}

impl Paragraph {
    /// Words in a face at a size. Unicode mandatory separators each start a
    /// new line. A carriage return and line feed together count as one.
    pub fn new(face: Face, size: f64, words: &str) -> Paragraph {
        let words = words.replace("\r\n", "\n").replace(
            ['\r', '\u{b}', '\u{c}', '\u{85}', '\u{2028}', '\u{2029}'],
            "\n",
        );
        let hards = if words.is_empty() {
            Vec::new()
        } else {
            words
                .split('\n')
                .map(|hard| Hard::of(face, size, hard))
                .collect()
        };
        Paragraph { face, size, hards }
    }

    /// Walk the lines the words break into at a width.
    fn walk(&self, width: f64, mut line: impl FnMut(&Hard, Span)) {
        let limit = width + FIT_TOLERANCE;
        for hard in &self.hards {
            let fits =
                |start: usize, end: usize| hard.span(start, end, self.face, self.size) <= limit;
            let mut start = 0;
            loop {
                let (span, next) = hard.next_line(start, &fits);
                line(hard, span);
                start = next;
                if start >= hard.last() {
                    break;
                }
            }
        }
    }

    /// The lines the words break into at a width.
    pub fn lines(&self, width: f64) -> Vec<Line> {
        let mut lines = Vec::new();
        self.walk(width, |hard, span| {
            let text = hard.words[hard.bounds[span.start]..hard.bounds[span.visible]].to_owned();
            lines.push(Line {
                width: crate::shape::width(self.face, &text, self.size),
                text,
                broken: span.broken,
            });
        });
        lines
    }

    /// How many lines the words break into at a width.
    pub fn line_count(&self, width: f64) -> usize {
        let mut count = 0;
        self.walk(width, |_, _| count += 1);
        count
    }

    /// How many lines end inside a word at a width.
    fn broken_words(&self, width: f64) -> usize {
        let mut count = 0;
        self.walk(width, |_, span| count += usize::from(span.broken));
        count
    }

    /// How wide the widest line is when nothing but a hard line break breaks one.
    pub fn natural_width(&self) -> f64 {
        self.hards
            .iter()
            .map(|hard| hard.span(0, hard.visible_end(0, hard.last()), self.face, self.size))
            .fold(0.0, f64::max)
    }

    /// The narrowest width that keeps the line count the widest width gives,
    /// so wrapped words share their lines evenly instead of leaving one word
    /// alone on the last, and that breaks no word the widest width keeps whole.
    pub fn balanced_width(&self, limit: f64) -> f64 {
        let lines = self.line_count(limit);
        if lines <= 1 {
            return limit;
        }
        let broken = self.broken_words(limit);
        let fits_at =
            |width: f64| self.line_count(width) <= lines && self.broken_words(width) <= broken;
        let mut too_narrow = self.natural_width() / lines as f64;
        let mut fits = limit;
        while fits - too_narrow > 0.5 {
            let middle = f64::midpoint(too_narrow, fits);
            if fits_at(middle) {
                fits = middle;
            } else {
                too_narrow = middle;
            }
        }
        fits
    }

    /// The narrowest whole width, wider than some, at which the words break
    /// into fewer lines than there. Nothing when only hard breaks remain.
    pub fn fewer_lines_at(&self, width: f64) -> Option<f64> {
        let lines = self.line_count(width);
        if lines <= self.hards.len() {
            return None;
        }
        let mut too_narrow = width;
        let mut fits = self.natural_width().ceil() + 1.0;
        while fits - too_narrow > 1.0 {
            let middle = f64::midpoint(too_narrow, fits).floor();
            if self.line_count(middle) < lines {
                fits = middle;
            } else {
                too_narrow = middle;
            }
        }
        Some(fits)
    }
}
