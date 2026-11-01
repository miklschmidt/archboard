//! How a picture arrives with nothing to carry it from: part by part over what
//! is left of the last one, or inside the card the camera flies into.

use archboard_scene::geometry::Rect;
use archboard_scene::scene::Painting;
use kurbo::Point;

use super::Stage;
use crate::between::{Entrance, Handover, Heading, frame_of};
use crate::draw::Picture;
use crate::flight::{Dive, DiveWay, Flight, Ghost, Stretch};
use crate::passage::{Axis, Plane};
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
        let next_width = painting.scene.width * self.presentation.camera.scale;
        let mut ghost = self.ghost_of_last((heading, next_width), ms, moved, now);
        let handover = ghost.as_ref().map(|ghost| Handover {
            last: &ghost.picture.scene,
            shown: ghost.shown(),
        });
        // A passage carries the next board as one plane, so it has no entrance.
        let passes = ghost.as_ref().is_some_and(|ghost| ghost.axis.is_some());
        let flight = self
            .phases
            .as_ref()
            .filter(|_| !passes)
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

    /// The line of the passage a heading starts, if it starts one, with the width
    /// of the board it goes to as far as that is known. A picture has no place in
    /// the module tree against no heading, or a view of its own board.
    pub(super) fn axis_of(&self, heading: Heading, next_width: f64) -> Option<Axis> {
        let camera = self.presentation.camera;
        let (width, height) = self.size;
        let middle = Point::new(width / 2.0, height / 2.0);
        match heading {
            Heading::Into { toward } => Some(Axis::In(toward.map_or(middle, |card| {
                Point::new(
                    (card.x + card.width / 2.0) * camera.scale + camera.x,
                    (card.y + card.height / 2.0) * camera.scale + camera.y,
                )
            }))),
            Heading::Out => Some(Axis::Out(middle)),
            Heading::Across { side } => side.map(|side| {
                let shown = self
                    .shown
                    .as_ref()
                    .map_or(0.0, |shown| shown.picture.scene.width * camera.scale);
                Axis::across(side, self.size, shown.max(next_width))
            }),
        }
    }

    /// What is left of the picture on the stage, as a ghost. On a passage it stands
    /// where the click took it, and a board that a passage was still bringing in
    /// goes on from where it stood.
    fn ghost_of_last(
        &mut self,
        (heading, next_width): (Option<Heading>, f64),
        ms: f64,
        moved: (f64, f64),
        now: f64,
    ) -> Option<Ghost> {
        let exit = self.phases.as_ref()?.exit;
        let held = self
            .ghost
            .as_ref()
            .and_then(|ghost| ghost.passage(now))
            .map_or(Plane::STILL, |(axis, place)| axis.arrived(place));
        let leaving = self.leaving.take();
        let from = leaving
            .as_ref()
            .map_or(0.0, |leaving| leaving.progress(now));
        let heading = leaving
            .as_ref()
            .map(|leaving| leaving.heading)
            .or(heading)
            .unwrap_or(Heading::Across { side: None });
        let stepped = leaving.as_ref().and_then(|leaving| leaving.passage(now));
        let axis = self.axis_of(heading, next_width).map(|axis| {
            let place = stepped.map_or(0.0, |(line, place)| line.place_on(axis, place));
            (axis, place)
        });
        let last = self.shown.take()?;
        let camera = self.presentation.camera;
        Some(Ghost {
            picture: last.picture,
            camera: Camera {
                x: camera.x + moved.0,
                y: camera.y + moved.1,
                ..camera
            },
            from,
            time: Stretch::of(if axis.is_some() {
                ms
            } else {
                exit * (1.0 - from)
            }),
            axis,
            held,
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
