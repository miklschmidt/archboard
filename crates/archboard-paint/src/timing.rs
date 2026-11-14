//! Time, as the painter uses it. Every duration comes from the host, so that
//! the host's constants stay the one place that holds them. This holds only the
//! shapes of a change.

/// A CSS `cubic-bezier()` timing function.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Curve(pub f64, pub f64, pub f64, pub f64);

/// `ease-out`.
pub const EASE_OUT: Curve = Curve(0.0, 0.0, 0.58, 1.0);
/// `ease-in-out`.
pub const EASE_IN_OUT: Curve = Curve(0.42, 0.0, 0.58, 1.0);
/// The far swap's curve, as the SVG's stylesheet spells it.
pub const SWAP: Curve = Curve(0.4, 0.0, 0.2, 1.0);
/// The curve a move follows: a start the eye can catch, a long settle. The
/// host's camera glides on the same curve (`glideEase`).
pub const EMPHASISED: Curve = Curve(0.45, 0.0, 0.15, 1.0);

/// One axis of a curve at a point along it.
fn along(one: f64, other: f64, point: f64) -> f64 {
    let rest = 1.0 - point;
    3.0 * rest * rest * point * one + 3.0 * rest * point * point * other + point * point * point
}

/// The point of a curve at which one axis reaches a value.
fn point_at(one: f64, other: f64, value: f64) -> f64 {
    let (mut low, mut high) = (0.0, 1.0);
    for _ in 0..32 {
        let point = f64::midpoint(low, high);
        if along(one, other, point) < value {
            low = point;
        } else {
            high = point;
        }
    }
    f64::midpoint(low, high)
}

impl Curve {
    /// The share of a change done a share of the way through its time.
    pub fn at(self, progress: f64) -> f64 {
        let Curve(x1, y1, x2, y2) = self;
        along(y1, y2, point_at(x1, x2, progress.clamp(0.0, 1.0)))
    }

    /// How far through its time a change has done a share of itself.
    pub fn time_of(self, share: f64) -> f64 {
        let Curve(x1, y1, x2, y2) = self;
        along(x1, x2, point_at(y1, y2, share.clamp(0.0, 1.0)))
    }
}

/// A value on its way from one number to another.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Fade {
    from: f64,
    to: f64,
    start: f64,
    duration: f64,
    curve: Curve,
}

impl Fade {
    /// A value that stands at a number.
    pub const fn still(value: f64) -> Fade {
        Fade {
            from: value,
            to: value,
            start: 0.0,
            duration: 0.0,
            curve: EASE_OUT,
        }
    }

    /// Where the value is at a moment, in milliseconds.
    pub fn at(&self, now: f64) -> f64 {
        if self.duration <= 0.0 {
            return if now >= self.start {
                self.to
            } else {
                self.from
            };
        }
        let share = self.curve.at((now - self.start) / self.duration);
        self.from + (self.to - self.from) * share
    }

    /// Whether the value has arrived by a moment.
    pub fn done(&self, now: f64) -> bool {
        now >= self.start + self.duration
    }

    /// Where the value is going.
    pub const fn target(&self) -> f64 {
        self.to
    }

    /// The same value, on its way from where it is at `now` to another number.
    #[must_use]
    pub fn toward(&self, to: f64, now: f64, wait: f64, duration: f64, curve: Curve) -> Fade {
        Fade {
            from: self.at(now),
            to,
            start: now + wait,
            duration,
            curve,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{EASE_OUT, Fade, SWAP};

    #[test]
    fn a_curve_holds_both_ends_and_rises_between() {
        for curve in [EASE_OUT, SWAP] {
            assert!(curve.at(0.0).abs() < 1e-6);
            assert!((curve.at(1.0) - 1.0).abs() < 1e-6);
            assert!(curve.at(0.25) < curve.at(0.5) && curve.at(0.5) < curve.at(0.75));
        }
    }

    #[test]
    fn a_fade_waits_then_moves_then_stands() {
        let fade = Fade::still(1.0).toward(0.0, 100.0, 50.0, 100.0, EASE_OUT);
        assert_eq!(fade.at(120.0), 1.0);
        assert!(fade.at(200.0) > 0.0 && fade.at(200.0) < 1.0);
        assert!(fade.at(250.0).abs() < 1e-6);
        assert!(fade.done(250.0) && !fade.done(249.0));
    }

    #[test]
    fn a_change_of_mind_starts_from_where_the_value_is() {
        let fade = Fade::still(0.0).toward(1.0, 0.0, 0.0, 100.0, EASE_OUT);
        let midway = fade.at(50.0);
        let back = fade.toward(0.0, 50.0, 0.0, 100.0, EASE_OUT);
        assert_eq!(back.at(50.0), midway);
    }

    #[test]
    fn no_duration_is_a_cut() {
        let fade = Fade::still(1.0).toward(0.0, 10.0, 0.0, 0.0, EASE_OUT);
        assert_eq!(fade.at(10.0), 0.0);
        assert!(fade.done(10.0));
    }
}
