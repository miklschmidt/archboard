//! The parts a strip canvas keeps from frame to frame (ADR 0074). Vello on the
//! CPU and Vello GPU on WebGL2 cut every path into strips on this thread, and a
//! strip holds where its path lands, so no strip outlives a move of the camera.
//! What a path is in its own units outlives it: the walk that found the path,
//! the path, and the outline of a stroke. A kept part holds those, so a frame
//! that draws it again cuts only the strips.

use std::cell::Cell;
use std::collections::HashMap;
use std::rc::Rc;

use kurbo::{Affine, BezPath, Rect, Shape as _, Stroke, StrokeCtx, StrokeOpts};
use peniko::Color;

use crate::canvas::{Canvas, Ink, Lens, PartKey};

/// How closely Vello's strip canvases expand a stroke into its outline, in the
/// stroke's own units, while a unit of it is at most a pixel
/// (`vello_common::flatten::TOL`).
const STROKE_TOLERANCE: f64 = 0.25;

/// The most path elements the kept parts hold, about 32 MB. Past it, the canvas
/// starts again with none, as the GPU canvas does.
const MOST_KEPT: usize = 600_000;

/// How far past the canvas a shape still draws, in pixels: its antialiased edge.
const EDGE: f64 = 1.0;

/// How far past its path a stroke reaches, in widths: a mitred corner at SVG's
/// limit of 4.
const STROKE_REACH: f64 = 2.0;

/// One thing a part draws, under the transform that stood when it was drawn.
#[derive(Debug)]
enum Command {
    Fill {
        transform: Affine,
        path: BezPath,
        ink: Ink,
        even_odd: bool,
        bounds: Rect,
    },
    Stroke {
        transform: Affine,
        path: BezPath,
        stroke: Stroke,
        ink: Ink,
        /// The stroke expanded as Vello expands it up to a pixel to a unit.
        outline: BezPath,
        /// What the stroke can ink, at any tolerance.
        bounds: Rect,
    },
    Push {
        transform: Affine,
        clip: Option<(BezPath, bool)>,
        opacity: f32,
    },
    Cut,
    Keep,
    Pop,
    /// A part that this part holds, such as a run of words in a card.
    Part {
        part: Rc<Part>,
        transform: Affine,
    },
}

impl Command {
    /// How many path elements it holds of its own.
    fn elements(&self) -> usize {
        match self {
            Command::Fill { path, .. }
            | Command::Push {
                clip: Some((path, _)),
                ..
            } => path.elements().len(),
            Command::Stroke { path, outline, .. } => {
                path.elements().len() + outline.elements().len()
            }
            _ => 0,
        }
    }
}

/// What a part draws, in its own space.
#[derive(Debug)]
struct Part {
    commands: Vec<Command>,
    elements: usize,
    /// Count each allocation until its last owner, including a parent part,
    /// releases it. Clearing the index alone need not release a child's paths.
    retained: Rc<Cell<usize>>,
}

impl Drop for Part {
    fn drop(&mut self) {
        self.retained.set(self.retained.get() - self.elements);
    }
}

/// A canvas that keeps each part a walk draws, so that a later frame draws it
/// again from what it kept. It draws on another canvas, and it leaves out what
/// lands outside that canvas.
#[derive(Debug)]
pub struct Keeper<C> {
    canvas: C,
    view: Rect,
    transform: Affine,
    parts: HashMap<PartKey, Rc<Part>>,
    /// The parts being drawn, the innermost last.
    recording: Vec<Vec<Command>>,
    retained: Rc<Cell<usize>>,
}

impl<C: Canvas> Keeper<C> {
    /// Keep parts for a canvas of a size in pixels.
    pub fn new(canvas: C, size: (f64, f64)) -> Keeper<C> {
        Keeper {
            canvas,
            view: view_of(size),
            transform: Affine::IDENTITY,
            parts: HashMap::new(),
            recording: Vec::new(),
            retained: Rc::default(),
        }
    }

    /// The canvas it draws on.
    pub fn canvas(&mut self) -> &mut C {
        &mut self.canvas
    }

    /// Draw on another canvas of a size in pixels. The parts stay, because
    /// they hold no pixels.
    pub fn replace(&mut self, canvas: C, size: (f64, f64)) {
        self.canvas = canvas;
        self.view = view_of(size);
    }

    /// Draw a kept part under a transform, into the part being drawn when
    /// there is one.
    fn draw_part(&mut self, part: Rc<Part>, transform: Affine) {
        if let Some(commands) = self.recording.last_mut() {
            commands.push(Command::Part { part, transform });
        } else {
            replay(&mut self.canvas, self.view, &part, transform);
            self.canvas.set_transform(self.transform);
        }
    }
}

/// The canvas of a size, as a box in pixels.
fn view_of(size: (f64, f64)) -> Rect {
    Rect::new(0.0, 0.0, size.0, size.1).inflate(EDGE, EDGE)
}

/// Whether a box in some space lands on the canvas under a transform.
fn lands(view: Rect, transform: Affine, bounds: Rect) -> bool {
    view.overlaps(transform.transform_rect_bbox(bounds))
}

/// Whether Vello expands a stroke under a transform as it expands it at one
/// pixel to a unit. It expands at its tolerance over the larger of `|a|`,
/// `|d|` and 1.
fn expands_alike(transform: Affine) -> bool {
    let [a, _, _, d, _, _] = transform.as_coeffs();
    a.abs() <= 1.0 && d.abs() <= 1.0
}

