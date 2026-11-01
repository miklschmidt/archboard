//! The traffic's clock. The SVG ran traffic as animations on the document's
//! timeline. Here the stage owns one clock and moves it forward from the
//! moments a frame names, so a stepped clock records it frame by frame.

/// The traffic's clock, in seconds of traffic.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct TrafficClock {
    /// Whether traffic is drawn at all: a person who asked for no motion sees none.
    shown: bool,
    seconds: f64,
    /// The moment the clock was last brought up to, in milliseconds.
    at: Option<f64>,
}

impl Default for TrafficClock {
    fn default() -> Self {
        TrafficClock {
            shown: true,
            seconds: 0.0,
            at: None,
        }
    }
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
        self.shown
    }

    /// Bring the clock up to a moment, in milliseconds.
    pub(crate) fn advance(&mut self, now: f64) {
        let before = self.at.unwrap_or(now);
        self.at = Some(now);
        self.seconds += (now - before).max(0.0) / 1000.0;
    }
}

#[cfg(test)]
mod tests {
    use super::TrafficClock;

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
