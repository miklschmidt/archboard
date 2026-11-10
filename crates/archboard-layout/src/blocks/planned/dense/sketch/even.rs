//! An axis cut into even stretches, by which the door ring and the annealing find the boxes and
//! lines that may stand near a place.

/// How many even stretches an axis is cut into.
pub(in crate::blocks::planned::dense) const STRETCHES: usize = 64;

/// An axis between two ends, cut into even stretches.
#[derive(Clone, Copy, Debug)]
pub(in crate::blocks::planned::dense) struct Even {
    low: f64,
    /// How many stretches a unit of length takes.
    scale: f64,
}

impl Even {
    pub(in crate::blocks::planned::dense) fn new(low: f64, high: f64) -> Even {
        let scale = STRETCHES as f64 / (high - low);
        Even {
            low,
            scale: if scale.is_finite() { scale } else { 0.0 },
        }
    }

    /// The stretch that a place stands in. A place past either end stands in the stretch at
    /// that end, and a later place never stands in an earlier stretch.
    #[expect(
        clippy::cast_possible_truncation,
        clippy::cast_sign_loss,
        reason = "the cast saturates, so it keeps the order of the places"
    )]
    pub(in crate::blocks::planned::dense) fn at(&self, place: f64) -> usize {
        (((place - self.low) * self.scale) as usize).min(STRETCHES - 1)
    }
}