/// The box a stroke can ink around its path.
fn stroke_box(path: &BezPath, stroke: &Stroke) -> Rect {
    let reach = stroke.width * STROKE_REACH;
    path.control_box().inflate(reach, reach)
}

/// Draw what a part keeps under a transform.
fn replay<C: Canvas>(canvas: &mut C, view: Rect, part: &Part, at: Affine) {
    for command in &part.commands {
        match command {
            Command::Fill {
                transform,
                path,
                ink,
                even_odd,
                bounds,
            } => {
                let transform = at * *transform;
                if lands(view, transform, *bounds) {
                    canvas.set_transform(transform);
                    canvas.fill(path, ink, *even_odd);
                }
            }
            Command::Stroke {
                transform,
                path,
                stroke,
                ink,
                outline,
                bounds,
            } => {
                let transform = at * *transform;
                if !lands(view, transform, *bounds) {
                    continue;
                }
                canvas.set_transform(transform);
                if expands_alike(transform) {
                    canvas.fill(outline, ink, false);
                } else {
                    canvas.stroke(path, stroke, ink);
                }
            }
            Command::Push {
                transform,
                clip,
                opacity,
            } => {
                canvas.set_transform(at * *transform);
                canvas.push(clip.as_ref().map(|(path, rule)| (path, *rule)), *opacity);
            }
            Command::Cut => canvas.push_cut(),
            Command::Keep => canvas.push_keep(),
            Command::Pop => canvas.pop(),
            Command::Part { part, transform } => replay(canvas, view, part, at * *transform),
        }
    }
}

impl<C: Canvas> Canvas for Keeper<C> {
    fn set_transform(&mut self, transform: Affine) {
        self.transform = transform;
        if self.recording.is_empty() {
            self.canvas.set_transform(transform);
        }
    }

    fn fill(&mut self, path: &BezPath, ink: &Ink, even_odd: bool) {
        let transform = self.transform;
        match self.recording.last_mut() {
            Some(commands) => commands.push(Command::Fill {
                transform,
                path: path.clone(),
                ink: ink.clone(),
                even_odd,
                bounds: path.bounding_box(),
            }),
            None => {
                if lands(self.view, transform, path.control_box()) {
                    self.canvas.fill(path, ink, even_odd);
                }
            }
        }
    }

    fn stroke(&mut self, path: &BezPath, stroke: &Stroke, ink: &Ink) {
        let transform = self.transform;
        match self.recording.last_mut() {
            Some(commands) => {
                let mut expanded = StrokeCtx::default();
                kurbo::stroke_with(
                    path.iter(),
                    stroke,
                    &StrokeOpts::default(),
                    STROKE_TOLERANCE,
                    &mut expanded,
                );
                let outline = expanded.output().clone();
                commands.push(Command::Stroke {
                    transform,
                    bounds: stroke_box(path, stroke),
                    path: path.clone(),
                    stroke: stroke.clone(),
                    ink: ink.clone(),
                    outline,
                });
            }
            None => {
                if lands(self.view, transform, stroke_box(path, stroke)) {
                    self.canvas.stroke(path, stroke, ink);
                }
            }
        }
    }

    fn push(&mut self, clip: Option<(&BezPath, bool)>, opacity: f32) {
        let transform = self.transform;
        match self.recording.last_mut() {
            Some(commands) => commands.push(Command::Push {
                transform,
                clip: clip.map(|(path, rule)| (path.clone(), rule)),
                opacity,
            }),
            None => self.canvas.push(clip, opacity),
        }
    }

    fn push_cut(&mut self) {
        match self.recording.last_mut() {
            Some(commands) => commands.push(Command::Cut),
            None => self.canvas.push_cut(),
        }
    }

    fn push_keep(&mut self) {
        match self.recording.last_mut() {
            Some(commands) => commands.push(Command::Keep),
            None => self.canvas.push_keep(),
        }
    }

    fn pop(&mut self) {
        match self.recording.last_mut() {
            Some(commands) => commands.push(Command::Pop),
            None => self.canvas.pop(),
        }
    }

    fn again(&mut self, key: PartKey, transform: Affine) -> bool {
        let Some(part) = self.parts.get(&key).map(Rc::clone) else {
            return false;
        };
        self.draw_part(part, transform);
        true
    }

    fn keep(&mut self) -> bool {
        self.recording.push(Vec::new());
        true
    }

    fn kept(&mut self, key: PartKey, transform: Affine) {
        let commands = self.recording.pop().unwrap_or_default();
        let elements = commands.iter().map(Command::elements).sum::<usize>();
        self.retained.set(self.retained.get() + elements);
        let part = Rc::new(Part {
            commands,
            elements,
            retained: Rc::clone(&self.retained),
        });
        if self.retained.get() > MOST_KEPT {
            self.parts.clear();
        }
        if self.retained.get() <= MOST_KEPT {
            self.parts.insert(key, Rc::clone(&part));
        }
        self.draw_part(part, transform);
    }

    fn look_through(&mut self, lens: Lens, ground: Color) {
        self.canvas.look_through(lens, ground);
    }
}

#[cfg(test)]
mod tests;
