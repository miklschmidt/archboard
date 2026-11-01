//! The traffic's clock. The SVG ran traffic as animations on the document's
//! timeline, and a page held them still while a hand moved the camera and woke
//! them gently after. Here the stage owns one clock and moves it forward from
//! the moments a frame names, so a stepped clock records it frame by frame.

/// How fast the clock runs.
#[derive(Clone, Copy, Debug, PartialEq)]
enum Pace {
    /// It stands still.
    Held,
    /// It comes back to its speed over a time, easing in and out.
    Coming {
        /// The moment it began, in milliseconds.
        began: f64,
        /// How long it takes, in milliseconds.
        ms: f64,
    },
    /// It runs at its speed.
    Full,
}

/// The traffic's clock, in seconds of traffic.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct TrafficClock {
    /// Whether traffic is drawn at all: a person who asked for no motion sees none.
    shown: bool,
    seconds: f64,
    /// The moment the clock was last brought up to, in milliseconds.
    at: Option<f64>,
    pace: Pace,
}

impl Default for TrafficClock {
    fn default() -> Self {
        TrafficClock {
            shown: true,
            seconds: 0.0,
            at: None,
            pace: Pace::Full,
        }
    }
}

/// How much of its speed the clock has gone through when it has come back a
/// share of the way: the area under the pace `p * p * (3 - 2p)`, over the
/// whole time.
fn gained(share: f64) -> f64 {
    let share = share.clamp(0.0, 1.0);
    share.powi(3) - share.powi(4) / 2.0
}

impl TrafficClock {
    /// Show or hide the traffic.
    pub(crate) fn show(&mut self, shown: bool) {
        self.shown = shown;
    }

    /// Where the clock stands, in seconds, or nothing while the traffic is hidden.
    pub(crate) fn shown_seconds(&self) -> Option<f64> {
        self.shown.then_some(self.seconds)
    }

    /// Where the clock stands, in seconds.
    pub(crate) fn seconds(&self) -> f64 {
        self.seconds
    }

    /// Stand the clock somewhere.
    pub(crate) fn set_seconds(&mut self, seconds: f64) {
        self.seconds = seconds;
    }

    /// Whether the clock moves, so that every frame differs from the last.
    pub(crate) fn runs(&self) -> bool {
        self.shown && self.pace != Pace::Held
    }

    /// Stand still. Standing still again changes nothing.
    pub(crate) fn hold(&mut self) {
        self.pace = Pace::Held;
    }

    /// Come back to full speed over a time, from standing still. A clock that
    /// is not held keeps its pace.
    pub(crate) fn resume(&mut self, ms: f64, now: f64) {
        if self.pace != Pace::Held {
            return;
        }
        self.at = Some(now);
        self.pace = if ms > 0.0 {
            Pace::Coming { began: now, ms }
        } else {
            Pace::Full
        };
    }

    /// Run at full speed at once.
    pub(crate) fn release(&mut self) {
        self.pace = Pace::Full;
    }

    /// Bring the clock up to a moment, in milliseconds. The sum is the area
    /// under the pace, so that two small steps and one large step agree.
    pub(crate) fn advance(&mut self, now: f64) {
        let before = self.at.unwrap_or(now);
        self.at = Some(now);
        let span = (now - before).max(0.0);
        let ms = match self.pace {
            Pace::Held => 0.0,
            Pace::Full => span,
            Pace::Coming { began, ms } => {
                let share = |moment: f64| (moment - began) / ms;
                let ease = ms * (gained(share(now)) - gained(share(before)));
                let full = (now - before.max(began + ms)).max(0.0);
                if now >= began + ms {
                    self.pace = Pace::Full;
                }
                ease + full
            }
        };
        self.seconds += ms / 1000.0;
    }
}

#[cfg(test)]
mod tests {
    use super::TrafficClock;

    /// The clock after frames at some moments.
    fn after(clock: &mut TrafficClock, moments: &[f64]) -> f64 {
        for moment in moments {
            clock.advance(*moment);
        }
        clock.seconds()
    }

    #[test]
    fn a_hold_stops_the_clock_and_asks_for_no_frames() {
        let mut clock = TrafficClock::default();
        after(&mut clock, &[0.0, 1000.0]);
        assert_eq!(clock.seconds(), 1.0);
        assert!(clock.runs());
        clock.hold();
        assert!(!clock.runs());
        assert_eq!(after(&mut clock, &[1500.0, 3000.0]), 1.0);
    }

    #[test]
    fn a_resume_gathers_speed_and_steps_agree() {
        let mut stepped = TrafficClock::default();
        after(&mut stepped, &[0.0]);
        stepped.hold();
        after(&mut stepped, &[100.0]);
        stepped.resume(1000.0, 100.0);
        let mut once = stepped;
        let moments: Vec<f64> = (1..=22)
            .map(|step| 100.0 + f64::from(step) * 50.0)
            .collect();
        let by_steps = after(&mut stepped, &moments);
        let at_once = after(&mut once, &[1200.0]);
        assert!((by_steps - at_once).abs() < 1e-9);
        // Half a second of easing in, then 100 ms at full speed.
        assert!((at_once - 0.6).abs() < 1e-9);
        assert!(stepped.runs());
    }

    #[test]
    fn a_resume_starts_as_a_creep() {
        let mut clock = TrafficClock::default();
        after(&mut clock, &[0.0]);
        clock.hold();
        clock.resume(1000.0, 0.0);
        let early = after(&mut clock, &[100.0]);
        assert!(early > 0.0 && early < 0.01);
    }

    #[test]
    fn a_resume_without_a_hold_and_a_release_change_the_pace_as_asked() {
        let mut clock = TrafficClock::default();
        after(&mut clock, &[0.0]);
        clock.resume(1000.0, 0.0);
        assert_eq!(after(&mut clock, &[1000.0]), 1.0);
        clock.hold();
        clock.release();
        assert_eq!(after(&mut clock, &[2000.0]), 2.0);
    }

    #[test]
    fn hidden_traffic_asks_for_no_frames_and_shows_no_time() {
        let mut clock = TrafficClock::default();
        clock.show(false);
        assert!(!clock.runs());
        assert_eq!(clock.shown_seconds(), None);
        clock.show(true);
        assert_eq!(clock.shown_seconds(), Some(0.0));
    }
}
