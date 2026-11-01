//! What stands on one canvas: the picture, how it is seen, and the outlines and
//! colours that draw it. A host hands this what changed and the time, and asks
//! for frames. Everything that changes over time here is worked out from the
//! clock the host gives, so a stepped clock records it frame by frame.

mod arrival;
mod frame;
mod lens;
mod lighting;
#[cfg(test)]
mod tests;

use std::collections::{HashMap, HashSet};

use archboard_scene::scene::Painting;
use kurbo::{Affine, Point};

use crate::between::{Entrance, Heading, Phases};
use crate::canvas::Canvas;
use crate::clock::TrafficClock;
use crate::draw::Picture;
use crate::flight::{Dive, DiveWay, Flight, Ghost, Leaving};
use crate::outlines::Outlines;
use crate::palette::{Palette, Theme};
use crate::pick::Targets;
use crate::presentation::{Camera, Light, Marks, Presentation};
use crate::sweep::{Sweep, Timing};
use crate::timing::{EASE_OUT, Fade, SWAP};
use crate::warnings::Warnings;
use lighting::Lighting;

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

/// The scale of the camera where the far view begins, and how long the swap takes.
#[derive(Clone, Copy, Debug, Default)]
struct FarLine {
    scale: f64,
    ms: f64,
}

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
    presentation: Presentation,
    palette: Palette,
    outlines: Outlines,
    size: (f64, f64),
    phases: Option<Phases>,
    flight: Option<Flight>,
    /// How far the picture has stepped back for the next.
    awaited: Fade,
    leaving: Option<Leaving>,
    ghost: Option<Ghost>,
    /// Boards that an earlier passage has not yet taken off the canvas.
    behind: Vec<Ghost>,
    dive: Option<Dive>,
    glide: Glide,
    far: Fade,
    far_line: FarLine,
    lighting: Lighting,
    /// Whether a picture came onto the stage with no last light on it.
    lit_afresh: bool,
    clock: TrafficClock,
    /// The subjects the code check warns about.
    warned: HashSet<String>,
    /// The last moment a frame or a change named.
    now: f64,
    /// How the picture looked in the last frame, its camera and traffic left out.
    look: Presentation,
    /// How many looks the stage has shown: what a canvas kept of one is no use
    /// to the next.
    looks: u64,
    /// Whether this frame looks as the last one did.
    settled: bool,
    /// Whether a frame of a picture was drawn yet.
    drawn: bool,
}

impl Stage {
    /// An empty stage of a size in canvas pixels.
    pub fn new(theme: Theme, size: (f64, f64)) -> Stage {
        Stage {
            shown: None,
            presentation: Presentation::default(),
            palette: Palette::of(theme),
            outlines: Outlines::default(),
            size,
            phases: None,
            flight: None,
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
            clock: TrafficClock::default(),
            warned: HashSet::new(),
            now: 0.0,
            look: Presentation::default(),
            looks: 0,
            settled: false,
            drawn: false,
        }
    }

    /// Say at which points of a move each of its parts happens.
    pub fn set_phases(&mut self, phases: Phases) {
        self.phases = Some(phases);
    }

    /// Stand a picture up, with nothing of the last one left moving.
    fn stand(&mut self, painting: Painting) {
        self.outlines.learn_icons(&painting.icons);
        self.shown = Some(Shown {
            picture: Picture::new(painting.scene),
            near: None,
            far: None,
        });
        self.flight = None;
        self.leaving = None;
        self.ghost = None;
        self.behind.clear();
        self.dive = None;
        self.presentation.sweep = None;
        self.drawn = false;
        self.looks += 1;
        self.find_warnings();
    }

    /// Put a picture on the stage in place of what stands there. The sparks of a
    /// board that bloomed inside a card run on over the board that takes over.
    pub fn show(&mut self, painting: Painting) {
        let bloom = self.bloom_of(&painting);
        let enter = self.phases.as_ref().map(|phases| phases.enter);
        self.stand(painting);
        self.lit_afresh = true;
        self.flight = bloom
            .zip(enter)
            .and_then(|(bloom, ms)| Flight::landed_from(bloom, ms, self.now));
    }

