//! What stands on one canvas: the picture, how it is seen, and the outlines and
//! colours that draw it. A host hands this what changed and the time, and asks
//! for frames. Everything that changes over time here is worked out from the
//! clock the host gives, so a stepped clock records it frame by frame.

use std::collections::{HashMap, HashSet};

use archboard_scene::geometry::Rect;
use archboard_scene::scene::{Item, Painting};
use kurbo::{Affine, Point, Shape as _};

use crate::between::{Heading, Phases, departure};
use crate::canvas::Canvas;
use crate::clock::TrafficClock;
use crate::draw::{Inks, Picture, draw_ground, draw_items};
use crate::flight::{Dive, DiveWay, Flight, Ghost, Leaving};
use crate::outlines::Outlines;
use crate::palette::{Palette, Theme};
use crate::path::{placed, rect_of};
use crate::pick::Targets;
use crate::presentation::{Camera, Light, Marks, Presentation};
use crate::sweep::{Sweep, Timing};
use crate::timing::{EASE_OUT, Fade, SWAP};
use crate::warnings::Warnings;

/// The camera, on its way to where it was told to go.
#[derive(Clone, Copy, Debug)]
struct Glide {
    x: Fade,
    y: Fade,
    scale: Fade,
}

/// One subject in the light, and whether it stays there when its fade ends.
#[derive(Clone, Copy, Debug)]
struct Shining {
    fade: Fade,
    staying: bool,
}

/// How the picture stands in the light, as time goes on.
#[derive(Clone, Debug)]
struct Lighting {
    rest: Fade,
    labels: Fade,
    subjects: HashMap<String, Shining>,
}

