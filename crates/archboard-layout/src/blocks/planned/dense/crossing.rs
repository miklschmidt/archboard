//! Which lines of a scene cross which, as the search (`super::anneal`) moves parts. Each line
//! keeps a row of bits, one for every line whose chord its own chord crosses. A move asks only
//! its own lines whether they cross, and a move that stands updates the other lines from the
//! bits that changed.
//!
//! The test is `Chord::crosses`, made with the same operations in the same order, so it answers
//! the same. A moved line turns once to the middle of every box, and each other line reads the
//! turns to its two ends instead of making them again.

use crate::geometry::Rect;

use super::sketch::{Line, Scene};

/// Room that keeps a touch apart from a crossing, as `sketch` keeps it.
const TOUCH: f64 = 0.5;

/// A line's chord as `Chord` stands it: between the middles of its boxes, in the box round them.
#[derive(Clone, Copy, Debug)]
struct Ends {
    from: (f64, f64),
    to: (f64, f64),
    span: Rect,
}

impl Ends {
    fn of(scene: &Scene, line: usize) -> Ends {
        let Line { from, to, .. } = scene.lines[line];
        let (from, to) = (middle(scene.boxes[from]), middle(scene.boxes[to]));
        Ends {
            from,
            to,
            span: Rect {
                x: from.0.min(to.0),
                y: from.1.min(to.1),
                width: (from.0 - to.0).abs(),
                height: (from.1 - to.1).abs(),
            },
        }
    }

    /// Whether the boxes round two chords share any area, edges apart.
    fn near(&self, other: &Ends) -> bool {
        let (a, b) = (self.span, other.span);
        a.x < b.x + b.width + TOUCH
            && b.x < a.x + a.width + TOUCH
            && a.y < b.y + b.height + TOUCH
            && b.y < a.y + a.height + TOUCH
    }

    /// Which way a point stands from the chord: none where it stands on it.
    fn turn(&self, to: (f64, f64)) -> i8 {
        turn(self.from, self.to, to)
    }

    /// Whether the chord crosses another.
    fn crossing(&self, other: &Ends) -> bool {
        self.near(other)
            && self.turn(other.from) * self.turn(other.to) < 0
            && other.turn(self.from) * other.turn(self.to) < 0
    }
}

fn middle(at: Rect) -> (f64, f64) {
    (at.x + at.width / 2.0, at.y + at.height / 2.0)
}

fn turn(p: (f64, f64), q: (f64, f64), r: (f64, f64)) -> i8 {
    side((q.0 - p.0) * (r.1 - p.1) - (q.1 - p.1) * (r.0 - p.0))
}

/// The sign of a turn, none where it stands within a thousandth of none.
fn side(value: f64) -> i8 {
    i8::from(value >= 1e-3) - i8::from(value <= -1e-3)
}

fn has(row: &[u64], line: usize) -> bool {
    row[line / 64] >> (line % 64) & 1 == 1
}

fn set(row: &mut [u64], line: usize) {
    row[line / 64] |= 1 << (line % 64);
}

/// How many lines that a move left a moved chord crosses, each set in a row: from the chord's
/// turn to the middle of every box, and each line's boxes and chord, apart from the moved lines.
fn count(
    chord: &Ends,
    turns: &[i8],
    (boxes, ends, moved): (&[(u32, u32)], &[Ends], &[u64]),
    row: &mut [u64],
) -> usize {
    let mut count = 0;
    for (word, chunk) in boxes.chunks(64).enumerate() {
        // The lines whose ends stand on two sides of the chord, 64 at a time.
        let mut sides = 0;
        for (bit, &(from, to)) in chunk.iter().enumerate() {
            sides |= u64::from(turns[from as usize] * turns[to as usize] < 0) << bit;
        }
        let mut left = sides & !moved[word];
        while left != 0 {
            let other = word * 64 + left.trailing_zeros() as usize;
            left &= left - 1;
            let theirs = &ends[other];
            if chord.near(theirs) && theirs.turn(chord.from) * theirs.turn(chord.to) < 0 {
                set(row, other);
                count += 1;
            }
        }
    }
    count
}

/// The crossings of every line of a scene, and of the lines that a move under weighing moved.
///
/// Two lines that share a box never cross: one's chord ends on the other's end, so its turn to
/// that end is none.
#[derive(Debug)]
pub(super) struct Crossings {
    /// How many words each row takes.
    words: usize,
    /// The boxes each line ends on, and its chord.
    boxes: Vec<(u32, u32)>,
    ends: Vec<Ends>,
    rows: Vec<u64>,
    /// How many lines each line crosses.
    counts: Vec<usize>,
    /// The move under weighing: the lines it moved, as bits and in order, with their new chords,
    /// rows and counts, and one moved line's turn to the middle of every box.
    moved: Vec<u64>,
    lines: Vec<usize>,
    fresh: Vec<Ends>,
    fresh_rows: Vec<u64>,
    now: Vec<usize>,
    middles: Vec<(f64, f64)>,
    turns: Vec<i8>,
}