    /// The board that bloomed inside a card, when a flight has brought it here.
    fn bloom_of(&mut self, painting: &Painting) -> Option<Entrance> {
        self.dive
            .take_if(|dive| dive.way == DiveWay::In && dive.inset.scene == painting.scene)?
            .bloom
    }

    /// Carry the picture on the stage into the next, over a time in
    /// milliseconds, from what shows now. A stage with nothing to carry shows the
    /// next picture.
    pub fn carry(&mut self, painting: Painting, shift: (f64, f64), ms: f64) {
        let last = self.shown.take();
        let seen = self
            .flight
            .as_ref()
            .zip(last.as_ref())
            .map(|(flight, last)| flight.seen_at(self.now, &last.picture.scene));
        let flight = last
            .as_ref()
            .zip(self.phases.as_ref())
            .map(|(last, phases)| match &seen {
                Some((scene, back)) => {
                    let shift = (shift.0 + back.0, shift.1 + back.1);
                    Flight::carry(scene, &painting.scene, shift, phases, ms)
                }
                None => Flight::carry(&last.picture.scene, &painting.scene, shift, phases, ms),
            });
        self.stand(painting);
        self.flight = flight;
        if self.flight.is_some() {
            self.presentation.warnings = Warnings::default();
        }
    }

    /// Land whatever flies, at once.
    fn land(&mut self) {
        if self.flight.take().is_some() {
            self.find_warnings();
        }
    }

    /// Send the picture on its way out, while the next is drawn. A board that a
    /// passage is still bringing in finishes coming in first.
    pub fn leave(&mut self, heading: Heading, ms: f64, now: f64) {
        self.now = now;
        let arriving = self.ghost.as_ref().and_then(|ghost| ghost.passage_end(now));
        self.leaving = Some(Leaving {
            heading,
            axis: self.axis_of(heading, 0.0),
            start: arriving.unwrap_or(now),
            ms,
        });
    }

    /// Bring back a picture the reader returned to before anything else arrived.
    pub fn stay(&mut self) {
        self.leaving = None;
    }

    /// Take the picture off the stage.
    pub fn clear(&mut self) {
        self.shown = None;
        self.presentation.sweep = None;
        self.find_warnings();
    }

    /// Change the theme.
    pub fn set_theme(&mut self, theme: Theme) {
        self.palette = Palette::of(theme);
        self.looks += 1;
    }

    /// Change the size of the canvas, in canvas pixels.
    pub fn set_size(&mut self, size: (f64, f64)) {
        self.size = size;
    }

    /// Move the picture on the canvas, over a time in milliseconds.
    pub fn set_camera(&mut self, camera: Camera, ms: f64, now: f64) {
        self.now = now;
        let move_to = |fade: &Fade, to: f64| fade.toward(to, now, 0.0, ms, EASE_OUT);
        self.glide = Glide {
            x: move_to(&self.glide.x, camera.x),
            y: move_to(&self.glide.y, camera.y),
            scale: move_to(&self.glide.scale, camera.scale),
        };
    }

    /// Say at which scale of the camera the far view begins, in canvas pixels
    /// to a unit, and how long a swap takes in milliseconds. A picture with no
    /// far view has its line at 0.
    pub fn set_far_line(&mut self, scale: f64, ms: f64) {
        self.far_line = FarLine { scale, ms };
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
        let goal = if self.presentation.camera.scale < edge {
            1.0
        } else {
            0.0
        };
        if goal != self.far.target() {
            let ms = if self.drawn { ms } else { 0.0 };
            self.far = self.far.toward(goal, now, 0.0, ms, SWAP);
        }
    }

    /// Say what is marked on the picture.
    pub fn set_marks(&mut self, marks: Marks) {
        self.presentation.selected = marks.selected;
        self.presentation.whole = marks.whole;
        self.forget_targets();
    }

    /// Drop what the pointer could land on, because the order or the place of
    /// the parts changed. The next pick finds it again.
    fn forget_targets(&mut self) {
        if let Some(shown) = &mut self.shown {
            shown.near = None;
            shown.far = None;
        }
    }

    /// Hold the flow heads down from where the picture drew them, each by a
    /// drop in the picture's units. A head the table does not name stays where
    /// the picture drew it. The heads follow the camera, so a page says them
    /// apart from the marks.
    pub fn set_heads(&mut self, heads: HashMap<String, f64>) {
        self.presentation.heads = heads;
        self.forget_targets();
    }

