//! The draw walk: one scene under one presentation, onto one canvas. It reads
//! the scene as the SVG writer does, and does what the SVG's stylesheet did.

use archboard_scene::paint::design::{FAR_SCALE, HERO_LINE_WIDTH, LINE_WIDTH, RAILS};
use archboard_scene::scene::{
    Cap, Colour, Geometry, Group, Icon, Item, Mask, Paint, Purpose, Role, Scene, Shape, Stroke,
    Text, Token, Transform, Viewport,
};
use kurbo::{Affine, BezPath, Rect, Shape as _};

use crate::canvas::{Canvas, Ink};
use crate::definitions::Definitions;
use crate::outlines::Outlines;
use crate::palette::Palette;
use crate::path::{end_of, outline_of, path_of, placed, rect_of, stroke_of};
use crate::presentation::Presentation;
use crate::traffic::draw_traffic;

/// The side of the square an icon is drawn in, in its own units.
const ICON_VIEW: f64 = 24.0;

/// How finely a straight-edged box stands in as a path.
const BOX_TOLERANCE: f64 = 0.1;

/// A scene with its definitions found.
#[derive(Clone, Debug)]
pub struct Picture {
    /// What is drawn.
    pub scene: Scene,
    pub(crate) definitions: Definitions,
}

impl Picture {
    /// A scene, ready to draw.
    pub fn new(scene: Scene) -> Picture {
        let definitions = Definitions::of(&scene);
        Picture { scene, definitions }
    }
}

/// Which of the far swap's two views a group stands in.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum View {
    Both,
    Near,
    Far,
}

/// What a group hands down to what it holds.
#[derive(Clone, Copy, Debug)]
#[expect(
    clippy::struct_excessive_bools,
    reason = "each is one thing the stylesheet said about a group's descendants"
)]
struct Inside {
    transform: Affine,
    view: View,
    /// A selected subject shows its ring.
    selected: bool,
    /// What is inside something lit does not recede.
    lit: bool,
    /// The direct shapes of a line's group grow in the far view.
    line: bool,
    /// A flow head held at the top of the view shows its shade.
    stuck: bool,
}

/// One frame's walk.
struct Walk<'a, C: Canvas> {
    canvas: &'a mut C,
    palette: &'a Palette,
    definitions: &'a Definitions,
    outlines: &'a mut Outlines,
    presentation: &'a Presentation,
}

/// Draw a picture on a canvas of a size in canvas pixels. The ground fills the
/// whole canvas, so that every frame is opaque.
pub fn draw<C: Canvas>(
    canvas: &mut C,
    picture: &Picture,
    size: (f64, f64),
    palette: &Palette,
    outlines: &mut Outlines,
    presentation: &Presentation,
) {
    let ground = Ink::Solid(palette.colour(&picture.scene.background, 1.0));
    canvas.set_transform(Affine::IDENTITY);
    canvas.fill(
        &Rect::new(0.0, 0.0, size.0, size.1).to_path(BOX_TOLERANCE),
        &ground,
        false,
    );
    let camera = presentation.camera;
    let mut walk = Walk {
        canvas,
        palette,
        definitions: &picture.definitions,
        outlines,
        presentation,
    };
    let inside = Inside {
        transform: placed(camera.x, camera.y, Some(camera.scale)),
        view: View::Both,
        selected: false,
        lit: false,
        line: false,
        stuck: false,
    };
    walk.items(&picture.scene.body, inside);
}

/// A move from one place to another, a share of the way.
fn between(from: Transform, to: Transform, share: f64) -> Transform {
    let mix = |one: f64, other: f64| one + (other - one) * share;
    Transform {
        x: mix(from.x, to.x),
        y: mix(from.y, to.y),
        scale: Some(mix(from.scale.unwrap_or(1.0), to.scale.unwrap_or(1.0))),
    }
}

/// No move.
const STILL: Transform = Transform::translate(0.0, 0.0);

/// A mask shape that cuts: the white ground of a mask lets everything through.
fn cuts(shape: &Shape) -> bool {
    !matches!(
        &shape.fill,
        Some(Paint::Colour {
            colour: Colour::White
        })
    )
}