impl Crossings {
    /// Count the crossings of every line of a scene.
    pub(super) fn new(scene: &Scene) -> Crossings {
        let count = scene.lines.len();
        let words = count.div_ceil(64);
        let ends: Vec<Ends> = (0..count).map(|line| Ends::of(scene, line)).collect();
        let mut rows = vec![0; count * words];
        let mut counts = vec![0; count];
        for (one, chord) in ends.iter().enumerate() {
            for (two, other) in ends.iter().enumerate().skip(one + 1) {
                if chord.crossing(other) {
                    set(&mut rows[one * words..][..words], two);
                    set(&mut rows[two * words..][..words], one);
                    counts[one] += 1;
                    counts[two] += 1;
                }
            }
        }
        let index = |at: usize| u32::try_from(at).expect("a box index fits 32 bits");
        Crossings {
            words,
            boxes: (scene.lines.iter())
                .map(|line| (index(line.from), index(line.to)))
                .collect(),
            ends,
            rows,
            counts,
            moved: vec![0; words],
            lines: Vec::new(),
            fresh: Vec::new(),
            fresh_rows: Vec::new(),
            now: Vec::new(),
            middles: Vec::new(),
            turns: Vec::new(),
        }
    }

    /// Begin to weigh the crossings of the lines a move moved, where the scene's boxes stand now,
    /// and tell how many crossings they made before. A pair of moved lines that crossed is in
    /// both lines' counts. The crossings they make now come from `count` for each of them, in
    /// their order, and then from `pairs`.
    pub(super) fn begin(&mut self, scene: &Scene, moved: impl Iterator<Item = usize>) -> usize {
        let words = self.words;
        self.moved.fill(0);
        self.lines.clear();
        self.lines.extend(moved);
        self.fresh.clear();
        for &line in &self.lines {
            set(&mut self.moved, line);
            self.fresh.push(Ends::of(scene, line));
        }
        self.now.clear();
        self.now.resize(self.lines.len(), 0);
        self.fresh_rows.clear();
        self.fresh_rows.resize(self.lines.len() * words, 0);
        self.middles.clear();
        self.middles.extend(scene.boxes.iter().map(|&at| middle(at)));
        let mut twice = 0;
        for (one, &line) in self.lines.iter().enumerate() {
            let row = &self.rows[line * words..][..words];
            twice += (self.lines.iter().skip(one + 1))
                .filter(|&&other| has(row, other))
                .count();
        }
        self.lines.iter().map(|&line| self.counts[line]).sum::<usize>() - twice
    }

    /// How many lines that the move left the moved line at some place in its order crosses now.
    pub(super) fn count(&mut self, at: usize) -> usize {
        let words = self.words;
        let chord = &self.fresh[at];
        // `turn`, with the chord's own differences made once.
        let (p, run, rise) = (chord.from, chord.to.0 - chord.from.0, chord.to.1 - chord.from.1);
        self.turns.clear();
        let turns = (self.middles.iter()).map(|r| side(run * (r.1 - p.1) - rise * (r.0 - p.0)));
        self.turns.extend(turns);
        let row = &mut self.fresh_rows[at * words..][..words];
        let stayed = (&self.boxes[..], &self.ends[..], &self.moved[..]);
        self.now[at] = count(chord, &self.turns, stayed, row);
        self.now[at]
    }

    /// How many pairs of moved lines cross now.
    pub(super) fn pairs(&mut self) -> usize {
        let words = self.words;
        let mut made = 0;
        for (one, &line) in self.lines.iter().enumerate() {
            for (two, &other) in self.lines.iter().enumerate().skip(one + 1) {
                if self.fresh[one].crossing(&self.fresh[two]) {
                    set(&mut self.fresh_rows[one * words..][..words], other);
                    set(&mut self.fresh_rows[two * words..][..words], line);
                    self.now[one] += 1;
                    self.now[two] += 1;
                    made += 1;
                }
            }
        }
        made
    }

    /// Keep the move last weighed, once each moved line is counted and then the pairs: every
    /// line that stayed gains or loses the moved lines it now crosses or no longer does.
    pub(super) fn keep(&mut self) {
        let words = self.words;
        for (at, &line) in self.lines.iter().enumerate() {
            let fresh = &self.fresh_rows[at * words..][..words];
            for (word, &is) in fresh.iter().enumerate() {
                let was = std::mem::replace(&mut self.rows[line * words + word], is);
                let mut changed = (was ^ is) & !self.moved[word];
                while changed != 0 {
                    let other = word * 64 + changed.trailing_zeros() as usize;
                    changed &= changed - 1;
                    self.rows[other * words + line / 64] ^= 1 << (line % 64);
                    if has(fresh, other) {
                        self.counts[other] += 1;
                    } else {
                        self.counts[other] -= 1;
                    }
                }
            }
            self.ends[line] = self.fresh[at];
            self.counts[line] = self.now[at];
        }
    }
}