    /// Name the subject whose control the pointer rests on, or none.
    pub fn set_hovered_toggle(&mut self, subject: Option<&str>) {
        self.presentation.hovered_toggle = subject.map(str::to_owned);
    }

    /// Say which subjects the code check warns about.
    pub fn set_warnings(&mut self, warned: HashSet<String>) {
        self.warned = warned;
        self.find_warnings();
    }

    /// Find where the warnings stand in the picture on the stage.
    fn find_warnings(&mut self) {
        self.presentation.warnings = match &self.shown {
            Some(shown) if !self.warned.is_empty() => {
                Warnings::find(&shown.picture.scene, &self.warned)
            }
            _ => Warnings::default(),
        };
    }

    /// Show the traffic, or hide it for a person who asked for no motion.
    pub fn set_traffic_shown(&mut self, shown: bool) {
        self.clock.show(shown);
    }

    /// Stand the traffic's clock at a time in seconds, so that the traffic of a
    /// picture that replaces another runs on from where the other's was.
    pub fn set_picture_time(&mut self, seconds: f64) {
        self.clock.set_seconds(seconds);
    }

    /// Where the traffic's clock stands, in seconds.
    pub fn picture_time(&self) -> f64 {
        self.clock.seconds()
    }

    /// Draw on the lines of the relationships that light, each after its delay
    /// in milliseconds. A line takes its length over a speed, between the
    /// shortest and the longest time. It replaces any sweep that runs.
    pub fn sweep(
        &mut self,
        delays: &HashMap<String, f64>,
        shortest_ms: f64,
        longest_ms: f64,
        now: f64,
    ) {
        self.now = now;
        let timing = Timing {
            shortest: shortest_ms,
            longest: longest_ms,
            now,
        };
        self.presentation.sweep = self
            .shown
            .as_ref()
            .and_then(|shown| Sweep::of(&shown.picture.scene, delays, timing));
    }

    /// Take the sweep away.
    pub fn clear_sweep(&mut self) {
        self.presentation.sweep = None;
    }

    /// Say whether the next picture is on its way, and how long the picture on
    /// the stage takes to step back for it or to step forward again. It starts a
    /// flight at the reader's click, while the next picture is still being drawn.
    pub fn set_awaited(&mut self, awaited: bool, ms: f64, now: f64) {
        self.now = now;
        let goal = if awaited { 1.0 } else { 0.0 };
        self.awaited = self.awaited.toward(goal, now, 0.0, ms, EASE_OUT);
    }

    /// Light the picture.
    pub fn set_light(&mut self, light: &Light, now: f64) {
        self.now = now;
        self.lighting.set(light, now);
    }

    /// Bring every changing value to a moment.
    fn advance(&mut self, now: f64) {
        self.now = now;
        self.presentation.camera = Camera {
            x: self.glide.x.at(now),
            y: self.glide.y.at(now),
            scale: self.glide.scale.at(now),
        };
        self.swap_views(now);
        self.presentation.far = self.far.at(now);
        if let Some(flight) = &mut self.flight {
            flight.begin(now);
        }
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
        let look = Presentation {
            camera: Camera::default(),
            traffic: None,
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
    fn changing(&self, now: f64) -> bool {
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

    /// Draw the frame of a moment, in milliseconds. A stage with no picture
    /// draws nothing.
    pub fn draw<C: Canvas>(&mut self, canvas: &mut C, now: f64) -> bool {
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
        self.changing(now)
    }

    /// What lies under a point of the canvas, the topmost first: each by the
    /// number of its marked group, or -1 for a shape that stands in none.
    pub fn pick(&mut self, x: f64, y: f64) -> Vec<i32> {
        let far = self.far.target() > 0.5;
        let camera = self.presentation.camera;
        let Some(shown) = &mut self.shown else {
            return Vec::new();
        };
        let scene = &shown.picture.scene;
        let presentation = &self.presentation;
        let targets = if far { &mut shown.far } else { &mut shown.near };
        let targets = targets.get_or_insert_with(|| Targets::of(scene, far, presentation));
        let to_picture =
            (Affine::translate((camera.x, camera.y)) * Affine::scale(camera.scale)).inverse();
        targets.under(to_picture * Point::new(x, y))
    }
}