/// A cut for a trunk that a line shares: a lit line draws that stretch again.
fn cuts_a_trunk(shape: &Shape) -> bool {
    matches!(
        shape.stroke.as_ref().and_then(|stroke| stroke.cap),
        Some(Cap::Butt)
    )
}

impl<C: Canvas> Walk<'_, C> {
    /// Draw some items.
    fn items(&mut self, items: &[Item], inside: Inside) {
        for item in items {
            match item {
                Item::Group(group) => self.group(group, inside),
                Item::Shape(shape) => self.shape(shape, inside),
                Item::Text(text) => self.text(text, inside),
                Item::Icon(icon) => self.icon(icon, inside),
                Item::Viewport(viewport) => self.viewport(viewport, inside),
                Item::Traffic(mark) => {
                    if let Some(seconds) = self.presentation.traffic {
                        draw_traffic(self.canvas, self.palette, inside.transform, mark, seconds);
                    }
                }
                Item::Definitions { .. } | Item::Break => {}
            }
        }
    }

    /// The opacity the far swap gives a group, or none when it is out of sight.
    fn far_opacity(&self, group: &Group) -> Option<f64> {
        let far = self.presentation.far;
        match group.role {
            Role::NearView => (far < 1.0).then_some(1.0 - far),
            Role::FarView => (far > 0.0).then_some(far),
            _ => Some(1.0),
        }
    }

    /// Where a group sits, in the swap between the near and the far view.
    fn place_of(&self, group: &Group, view: View) -> Option<Transform> {
        let far = self.presentation.far;
        match (&group.role, view) {
            (Role::Chip { far: place }, _) => {
                Some(between(group.transform.unwrap_or(STILL), *place, far))
            }
            (Role::Words { away }, View::Near) => Some(between(STILL, *away, far)),
            (Role::Words { away }, View::Far) => Some(between(*away, STILL, far)),
            _ => group.transform,
        }
    }

    /// How far a group recedes behind what is lit, and whether it is lit.
    fn recede_of(&self, group: &Group, inside: Inside) -> (f64, bool) {
        let recede = &self.presentation.recede;
        let id = match &group.role {
            Role::Traffic(id) => Some(id.as_str()),
            _ => group.subject.as_ref().map(|subject| subject.id.as_str()),
        };
        let own = id.and_then(|id| recede.subjects.get(id));
        let member = || {
            group
                .members
                .iter()
                .find_map(|member| recede.subjects.get(member))
        };
        match (inside.lit, own, id.is_none() && group.members.is_empty()) {
            (true, ..) => (1.0, true),
            (false, Some(value), _) => (*value, true),
            (false, None, true) => (1.0, false),
            (false, None, false) => {
                let rest = if matches!(group.role, Role::Label) {
                    recede.labels
                } else {
                    recede.rest
                };
                (member().copied().unwrap_or(rest), false)
            }
        }
    }

    /// Draw a group, with its layer when it needs one.
    fn group(&mut self, group: &Group, inside: Inside) {
        if matches!(group.role, Role::HeadShade) && !inside.stuck {
            return;
        }
        let Some(swap) = self.far_opacity(group) else {
            return;
        };
        let view = match group.role {
            Role::NearView => View::Near,
            Role::FarView => View::Far,
            _ => inside.view,
        };
        let transform = self
            .place_of(group, inside.view)
            .map_or(inside.transform, |place| {
                inside.transform * placed(place.x, place.y, place.scale)
            });
        let subject = group.subject.as_ref().map(|subject| subject.id.as_str());
        let selected = subject.is_some_and(|id| self.presentation.selected.contains(id));
        let (recede, lit) = self.recede_of(group, inside);
        let held = Inside {
            transform,
            view,
            selected: inside.selected || selected,
            lit,
            line: matches!(group.role, Role::Line(Some(_))),
            stuck: match &group.role {
                Role::FlowHead(id) => self.presentation.stuck.contains(id),
                _ => inside.stuck,
            },
        };
        let opacity = group.opacity.unwrap_or(1.0) * swap * recede;
        let mask = group
            .mask
            .as_ref()
            .filter(|_| !selected)
            .and_then(|mask| self.definitions.mask(&mask.line));
        if let Some(mask) = mask {
            let whole = subject.is_some_and(|id| self.presentation.whole.contains(id));
            self.masked(group, mask, opacity, whole, held);
        } else if opacity < 1.0 {
            self.canvas.set_transform(transform);
            self.canvas.push(None, opacity_of(opacity));
            self.items(&group.items, held);
            self.canvas.pop();
        } else {
            self.items(&group.items, held);
        }
    }

    /// Draw a group through its mask: its items, then its cuts out of them.
    fn masked(&mut self, group: &Group, mask: &Mask, opacity: f64, whole: bool, held: Inside) {
        let bounds = rect_of(&mask.bounds).to_path(BOX_TOLERANCE);
        self.canvas.set_transform(held.transform);
        self.canvas
            .push(Some((&bounds, false)), opacity_of(opacity));
        self.items(&group.items, held);
        self.canvas.set_transform(held.transform);
        self.canvas.push_cut();
        let black = Ink::Solid(peniko::Color::BLACK);
        for shape in mask.shapes.iter().filter(|shape| cuts(shape)) {
            if whole && cuts_a_trunk(shape) {
                continue;
            }
            let (path, _) = outline_of(&shape.geometry);
            if shape.fill.as_ref().is_some_and(|fill| *fill != Paint::None) {
                self.canvas.fill(&path, &black, false);
            }
            if let Some(stroke) = &shape.stroke {
                self.canvas.stroke(&path, &stroke_of(stroke, 1.0), &black);
            }
        }
        self.canvas.pop();
        self.canvas.pop();
    }

    /// What a nested picture shows through its box.
    fn viewport(&mut self, viewport: &Viewport, inside: Inside) {
        let (frame, view) = (&viewport.frame, &viewport.view);
        let scale = (frame.width / view.width).min(frame.height / view.height);
        let x = frame.x + (frame.width - view.width * scale) / 2.0 - view.x * scale;
        let y = frame.y + (frame.height - view.height * scale) / 2.0 - view.y * scale;
        let clip = rect_of(frame).to_path(BOX_TOLERANCE);
        self.canvas.set_transform(inside.transform);
        self.canvas.push(Some((&clip, false)), 1.0);
        let held = Inside {
            transform: inside.transform * placed(x, y, Some(scale)),
            ..inside
        };
        self.items(&viewport.items, held);
        self.canvas.pop();
    }

    /// An ink, or none for no paint.
    fn ink(&self, paint: &Paint, alpha: f64, bounds: Rect) -> Option<Ink> {
        match paint {
            Paint::None => None,
            Paint::Colour { colour } => Some(Ink::Solid(self.palette.colour(colour, alpha))),
            Paint::Gradient { id } => self.definitions.gradient(*id, self.palette, alpha, bounds),
        }
    }

    /// The width a line's direct stroke grows by in the far view.
    fn far_scale(&self, stroke: &Stroke, geometry: &Geometry, inside: Inside) -> f64 {
        let grows = inside.line
            && matches!(geometry, Geometry::Path { .. })
            && stroke
                .width
                .is_some_and(|width| [LINE_WIDTH, HERO_LINE_WIDTH, RAILS].contains(&width));
        if grows {
            1.0 + (FAR_SCALE - 1.0) * self.presentation.far
        } else {
            1.0
        }
    }

    /// Draw a shape, its markers with it.
    fn shape(&mut self, shape: &Shape, inside: Inside) {
        let ring = matches!(
            shape.purpose,
            Purpose::Halo | Purpose::Ring | Purpose::LitLine
        );
        if ring && !inside.selected {
            return;
        }
        let (path, bounds) = outline_of(&shape.geometry);
        self.canvas.set_transform(inside.transform);
        let clip = self.clip_of(shape, bounds);
        if let Some(clip) = &clip {
            self.canvas.push(Some((clip, true)), 1.0);
        }
        self.paint(shape, &path, bounds, ring, inside);
        if clip.is_some() {
            self.canvas.pop();
        }
    }

    /// The clip a shape names, laid over the shape's own box.
    fn clip_of(&self, shape: &Shape, bounds: Rect) -> Option<BezPath> {
        let clip = self.definitions.clip(&shape.clip.as_ref()?.card)?;
        let unit = Affine::translate(bounds.origin().to_vec2())
            * Affine::scale_non_uniform(bounds.width(), bounds.height());
        Some(unit * path_of(&clip.outline))
    }

    /// Fill a shape, then stroke it.
    fn paint(&mut self, shape: &Shape, path: &BezPath, bounds: Rect, ring: bool, inside: Inside) {
        let black = Paint::Colour {
            colour: Colour::Black,
        };
        let fill = shape.fill.as_ref().unwrap_or(&black);
        if let Some(ink) = self.ink(fill, shape.fill_opacity.unwrap_or(1.0), bounds) {
            self.canvas.fill(path, &ink, false);
        }
        if let Some(stroke) = &shape.stroke {
            self.outline(shape, stroke, path, bounds, ring, inside);
        }
    }

    /// Stroke a shape and draw what its stroke ends in.
    fn outline(
        &mut self,
        shape: &Shape,
        stroke: &Stroke,
        path: &BezPath,
        bounds: Rect,
        ring: bool,
        inside: Inside,
    ) {
        let selection = Paint::from(Token::DiagramSelection);
        let paint = if ring { &selection } else { &stroke.paint };
        let Some(ink) = self.ink(paint, stroke.opacity.unwrap_or(1.0), bounds) else {
            return;
        };
        let grown = self.far_scale(stroke, &shape.geometry, inside);
        self.canvas.stroke(path, &stroke_of(stroke, grown), &ink);
        let width = stroke.width.unwrap_or(1.0) * grown;
        let ends = [(&shape.marker, false), (&shape.start_marker, true)];
        for (marker, start) in ends {
            let marker = marker
                .as_ref()
                .and_then(|marker| self.definitions.marker(marker));
            let Some((marker, (at, angle))) = marker.zip(end_of(path, start)) else {
                continue;
            };
            let scale = marker.size * width / marker.view;
            let transform = inside.transform
                * Affine::translate(at.to_vec2())
                * Affine::rotate(angle)
                * Affine::scale(scale)
                * Affine::translate((-marker.reference.x, -marker.reference.y));
            let held = Inside {
                transform,
                line: false,
                ..inside
            };
            for head in &marker.shapes {
                self.shape(head, held);
            }
        }
    }

    /// Draw a run of words from its glyphs.
    fn text(&mut self, text: &Text, inside: Inside) {
        let scale = text.size / f64::from(text.units_per_em);
        let ink = Ink::Solid(self.palette.colour(&text.fill, 1.0));
        for glyph in &text.glyphs {
            let outline = self.outlines.glyph(glyph.face, glyph.id);
            if outline.elements().is_empty() {
                continue;
            }
            let x = text.at.x + f64::from(glyph.x) * scale;
            let y = text.at.y + f64::from(glyph.y) * scale;
            self.canvas
                .set_transform(inside.transform * placed(x, y, Some(scale)));
            self.canvas.fill(&outline, &ink, false);
        }
    }

    /// Draw an icon.
    fn icon(&mut self, icon: &Icon, inside: Inside) {
        let Some(paths) = self.outlines.icon(&icon.name) else {
            return;
        };
        let ink = Ink::Solid(self.palette.colour(&icon.ink, 1.0));
        self.canvas
            .set_transform(inside.transform * Affine::scale(icon.size / ICON_VIEW));
        for path in paths.iter() {
            self.canvas.fill(path, &ink, false);
        }
    }
}

/// An opacity as a canvas takes it.
#[expect(clippy::cast_possible_truncation, reason = "a canvas's opacity is f32")]
fn opacity_of(opacity: f64) -> f32 {
    opacity as f32
}
