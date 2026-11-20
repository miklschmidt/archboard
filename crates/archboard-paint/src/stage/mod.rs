//! What stands on one canvas: the picture, how it is seen, and the outlines and
//! colours that draw it. A host says how the picture is seen, which picture
//! arrives and how, and which departs, and asks for frames. Everything that
//! changes over time here is worked out from the moments the host names, on
//! the stage's own clock, so a stepped clock records it frame by frame.

mod arrival;
mod frame;
#[cfg(test)]
mod interrupted;
mod lens;
mod lighting;
mod present;
mod said;
#[cfg(test)]
mod tests;

use std::collections::HashSet;

use archboard_painting::{ViewerMarks, viewer_marks};
use archboard_scene::scene::Painting;
use kurbo::{Affine, Point};

use crate::between::{Between, Phases};
use crate::canvas::Canvas;
use crate::clock::{StageClock, TrafficClock};
use crate::draw::Picture;
use crate::flight::{Arriving, Dive, DiveWay, Ghost, Leaving};
use crate::outlines::Outlines;
use crate::palette::{Palette, Theme};
use crate::parts::Parts;
use crate::passage::Heading;
use crate::pick::Targets;
use crate::presentation::{Camera, FarLine, Seen};
use crate::timing::{Fade, SWAP};
use crate::warnings::Warnings;
use lighting::Lighting;
pub use said::{Arrival, Departure, Motion, Pace, Surface};

/// The camera, on its way to where it was told to go.
#[derive(Clone, Copy, Debug)]
struct Glide {
    x: Fade,
    y: Fade,
    scale: Fade,
}

/// How far past the far line the camera goes before the views swap, as a share
/// of the line. A camera that rests on the line does not swap back and forth.
const FAR_MARGIN: f64 = 0.02;

/// The picture on the stage, and what takes the pointer in each of its views.
#[derive(Debug)]
struct Shown {
    picture: Picture,
    near: Option<Targets>,
    far: Option<Targets>,
}

/// One canvas's picture and all that a frame of it needs.
#[derive(Debug)]
pub struct Stage {
    shown: Option<Shown>,
    seen: Seen,
    palette: Palette,
    /// The marks the painter draws a viewer's lines, warnings and far view by,
    /// read once.
    marks: ViewerMarks,
    outlines: Outlines,
    size: (f64, f64),
    phases: Option<Phases>,
    arriving: Option<Arriving>,
    /// How far the picture has stepped back for the next.
    awaited: Fade,
    leaving: Option<Leaving>,
    ghost: Option<Ghost>,
    /// Pictures that an earlier passage has not yet taken off the canvas.
    behind: Vec<Ghost>,
    dive: Option<Dive>,
    glide: Glide,
    far: Fade,
    far_line: FarLine,
    lighting: Lighting,
    /// Whether a picture came onto the stage with no last light on it.
    lit_afresh: bool,
    traffic: TrafficClock,
    /// The stage's time: the host's, less its stalls.
    clock: StageClock,
    /// What the stage keeps for its strip canvases.
    parts: Parts,
    /// The subjects the code check warns about.
    warned: HashSet<String>,
    /// The last moment a frame or a change named.
    now: f64,
    /// How the picture looked in the last frame, its camera and traffic left out.
    look: Seen,
    /// How many looks the stage has shown: what a canvas kept of one is no use
    /// to the next.
    looks: u64,
    /// Whether this frame looks as the last one did.
    settled: bool,
    /// Whether a frame of a picture was drawn yet.
    drawn: bool,
}

impl Stage {
    /// An empty stage of a size in canvas pixels, that keeps a pace.
    pub fn new(theme: Theme, size: (f64, f64), pace: Pace) -> Stage {
        Stage {
            shown: None,
            seen: Seen::default(),
            palette: Palette::of(theme),
            marks: viewer_marks(),
            outlines: Outlines::default(),
            size,
            phases: pace.phases,
            arriving: None,
            awaited: Fade::still(0.0),
            leaving: None,
            ghost: None,
            behind: Vec::new(),
            dive: None,
            glide: Glide {
                x: Fade::still(0.0),
                y: Fade::still(0.0),
                scale: Fade::still(1.0),
            },
            far: Fade::still(0.0),
            far_line: FarLine::default(),
            lighting: Lighting::default(),
            lit_afresh: false,
            traffic: TrafficClock::default(),
            clock: StageClock::new(pace.longest_step),
            parts: Parts::new(size),
            warned: HashSet::new(),
            now: 0.0,
            look: Seen::default(),
            looks: 0,
            settled: false,
            drawn: false,
        }
    }

    /// Bring a picture onto the stage.
    pub fn arrive(&mut self, painting: Painting, arrival: Arrival) {
        match arrival {
            Arrival::Cut => self.show(painting),
            Arrival::Carried { shift, ms } => self.carry(painting, shift, ms),
            Arrival::Entered {
                heading,
                ms,
                moved,
                at,
            } => {
                let now = self.clock.at(at);
                self.enter(painting, heading, ms, moved, now);
            }
            Arrival::Into {
                frame,
                way,
                card,
                ms,
                at,
            } => {
                let now = self.clock.at(at);
                self.dive(painting, frame, (way, card), ms, now);
            }
        }
    }

