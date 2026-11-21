//! The traffic's clock. The SVG ran traffic as animations on the document's
//! timeline. Here the stage owns one clock and moves it forward from the
//! moments a frame names, so a stepped clock records it frame by frame.

/// The stage's time: the host's, less the stalls. A long task or a busy GPU can
/// hold a frame back for a second, and a flight that went on through it would
/// reach the reader finished. So one step of this clock is never longer than a
/// longest step, and all that moves waits for the frames that show it.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub(crate) struct StageClock {
    /// The latest moment the host named, in milliseconds.
    host: Option<f64>,
    /// How much of the host's time the stalls took.
    lost: f64,
    /// The longest step, in milliseconds. Without one, nothing is lost.
    longest: Option<f64>,
}

impl StageClock {
    /// A clock whose steps are at most a longest step, in milliseconds. With
    /// none, nothing is lost.
    pub(crate) fn new(longest: Option<f64>) -> StageClock {
        StageClock {
            longest,
            ..StageClock::default()
        }
    }

    /// The stage's moment for a moment of the host. A moment earlier than the
    /// latest counts as the latest: a frame's stamp is older than a change that
    /// a long task made in its turn.
    pub(crate) fn at(&mut self, host: f64) -> f64 {
        let last = self.host.unwrap_or(host);
        let host = host.max(last);
        if let Some(longest) = self.longest {
            self.lost += (host - last - longest).max(0.0);
        }
        self.host = Some(host);
        host - self.lost
    }
}

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
