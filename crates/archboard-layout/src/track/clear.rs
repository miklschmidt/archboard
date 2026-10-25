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
}