    /// Say what becomes of the picture on the stage.
    pub fn depart(&mut self, departure: Departure) {
        match departure {
            Departure::Leaving { heading, ms, at } => {
                let now = self.clock.at(at);
                self.leave(heading, ms, now);
            }
            Departure::Stayed => self.leaving = None,
            Departure::Cleared => self.clear(),
            Departure::OutOfCard => self.end_dive(),
        }
    }

    /// Stand a picture up, with nothing of the last one left moving.
    fn stand(&mut self, painting: Painting) {
        self.outlines.learn_icons(&painting.icons);
        self.shown = Some(Shown {
            picture: Picture::new(painting.scene),
            near: None,
            far: None,
        });
        self.arriving = None;
        self.leaving = None;
        self.ghost = None;
        self.behind.clear();
        self.dive = None;
        self.seen.sweep = None;
        self.drawn = false;
        self.looks += 1;
        self.find_warnings();
    }

    /// Put a picture on the stage in place of what stands there. The sparks of a
    /// picture that bloomed inside a card run on over the picture that takes over.
    fn show(&mut self, painting: Painting) {
        let bloom = self.bloom_of(&painting);
        let enter = self.phases.as_ref().map(|phases| phases.enter);
        self.stand(painting);
        self.lit_afresh = true;
        self.arriving = bloom
            .zip(enter)
            .and_then(|(bloom, ms)| Arriving::landed_from(bloom, ms, self.now));
    }

    /// The picture that bloomed inside a card, when a flight has brought it here.
    fn bloom_of(&mut self, painting: &Painting) -> Option<Between> {
        self.dive
            .take_if(|dive| dive.way == DiveWay::In && dive.inset.scene == painting.scene)?
            .bloom
    }

    /// Carry the picture on the stage into the next, over a time in
    /// milliseconds, from what shows now. A stage with nothing to carry shows the
    /// next picture.
    fn carry(&mut self, painting: Painting, shift: (f64, f64), ms: f64) {
        let last = self.shown.take();
        let seen = self
            .arriving
            .as_ref()
            .zip(last.as_ref())
            .map(|(arriving, last)| arriving.seen_at(self.now, &last.picture.scene));
        let arriving = last
            .as_ref()
            .zip(self.phases.as_ref())
            .map(|(last, phases)| match &seen {
                Some((scene, back)) => {
                    let shift = (shift.0 + back.0, shift.1 + back.1);
                    Between::carry(scene, &painting.scene, shift, phases)
                }
                None => Between::carry(&last.picture.scene, &painting.scene, shift, phases),
            })
            .map(|between| Arriving::new(between, ms));
        let ghost = self.ghost.take();
        let behind = std::mem::take(&mut self.behind);
        let leaving = self.leaving.take();
        self.stand(painting);
        self.ghost = ghost;
        self.behind = behind;
        self.leaving = leaving;
        self.arriving = arriving;
        if self.arriving.is_some() {
            self.seen.warnings = Warnings::default();
        }
    }

    /// Land whatever flies, at once.
    fn land(&mut self) {
        if self.arriving.take().is_some() {
            self.find_warnings();
        }
    }

    /// Send the picture on its way out, while the next is drawn. A picture that a
    /// passage is still bringing in finishes coming in first.
    fn leave(&mut self, heading: Heading, ms: f64, now: f64) {
        self.now = now;
        let arriving = self.ghost.as_ref().and_then(|ghost| ghost.passage_end(now));
        self.leaving = Some(Leaving {
            heading,
            axis: self.axis_of(heading, 0.0),
            start: arriving.unwrap_or(now),
            ms,
        });
    }

    /// Take the picture off the stage.
    fn clear(&mut self) {
        self.shown = None;
        self.seen.sweep = None;
        self.find_warnings();
    }

    /// Start the swap between the views when the camera crosses the far line,
    /// wherever it is going. A picture that is only now coming in has nothing to
    /// swap from.
    fn swap_views(&mut self, now: f64) {
        let FarLine { scale, ms } = self.far_line;
        let far = self.far.target() > 0.5;
        let edge = scale
            * if far {
                1.0 + FAR_MARGIN
            } else {
                1.0 - FAR_MARGIN
            };
        let goal = if self.seen.camera.scale < edge {
            1.0
        } else {
            0.0
        };
        if goal != self.far.target() {
            let ms = if self.drawn { ms } else { 0.0 };
            self.far = self.far.toward(goal, now, 0.0, ms, SWAP);
        }
    }

    /// Find where the warnings stand in the picture on the stage.
    fn find_warnings(&mut self) {
        self.seen.warnings = match &self.shown {
            Some(shown) if !self.warned.is_empty() => {
                Warnings::find(&shown.picture.scene, &self.warned, &self.marks)
            }
            _ => Warnings::default(),
        };
    }