impl Default for Lighting {
    fn default() -> Self {
        Lighting {
            rest: Fade::still(1.0),
            labels: Fade::still(1.0),
            subjects: HashMap::new(),
        }
    }
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
    leaving: Option<Leaving>,
    ghost: Option<Ghost>,
    dive: Option<Dive>,
    glide: Glide,
    far: Fade,
    lighting: Lighting,
    clock: TrafficClock,
    /// The subjects the code check warns about.
    warned: HashSet<String>,
    /// The last moment a frame or a change named.
    now: f64,
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
            leaving: None,
            ghost: None,
            dive: None,
            glide: Glide {
                x: Fade::still(0.0),
                y: Fade::still(0.0),
                scale: Fade::still(1.0),
            },
            far: Fade::still(0.0),
            lighting: Lighting::default(),
            clock: TrafficClock::default(),
            warned: HashSet::new(),
            now: 0.0,
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
        self.dive = None;
        self.presentation.sweep = None;
        self.find_warnings();
    }

    /// Put a picture on the stage in place of what stands there.
    pub fn show(&mut self, painting: Painting) {
        self.stand(painting);
    }

    /// Carry the picture on the stage into the next, over a time in
    /// milliseconds. A stage with nothing to carry shows the next picture.
    pub fn carry(&mut self, painting: Painting, shift: (f64, f64), ms: f64, now: f64) {
        let last = self.shown.take();
        let flight = last
            .as_ref()
            .zip(self.phases.as_ref())
            .map(|(last, phases)| {
                Flight::carry(
                    &last.picture.scene,
                    &painting.scene,
                    shift,
                    phases,
                    (now, ms),
                )
            });
        self.stand(painting);
        self.flight = flight;
        if self.flight.is_some() {
            self.presentation.warnings = Warnings::default();
        }
    }

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
        self.ghost = self.ghost_of_last(heading, moved, now);
        let flight = self
            .phases
            .as_ref()
            .map(|phases| Flight::enter(&painting.scene, phases, (now, ms)));
        self.stand(painting);
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
            start: now,
            ms: exit * (1.0 - from),
        })
    }

    /// Land whatever flies, at once.
    pub fn land(&mut self) {
        if self.flight.take().is_some() {
            self.find_warnings();
        }
    }

    /// Send the picture on its way out, while the next is drawn.
    pub fn leave(&mut self, heading: Heading, ms: f64, now: f64) {
        self.leaving = Some(Leaving {
            heading,
            start: now,
            ms,
        });
    }

    /// Bring back a picture the reader returned to before anything else arrived.
    pub fn stay(&mut self) {
        self.leaving = None;
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
        self.outlines.learn_icons(&painting.icons);
        self.dive = Some(Dive {
            inset: Picture::new(painting.scene),
            frame,
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

    /// Take the picture off the stage.
    pub fn clear(&mut self) {
        self.shown = None;
        self.presentation.sweep = None;
        self.find_warnings();
    }

    /// Change the theme.
    pub fn set_theme(&mut self, theme: Theme) {
        self.palette = Palette::of(theme);
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

    /// Swap between the near and the far view, over a time in milliseconds.
    pub fn set_far(&mut self, far: bool, ms: f64, now: f64) {
        self.now = now;
        let to = if far { 1.0 } else { 0.0 };
        if self.far.target() != to {
            self.far = self.far.toward(to, now, 0.0, ms, SWAP);
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

    /// Stand the traffic still, and keep it so until it is resumed.
    pub fn hold_traffic(&mut self) {
        self.clock.hold();
    }

    /// Bring the held traffic back to its speed over a time in milliseconds,
    /// from standing still, easing in and out. Traffic that is not held keeps
    /// its pace.
    pub fn resume_traffic(&mut self, ms: f64, now: f64) {
        self.now = now;
        self.clock.resume(ms, now);
    }

    /// Let the held traffic go at its speed at once.
    pub fn release_traffic(&mut self) {
        self.clock.release();
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

    /// Light the picture.
    pub fn set_light(&mut self, light: &Light, now: f64) {
        self.now = now;
        let ms = light.duration;
        let lighting = &mut self.lighting;
        lighting.rest = lighting.rest.toward(light.rest, now, 0.0, ms, EASE_OUT);
        lighting.labels = lighting.labels.toward(light.labels, now, 0.0, ms, EASE_OUT);
        for (id, shining) in &mut lighting.subjects {
            if !light.subjects.contains_key(id) {
                shining.fade = shining.fade.toward(light.rest, now, 0.0, ms, EASE_OUT);
                shining.staying = false;
            }
        }
        for (id, shine) in &light.subjects {
            let from = lighting
                .subjects
                .get(id)
                .map_or(lighting.rest, |shining| shining.fade);
            lighting.subjects.insert(
                id.clone(),
                Shining {
                    fade: from.toward(shine.opacity, now, shine.delay, ms, EASE_OUT),
                    staying: true,
                },
            );
        }
    }

    /// Bring every changing value to a moment.
    fn advance(&mut self, now: f64) {
        self.now = now;
        self.presentation.camera = Camera {
            x: self.glide.x.at(now),
            y: self.glide.y.at(now),
            scale: self.glide.scale.at(now),
        };
        self.presentation.far = self.far.at(now);
        if self
            .flight
            .as_ref()
            .is_some_and(|flight| flight.landed(now))
        {
            self.land();
        }
        self.ghost = self.ghost.take().filter(|ghost| !ghost.gone(now));
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
        let lighting = &mut self.lighting;
        lighting
            .subjects
            .retain(|_, shining| shining.staying || !shining.fade.done(now));
        let recede = &mut self.presentation.recede;
        recede.rest = lighting.rest.at(now);
        recede.labels = lighting.labels.at(now);
        recede.subjects = lighting
            .subjects
            .iter()
            .map(|(id, shining)| (id.clone(), shining.fade.at(now)))
            .collect();
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
        let lighting = &self.lighting;
        self.moving_traffic()
            || self.flying(now)
            || self.presentation.sweep.is_some()
            || ![self.glide.x, self.glide.y, self.glide.scale, self.far]
                .iter()
                .chain([&lighting.rest, &lighting.labels])
                .all(|fade| fade.done(now))
            || lighting
                .subjects
                .values()
                .any(|shining| !shining.fade.done(now))
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
        self.advance(now);
        if self.shown.is_some() {
            self.draw_frame(canvas, now);
        }
        self.changing(now)
    }

    /// Draw what stands on the stage: its ground, the picture, the board
    /// inside a card, and over them what is left of the last picture.
    fn draw_frame<C: Canvas>(&mut self, canvas: &mut C, now: f64) {
        let Stage {
            shown,
            presentation,
            palette,
            outlines,
            size,
            flight,
            leaving,
            ghost,
            dive,
            ..
        } = self;
        let Some(shown) = shown else {
            return;
        };
        let picture = &shown.picture;
        draw_ground(canvas, &picture.scene, *size, palette);
        let camera = presentation.camera;
        let transform = placed(camera.x, camera.y, Some(camera.scale));
        let fades = dive.as_ref().map(|dive| dive.fades(now));
        let parent = fades.map_or(1.0, |fades| fades.parent);
        if parent < 1.0 {
            canvas.set_transform(Affine::IDENTITY);
            canvas.push(None, opacity_of(parent));
        }
        let mut inks = Inks {
            palette,
            outlines: &mut *outlines,
            presentation,
        };
        let moved: Option<Vec<Item>> = match (&*flight, &*leaving) {
            (Some(flight), _) => Some(flight.items(now)),
            (None, Some(leaving)) => Some(departure(
                &picture.scene,
                &leaving.heading,
                leaving.progress(now),
            )),
            (None, None) => None,
        };
        let definitions = flight
            .as_ref()
            .and_then(Flight::definitions)
            .unwrap_or(&picture.definitions);
        let items = moved.as_deref().unwrap_or(&picture.scene.body);
        draw_items(canvas, items, definitions, transform, &mut inks);
        if parent < 1.0 {
            canvas.pop();
        }
        let plain = Presentation {
            camera,
            far: presentation.far,
            traffic: presentation.traffic,
            ..Presentation::default()
        };
        let mut plain_inks = Inks {
            palette,
            outlines,
            presentation: &plain,
        };
        if let Some((dive, fades)) = dive.as_ref().zip(fades) {
            draw_inset(canvas, dive, fades.inset, transform, &mut plain_inks);
        }
        if let Some(ghost) = ghost {
            let place = placed(ghost.camera.x, ghost.camera.y, Some(ghost.camera.scale));
            let items = ghost.items(now);
            draw_items(
                canvas,
                &items,
                &ghost.picture.definitions,
                place,
                &mut plain_inks,
            );
        }
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

/// An opacity as a canvas takes it.
#[expect(clippy::cast_possible_truncation, reason = "a canvas's opacity is f32")]
fn opacity_of(opacity: f64) -> f32 {
    opacity as f32
}

/// Draw the board inside its card: fitted to the card and clipped to it, in the
/// parent's own coordinates, with no light on it.
fn draw_inset<C: Canvas>(
    canvas: &mut C,
    dive: &Dive,
    opacity: f64,
    transform: Affine,
    inks: &mut Inks<'_>,
) {
    let (frame, scene) = (&dive.frame, &dive.inset.scene);
    let scale = (frame.width / scene.width).min(frame.height / scene.height);
    let x = frame.x + (frame.width - scene.width * scale) / 2.0;
    let y = frame.y + (frame.height - scene.height * scale) / 2.0;
    let clip = rect_of(frame).to_path(0.1);
    canvas.set_transform(transform);
    canvas.push(Some((&clip, false)), opacity_of(opacity));
    draw_ground(canvas, scene, (1e5, 1e5), inks.palette);
    draw_items(
        canvas,
        &scene.body,
        &dive.inset.definitions,
        transform * placed(x, y, Some(scale)),
        inks,
    );
    canvas.pop();
}

#[cfg(test)]
mod tests {
    use super::Stage;
    use crate::palette::Theme;
    use crate::presentation::{Camera, Light, Shine};
    use std::collections::HashMap;

    fn stage() -> Stage {
        Stage::new(Theme::Light, (100.0, 100.0))
    }

    #[test]
    fn a_glide_moves_over_its_time_and_a_cut_moves_at_once() {
        let mut stage = stage();
        let camera = Camera {
            x: 100.0,
            y: 0.0,
            scale: 1.0,
        };
        stage.set_camera(camera, 100.0, 0.0);
        stage.advance(50.0);
        assert!(stage.presentation.camera.x > 0.0 && stage.presentation.camera.x < 100.0);
        assert!(stage.changing(50.0));
        stage.advance(100.0);
        assert_eq!(stage.presentation.camera.x, 100.0);
        assert!(!stage.changing(100.0));
        stage.set_camera(Camera { x: 0.0, ..camera }, 0.0, 100.0);
        stage.advance(100.0);
        assert_eq!(stage.presentation.camera.x, 0.0);
    }

    #[test]
    fn what_leaves_the_light_fades_to_the_rest_and_is_forgotten() {
        let mut stage = stage();
        let lit = Light {
            rest: 0.14,
            labels: 0.28,
            subjects: HashMap::from([(
                "a".to_owned(),
                Shine {
                    opacity: 1.0,
                    delay: 0.0,
                },
            )]),
            duration: 100.0,
        };
        stage.set_light(&lit, 0.0);
        stage.advance(100.0);
        assert_eq!(stage.presentation.recede.subjects["a"], 1.0);
        assert!((stage.presentation.recede.rest - 0.14).abs() < 1e-6);
        let out = Light {
            rest: 1.0,
            labels: 1.0,
            subjects: HashMap::new(),
            duration: 100.0,
        };
        stage.set_light(&out, 100.0);
        stage.advance(150.0);
        assert!(stage.presentation.recede.subjects.contains_key("a"));
        stage.advance(200.0);
        assert!(stage.presentation.recede.subjects.is_empty());
        assert!((stage.presentation.recede.rest - 1.0).abs() < 1e-6);
    }

    #[test]
    fn a_further_hop_lights_later() {
        let mut stage = stage();
        let far_hop = Light {
            rest: 0.14,
            labels: 0.28,
            subjects: HashMap::from([(
                "far".to_owned(),
                Shine {
                    opacity: 0.6,
                    delay: 100.0,
                },
            )]),
            duration: 100.0,
        };
        stage.set_light(&far_hop, 0.0);
        stage.advance(50.0);
        assert_eq!(stage.presentation.recede.subjects["far"], 1.0);
        stage.advance(200.0);
        assert!((stage.presentation.recede.subjects["far"] - 0.6).abs() < 1e-6);
    }
}
