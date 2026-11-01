//! How a picture arrives with nothing to carry it from: part by part over what
//! is left of the last one, or inside the card the camera flies into.

use archboard_scene::geometry::Rect;
use archboard_scene::scene::Painting;

use super::Stage;
use crate::between::{Entrance, Handover, Heading, frame_of};
use crate::draw::Picture;
use crate::flight::{Dive, DiveWay, Flight, Ghost, Stretch};
use crate::presentation::Camera;
use crate::warnings::Warnings;

impl Stage {
    /// Bring a picture in part by part, what is left of the last one finishing
    /// over it, where it was last seen, moved with its pane by `moved` canvas
    /// pixels. `heading` says where the reader went when the picture was never
    /// sent on its way.
    pub fn enter(
        &mut self,
        painting: Painting,
        heading: Option<Heading>,
        ms: f64,
        moved: (f64, f64),
        now: f64,
    ) {
        self.now = now;
        let mut ghost = self.ghost_of_last(heading, moved, now);
        let handover = ghost.as_ref().map(|ghost| Handover {
            last: &ghost.picture.scene,
            shown: ghost.shown(),
        });
        let flight = self
            .phases
            .as_ref()
            .map(|phases| Flight::enter(&painting.scene, phases, ms, handover));
        if let (Some(ghost), Some(flown)) = (&mut ghost, flight.as_ref().and_then(Flight::flown)) {
            ghost.hand_over(flown);
        }
        self.stand(painting);
        self.lit_afresh = true;
        self.ghost = ghost;
        self.flight = flight;
        if self.flight.is_some() {
            self.presentation.warnings = Warnings::default();
        }
    }

    /// What is left of the picture on the stage, as a ghost.
    fn ghost_of_last(
        &mut self,
        heading: Option<Heading>,
        moved: (f64, f64),
        now: f64,
    ) -> Option<Ghost> {
        let exit = self.phases.as_ref()?.exit;
        let last = self.shown.take()?;
        let leaving = self.leaving.take();
        let from = leaving
            .as_ref()
            .map_or(0.0, |leaving| leaving.progress(now));
        let camera = self.presentation.camera;
        Some(Ghost {
            picture: last.picture,
            heading: leaving
                .map(|leaving| leaving.heading)
                .or(heading)
                .unwrap_or(Heading::Across),
            camera: Camera {
                x: camera.x + moved.0,
                y: camera.y + moved.1,
                ..camera
            },
            from,
            time: Stretch::of(exit * (1.0 - from)),
            look: self.look.clone(),
        })
    }

    /// Put a board inside its card, and start the fades of the flight between
    /// the two. `flight` is the flight's way, and the card it flies into.
    pub fn dive(
        &mut self,
        painting: Painting,
        frame: Rect,
        (way, card): (DiveWay, String),
        ms: f64,
        now: f64,
    ) {
        self.now = now;
        self.outlines.learn_icons(&painting.icons);
        let card_box = self
            .shown
            .as_ref()
            .and_then(|shown| frame_of(&shown.picture.scene, &card));
        let bloom = self
            .phases
            .as_ref()
            .map(|phases| Entrance::new(&painting.scene, phases, None));
        self.dive = Some(Dive {
            inset: Picture::new(painting.scene),
            bloom,
            frame,
            card_box,
            card,
            way,
            start: now,
            ms,
        });
    }

    /// Take the board inside a card away, and the fades with it.
    pub fn end_dive(&mut self) {
        self.dive = None;
        self.presentation.fading_words = None;
    }
}
