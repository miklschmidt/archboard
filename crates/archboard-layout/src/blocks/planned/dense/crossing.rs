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

    /// Whether the chord crosses another, where this one's turns to the other's ends are known.
    fn crosses(&self, other: &Ends, turns: (i8, i8)) -> bool {
        turns.0 * turns.1 < 0 && self.near(other) && other.turn(self.from) * other.turn(self.to) < 0
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

/// The crossings of every line of a scene, and of the lines that a move under weighing moved.
///
/// Two lines that share a box never cross: one's chord ends on the other's end, so its turn to
/// that end is none.
#[derive(Debug)]
pub(super) struct Crossings {
    /// How many words each row takes.
    words: usize,
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
                if chord.crosses(other, (chord.turn(other.from), chord.turn(other.to))) {
                    set(&mut rows[one * words..][..words], two);
                    set(&mut rows[two * words..][..words], one);
                    counts[one] += 1;
                    counts[two] += 1;
                }
            }
        }
        Crossings {
            words,
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

    /// Weigh the crossings of the lines a move moved, where the scene's boxes stand now: how many
    /// crossings they make, and how many they made before. A pair of moved lines that crossed is
    /// in both lines' counts.
    pub(super) fn weigh(
        &mut self,
        scene: &Scene,
        moved: impl Iterator<Item = usize>,
    ) -> (usize, usize) {
        let words = self.words;
        self.moved.fill(0);
        self.lines.clear();
        self.lines.extend(moved);
        self.fresh.clear();
        self.now.clear();
        for &line in &self.lines {
            set(&mut self.moved, line);
            self.fresh.push(Ends::of(scene, line));
        }
        self.fresh_rows.clear();
        self.fresh_rows.resize(self.lines.len() * words, 0);
        self.middles.clear();
        self.middles.extend(scene.boxes.iter().map(|&at| middle(at)));
        for (at, chord) in self.fresh.iter().enumerate() {
            // `turn`, with the chord's own differences made once.
            let (p, run, rise) = (chord.from, chord.to.0 - chord.from.0, chord.to.1 - chord.from.1);
            self.turns.clear();
            let turns = (self.middles.iter()).map(|r| side(run * (r.1 - p.1) - rise * (r.0 - p.0)));
            self.turns.extend(turns);
            let row = &mut self.fresh_rows[at * words..][..words];
            let mut count = 0;
            for (other, ends) in scene.lines.iter().enumerate() {
                let turns = (self.turns[ends.from], self.turns[ends.to]);
                if turns.0 * turns.1 < 0
                    && !has(&self.moved, other)
                    && chord.crosses(&self.ends[other], turns)
                {
                    set(row, other);
                    count += 1;
                }
            }
            self.now.push(count);
        }
        let mut made: usize = self.now.iter().sum();
        let mut twice = 0;
        for (one, &line) in self.lines.iter().enumerate() {
            for (two, &other) in self.lines.iter().enumerate().skip(one + 1) {
                twice += usize::from(has(&self.rows[line * words..][..words], other));
                let (chord, theirs) = (self.fresh[one], self.fresh[two]);
                if chord.crosses(&theirs, (chord.turn(theirs.from), chord.turn(theirs.to))) {
                    set(&mut self.fresh_rows[one * words..][..words], other);
                    set(&mut self.fresh_rows[two * words..][..words], line);
                    self.now[one] += 1;
                    self.now[two] += 1;
                    made += 1;
                }
            }
        }
        let before = self.lines.iter().map(|&line| self.counts[line]).sum::<usize>() - twice;
        (made, before)
    }

    /// Keep the move last weighed: every line that stayed gains or loses the moved lines it
    /// now crosses or no longer does.
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
