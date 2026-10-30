//! Whether an x stands clear of what a band holds, asked of many x: a lane
//! search tries column after column against the same stretches, some
//! hundreds of them, so once it has asked a few times they are merged and
//! sorted, and each x after is found by halving (TASK-377).

use std::cell::{Cell, OnceCell};

use crate::ecma::{js_max, sort_by};

/// How many x are tested stretch by stretch before the stretches are merged.
const ASKED_BEFORE_MERGING: usize = 8;

/// Whether an x stands clear of every one of some stretches: at or beyond an
/// end of each, as `x <= low || x >= high` asks of each one.
#[derive(Clone, Debug)]
pub(crate) struct ClearOf {
    stretches: Vec<(f64, f64)>,
    asked: Cell<usize>,
    merged: OnceCell<Merged>,
}

/// The stretches as the test reads them once enough x have been asked: merged
/// and sorted, or none at all where a stretch keeps every x out.
#[derive(Clone, Debug)]
enum Merged {
    /// A stretch with an end that is not a number keeps every x out.
    None,
    Sorted {
        lows: Vec<f64>,
        highs: Vec<f64>,
    },
}

impl ClearOf {
    /// The test of some stretches.
    pub(crate) fn new(stretches: Vec<(f64, f64)>) -> ClearOf {
        ClearOf {
            stretches,
            asked: Cell::new(0),
            merged: OnceCell::new(),
        }
    }

    /// Whether an x stands clear of every stretch.
    pub(crate) fn passes(&self, x: f64) -> bool {
        self.asked.set(self.asked.get() + 1);
        if self.merged.get().is_none() && self.asked.get() <= ASKED_BEFORE_MERGING {
            return self
                .stretches
                .iter()
                .all(|&(low, high)| x <= low || x >= high);
        }
        match self.merged.get_or_init(|| merged_of(&self.stretches)) {
            Merged::None => false,
            Merged::Sorted { lows, highs } => {
                if x.is_nan() {
                    return self.stretches.is_empty();
                }
                // The last stretch starting left of x is the only one that can hold it.
                let (mut start, mut end) = (0, lows.len());
                while start < end {
                    let middle = usize::midpoint(start, end);
                    if lows[middle] < x {
                        start = middle + 1;
                    } else {
                        end = middle;
                    }
                }
                start == 0 || x >= highs[start - 1]
            }
        }
    }
}

/// The stretches merged and sorted.
fn merged_of(stretches: &[(f64, f64)]) -> Merged {
    if stretches
        .iter()
        .any(|(low, high)| low.is_nan() || high.is_nan())
    {
        return Merged::None;
    }
    let mut open: Vec<(f64, f64)> = stretches
        .iter()
        .copied()
        .filter(|(one, other)| one < other)
        .collect();
    sort_by(&mut open, |one, other| one.0 - other.0);
    let mut lows: Vec<f64> = Vec::new();
    let mut highs: Vec<f64> = Vec::new();
    for (low, high) in open {
        // Two open stretches that overlap keep out one open stretch; two that
        // only touch leave the point between them clear.
        match highs.last_mut() {
            Some(last) if low < *last => *last = js_max(*last, high),
            _ => {
                lows.push(low);
                highs.push(high);
            }
        }
    }
    Merged::Sorted { lows, highs }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn merged_answers_as_each_stretch_does() {
        let stretches = vec![(0.0, 10.0), (5.0, 20.0), (20.0, 30.0), (40.0, 35.0)];
        let clear = ClearOf::new(stretches.clone());
        let xs = [-1.0, 0.0, 3.0, 10.0, 20.0, 25.0, 30.0, 36.0, 50.0, f64::NAN];
        for _ in 0..3 {
            for x in xs {
                let each = stretches.iter().all(|&(low, high)| x <= low || x >= high);
                assert_eq!(clear.passes(x), each, "{x}");
            }
        }
    }

    // What this catches: a merged test that answers otherwise than the
    // stretches one by one, which moves a lane and so a drawing: two
    // stretches that only touch merged into one, so the point between them is
    // kept out; an empty stretch keeping an x out; or an x at a stretch's end
    // taken as inside it.

    /// A small deterministic generator, so a failure names the same stretches
    /// every run: `state * 1103515245 + 12345` modulo 2^32.
    struct Lcg(u32);

    impl Lcg {
        /// A whole number in `0..n`, as `Math.floor(next() * n)` of the state over 2^32.
        fn below(&mut self, n: u64) -> u64 {
            self.0 = self.0.wrapping_mul(1_103_515_245).wrapping_add(12_345);
            (u64::from(self.0) * n) >> 32
        }

        /// An end on a coarse grid, so many stretches touch, overlap, nest, repeat or are empty.
        fn end(&mut self) -> f64 {
            (self.below(40) * 4) as f64
        }
    }

    /// Some stretches as the generator draws them, with one open to each side every tenth round.
    fn stretches_of(next: &mut Lcg, round: usize) -> Vec<(f64, f64)> {
        let count = 1 + next.below(12);
        let mut stretches: Vec<(f64, f64)> = (0..count).map(|_| (next.end(), next.end())).collect();
        if round.is_multiple_of(10) {
            stretches.push((f64::NEG_INFINITY, next.end()));
            stretches.push((next.end(), f64::INFINITY));
        }
        stretches
    }

    /// Every x of the grid, and beyond it, answered as the stretches one by one answer it.
    fn assert_answers_as_each(stretches: &[(f64, f64)], round: usize) {
        let clear = ClearOf::new(stretches.to_vec());
        for x in (-4..=164).step_by(2).map(f64::from) {
            let each = stretches.iter().all(|&(low, high)| x <= low || x >= high);
            assert_eq!(clear.passes(x), each, "x {x} in round {round}");
        }
    }

    #[test]
    fn a_lane_test_answers_as_the_stretches_one_by_one_before_and_after_it_merges_them() {
        let mut next = Lcg(377);
        for round in 0..200 {
            assert_answers_as_each(&stretches_of(&mut next, round), round);
        }
    }

    #[test]
    fn a_stretch_with_an_end_that_is_no_number_keeps_every_x_out_merged_or_not() {
        let clear = ClearOf::new(vec![(0.0, 10.0), (f64::NAN, 20.0)]);
        for x in (-20..=40).map(f64::from) {
            assert!(!clear.passes(x), "{x}");
        }
    }
}
