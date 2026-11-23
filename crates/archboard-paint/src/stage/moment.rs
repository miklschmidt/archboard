//! A stage brought to a moment: every changing value worked out from the
//! clock, whether the frame looks as the last one did, and whether anything
//! still moves.

use archboard_scene::paint::design::mark_growth;

use super::Stage;
use crate::draw::play_at;
use crate::presentation::{Camera, Playing, Presentation};

impl Stage {
    /// Start a flight's clock, and tell it where the last picture stands.
    fn take_off(&mut self, now: f64) {
        let Some(flight) = &mut self.flight else {
            return;
        };
        flight.begin(now);
        if let Some(ghost) = &self.ghost {
            flight.rebase(ghost.camera, self.presentation.camera);
        }
    }

    /// Bring every changing value to a moment.
    pub(super) fn advance(&mut self, now: f64) {
        self.now = now;
        self.presentation.camera = Camera {
            x: self.glide.x.at(now),
            y: self.glide.y.at(now),
            scale: self.glide.scale.at(now),
        };
        self.swap_views(now);
        self.presentation.far = self.far.at(now);
        self.presentation.mark_growth = self
            .pixel_ratio
            .map(|ratio| mark_growth(ratio, self.presentation.camera.scale));
        self.plays
            .retain(|(_, start)| play_at(*start, now).is_some());
        self.presentation.plays = self
            .plays
            .iter()
            .filter_map(|(id, start)| {
                Some(Playing {
                    id: id.clone(),
                    at: play_at(*start, now)?,
                })
            })
            .collect();
        self.take_off(now);
        if std::mem::take(&mut self.lit_afresh) {
            self.lighting.stand();
        }
        if let Some(ghost) = &mut self.ghost {
            ghost.time.begin(now);
        }
        if self
            .flight
            .as_ref()
            .is_some_and(|flight| flight.landed(now))
        {
            self.land();
        }
        self.ghost = self.ghost.take().filter(|ghost| !ghost.gone(now));
        self.behind.retain(|ghost| !ghost.gone(now));
        self.presentation.fading_words = self
            .dive
            .as_ref()
            .map(|dive| (dive.card.clone(), dive.fades(now).words));
        self.clock.advance(now);
        self.presentation.traffic = self.clock.shown_seconds();
        self.presentation.sweep = self
            .presentation
            .sweep
            .take()
            .filter(|sweep| !sweep.over(now));
        if let Some(sweep) = &mut self.presentation.sweep {
            sweep.advance(now);
        }
        self.presentation.recede = self.lighting.recede_at(now);
        self.presentation.awaited = self.awaited.at(now);
        self.settle();
    }

    /// Say whether this frame looks as the last one did.
    fn settle(&mut self) {
        // A play changes its line every frame, and the line is never kept;
        // only a play that starts or ends changes the look.
        let look = Presentation {
            camera: Camera::default(),
            traffic: None,
            plays: self
                .presentation
                .plays
                .iter()
                .map(|playing| Playing {
                    at: 0.0,
                    ..playing.clone()
                })
                .collect(),
            ..self.presentation.clone()
        };
        self.settled = look == self.look;
        if !self.settled {
            self.look = look;
            self.looks += 1;
        }
    }

    /// Whether traffic runs on the picture, so that every frame differs.
    fn moving_traffic(&self) -> bool {
        self.clock.runs()
            && self
                .shown
                .as_ref()
                .is_some_and(|shown| shown.picture.traffic)
    }

    /// Whether a value is still changing at a moment.
    pub(super) fn changing(&self, now: f64) -> bool {
        self.moving_traffic() || self.moving(now)
    }

    /// Whether traffic is all that moves at a moment.
    #[must_use]
    pub fn traffic_alone(&self, now: f64) -> bool {
        self.moving_traffic() && !self.moving(now)
    }

    /// Whether anything but traffic moves at a moment.
    fn moving(&self, now: f64) -> bool {
        self.flying(now)
            || !self.plays.is_empty()
            || self.presentation.sweep.is_some()
            || self.lighting.moving(now)
            || ![
                self.glide.x,
                self.glide.y,
                self.glide.scale,
                self.far,
                self.awaited,
            ]
            .iter()
            .all(|fade| fade.done(now))
    }

    /// Whether a whole picture is on the move at a moment.
    fn flying(&self, now: f64) -> bool {
        self.flight.is_some()
            || self.ghost.is_some()
            || self
                .leaving
                .as_ref()
                .is_some_and(|leaving| leaving.progress(now) < 1.0)
            || self.dive.as_ref().is_some_and(|dive| !dive.ended(now))
    }
}