    /// Start the clock of a picture's arrival, and tell it where the last
    /// picture stands.
    fn take_off(&mut self, now: f64) {
        let Some(arriving) = &mut self.arriving else {
            return;
        };
        arriving.begin(now);
        if let Some(ghost) = &self.ghost {
            arriving.rebase(ghost.camera, self.seen.camera);
        }
    }

    /// Bring every changing value to a moment.
    fn advance(&mut self, now: f64) {
        self.now = now;
        self.seen.camera = Camera {
            x: self.glide.x.at(now),
            y: self.glide.y.at(now),
            scale: self.glide.scale.at(now),
        };
        self.swap_views(now);
        self.seen.far = self.far.at(now);
        self.take_off(now);
        if std::mem::take(&mut self.lit_afresh) {
            self.lighting.stand();
        }
        if let Some(ghost) = &mut self.ghost {
            ghost.time.begin(now);
        }
        if self
            .arriving
            .as_ref()
            .is_some_and(|arriving| arriving.landed(now))
        {
            self.land();
        }
        self.ghost = self.ghost.take().filter(|ghost| !ghost.gone(now));
        self.behind.retain(|ghost| !ghost.gone(now));
        self.seen.fading_words = self
            .dive
            .as_ref()
            .map(|dive| (dive.card.clone(), dive.fades(now).words));
        self.traffic.advance(now);
        self.seen.traffic = self.traffic.shown_seconds();
        self.seen.sweep = self.seen.sweep.take().filter(|sweep| !sweep.over(now));
        if let Some(sweep) = &mut self.seen.sweep {
            sweep.advance(now);
        }
        self.seen.recede = self.lighting.recede_at(now);
        self.seen.awaited = self.awaited.at(now);
        self.settle();
    }

    /// Say whether this frame looks as the last one did.
    fn settle(&mut self) {
        let look = Seen {
            camera: Camera::default(),
            traffic: None,
            ..self.seen.clone()
        };
        self.settled = look == self.look;
        if !self.settled {
            self.look = look;
            self.looks += 1;
        }
    }

    /// Whether traffic runs on the picture, so that every frame differs.
    fn moving_traffic(&self) -> bool {
        self.traffic.runs()
            && self
                .shown
                .as_ref()
                .is_some_and(|shown| shown.picture.traffic)
    }

    /// What moves at a moment.
    fn motion(&self, now: f64) -> Motion {
        if self.moving(now) {
            Motion::Moving
        } else if self.moving_traffic() {
            Motion::TrafficAlone
        } else {
            Motion::Still
        }
    }

    /// Whether anything but traffic moves at a moment.
    fn moving(&self, now: f64) -> bool {
        self.flying(now)
            || self.seen.sweep.is_some()
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
        self.arriving.is_some()
            || self.ghost.is_some()
            || self
                .leaving
                .as_ref()
                .is_some_and(|leaving| leaving.progress(now) < 1.0)
            || self.dive.as_ref().is_some_and(|dive| !dive.ended(now))
    }

    /// Draw the frame of a moment of the host's clock, in milliseconds, and say
    /// what moves after it. A stage with no picture draws nothing.
    pub fn draw<C: Canvas>(&mut self, on: Surface<'_, C>, now: f64) -> Motion {
        let now = self.clock.at(now);
        match on {
            Surface::Direct(canvas) => self.frame(canvas, now),
            Surface::Strips(canvas) => {
                let mut parts = std::mem::take(&mut self.parts);
                let motion = self.frame(&mut parts.over(canvas), now);
                self.parts = parts;
                motion
            }
        }
    }

    /// Draw the frame of a moment of the stage's clock.
    fn frame<C: Canvas>(&mut self, canvas: &mut C, now: f64) -> Motion {
        // A frame's stamp is older than a change that a long task made in its turn.
        let now = now.max(self.now);
        self.advance(now);
        if self.shown.is_some() {
            self.draw_frame(canvas, now);
            if let Some((lens, ground)) = self.lens_at(now) {
                canvas.look_through(lens, ground);
            }
            self.drawn = true;
        }
        self.motion(now)
    }

    /// What lies under a point of the canvas, the topmost first: each by the
    /// number of its marked group, or -1 for a shape that stands in none.
    pub fn pick(&mut self, x: f64, y: f64) -> Vec<i32> {
        let far = self.far.target() > 0.5;
        let camera = self.seen.camera;
        let Some(shown) = &mut self.shown else {
            return Vec::new();
        };
        let scene = &shown.picture.scene;
        let seen = &self.seen;
        let targets = if far { &mut shown.far } else { &mut shown.near };
        let targets = targets.get_or_insert_with(|| Targets::of(scene, far, seen));
        let to_picture =
            (Affine::translate((camera.x, camera.y)) * Affine::scale(camera.scale)).inverse();
        targets.under(to_picture * Point::new(x, y))
    }
}
