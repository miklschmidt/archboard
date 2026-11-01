//! Carrying a connection's line from its old route to its new one.
//!
//! A line is drawn as a few shapes with different jobs: the stroke, the halos
//! that light when it is selected, and, in a proposal, a swipe of the
//! standing's colour under all of them. They are paired by job, not by
//! position, because a proposal's line has a swipe in front of the others and a
//! plain line has none, and pairing by position carries the old halo into
//! the new swipe and leave the new stroke with nothing to come from. Every
//! shape is morphed along the route. A shape whose look changed, a stroke that
//! took a standing's colour and arrowhead, has its old self borrowed and
//! morphed beside it, the two cross-fading. A swipe that appears or disappears
//! morphs with the stroke, fading in or out.

use archboard_scene::geometry::{Point, Rect};
use archboard_scene::paint::design::RAIL_GAP;
use archboard_scene::scene::{
    Colour, Geometry, Group, Item, Mask, MaskId, Paint, PathStep, Purpose, Role, Shape,
};

use super::content::look;
use super::ease::{ease_in_out, emphasised, phase, receded};
use super::found::Found;
use super::morph::{Morph, length, route_of};
use super::phases::Transition;
use crate::path::path_of;

/// How far a line recedes when it travels far, so that the eye stays on the cards.
const DEEPEST: f64 = 0.5;
/// How far a line travels before it recedes that far, in the picture's units.
const FAR_TRAVEL: f64 = 240.0;

/// How far a line's points can move apart before it counts as another shape, in
/// the picture's units.
const SAME_SHAPE: f64 = 10.0;

/// Where the cuts of the last picture are gone, as a share of the move.
const OLD_CUTS_GONE_BY: f64 = 0.1;
/// How far a mask reaches past its line.
const MASK_ROOM: f64 = 18.0;

/// How far something that moves this far recedes in a move.
pub(super) fn depth_of_travel(reach: f64) -> f64 {
    DEEPEST * (reach / FAR_TRAVEL).min(1.0)
}

/// A line's shapes by job.
struct Paths<'a> {
    /// The halos, in drawn order, with their places among the group's items.
    halos: Vec<(usize, &'a Shape)>,
    /// The inked shape drawn last.
    stroke: Option<(usize, &'a Shape)>,
    /// An inked shape drawn before it.
    swipe: Option<(usize, &'a Shape)>,
}

/// Whether a shape is a halo, drawn only when the line is lit.
fn is_halo(shape: &Shape) -> bool {
    matches!(
        shape.purpose,
        Purpose::Halo | Purpose::LitLine | Purpose::Ring
    )
}

/// The shapes of a line that draw a route, by job: a halo has its purpose, the
/// stroke is the last inked shape, and an inked shape drawn before it is the
/// swipe.
fn paths(group: &Group) -> Paths<'_> {
    let routes = group
        .items
        .iter()
        .enumerate()
        .filter_map(|(at, item)| match item {
            Item::Shape(shape) if route_of(&shape.geometry).is_some() => Some((at, shape)),
            _ => None,
        });
    let (halos, inked): (Vec<_>, Vec<_>) = routes.partition(|(_, shape)| is_halo(shape));
    Paths {
        halos,
        stroke: inked.last().copied(),
        swipe: if inked.len() > 1 {
            inked.first().copied()
        } else {
            None
        },
    }
}

/// The route a shape draws, or nothing.
fn route(shape: Option<&Shape>) -> Vec<PathStep> {
    shape
        .and_then(|shape| route_of(&shape.geometry))
        .unwrap_or_default()
}

/// Where a line begins: the point its first route starts at.
pub(super) fn start_of(group: &Group) -> Option<Point> {
    group.items.iter().find_map(|item| match item {
        Item::Shape(shape) => match route_of(&shape.geometry)?.first()? {
            PathStep::Move { to } => Some(*to),
            _ => None,
        },
        _ => None,
    })
}

/// Where a line ends, and how far it runs: the last point of its first route.
pub(super) fn end_of(group: &Group) -> Option<(Point, f64)> {
    group.items.iter().find_map(|item| match item {
        Item::Shape(shape) => {
            let steps = route_of(&shape.geometry)?;
            let end = path_of(&steps).elements().last()?.end_point()?;
            Some((Point { x: end.x, y: end.y }, length(&steps)?))
        }
        _ => None,
    })
}

/// The outline of a line's first route.
pub(super) fn outline_of(group: &Group) -> Option<kurbo::BezPath> {
    group.items.iter().find_map(|item| match item {
        Item::Shape(shape) => route_of(&shape.geometry).map(|steps| path_of(&steps)),
        _ => None,
    })
}

/// A shape this much visible, under whatever visibility it states.
fn dim(mut shape: Shape, visible: f64) -> Shape {
    if visible < 1.0 {
        shape.fill_opacity = Some(shape.fill_opacity.unwrap_or(1.0) * visible);
        if let Some(stroke) = &mut shape.stroke {
            stroke.opacity = Some(stroke.opacity.unwrap_or(1.0) * visible);
        }
    }
    shape
}

/// A shape on a route.
fn on_route(mut shape: Shape, steps: Vec<PathStep>) -> Shape {
    shape.geometry = Geometry::Path { steps };
    shape
}

/// Take out of a line what draws wrongly while it is in flight: the
/// ports its ends run into are cut where the cards land, and the pulses ride
/// the new route. They come back when the picture lands.
fn without_ports_and_pulses(items: &[Item]) -> Vec<Item> {
    items
        .iter()
        .filter_map(|item| match item {
            Item::Traffic(_) => None,
            Item::Group(group) if matches!(group.role, Role::Port) => None,
            Item::Group(group) => Some(Item::Group(Group {
                items: without_ports_and_pulses(&group.items),
                ..super::content::shell(group)
            })),
            other => Some(other.clone()),
        })
        .collect()
}

/// A line's group as it stands in flight, its ports and pulses parked.
pub(super) fn in_flight(group: &Group) -> Group {
    Group {
        items: without_ports_and_pulses(&group.items),
        ..super::content::shell(group)
    }
}

/// Whether a line changes its shape between two pictures. A line that keeps its
/// shape rides along with its cards. A carry can show any other only as a line
/// that swings across the board.
pub(super) fn reroutes(before: &Group, after: &Group) -> bool {
    let turns = |group: &Group| {
        let steps = paths(group).stroke.map_or_else(Vec::new, |(_, shape)| {
            route_of(&shape.geometry).unwrap_or_default()
        });
        let path = path_of(&steps);
        path.elements()
            .iter()
            .filter_map(kurbo::PathEl::end_point)
            .collect::<Vec<_>>()
    };
    let (old, new) = (turns(before), turns(after));
    if old.len() != new.len() {
        return true;
    }
    let moves = old.iter().zip(&new).map(|(a, b)| *b - *a);
    let (mut least, mut most) = (
        (f64::INFINITY, f64::INFINITY),
        (f64::NEG_INFINITY, f64::NEG_INFINITY),
    );
    for moved in moves {
        least = (least.0.min(moved.x), least.1.min(moved.y));
        most = (most.0.max(moved.x), most.1.max(moved.y));
    }
    most.0 - least.0 > SAME_SHAPE || most.1 - least.1 > SAME_SHAPE
}

/// A shape of the next line that morphs along its route, and fades in when it
/// has no old self to come from or its look changed.
#[derive(Clone, Debug)]
struct Slide {
    child: usize,
    morph: Option<Morph>,
    fades_in: bool,
}

/// An old shape borrowed into the new line, drawn before the shape it gives way
/// to, to be morphed along the route and faded out.
#[derive(Clone, Debug)]
struct Ghost {
    before: usize,
    shape: Shape,
    morph: Option<Morph>,
}

/// Whether a shape of a mask is the core of a double line.
fn is_core(shape: &Shape) -> bool {
    shape.purpose == Purpose::Cutout
        && shape.stroke.as_ref().and_then(|stroke| stroke.width) == Some(RAIL_GAP)
}

/// A cut this much of the way in.
fn cut_at(shape: &Shape, strength: f64) -> Shape {
    dim(shape.clone(), strength)
}

/// What a line's masks do through a move. The core of a double line travels with
/// it. The rest of the cuts belong to where a line stands: the old ones go as it
/// sets off, and the new ones come once it is in place.
#[derive(Clone, Debug)]
struct Cuts {
    id: MaskId,
    /// The core of the line, and how it gets from one route to the other.
    core: Option<(Shape, Option<Morph>)>,
    /// How the core stands at each end of the move, when it does not at both.
    core_shown: (f64, f64),
    old: Vec<Shape>,
    next: Vec<Shape>,
    /// The next mask's box, for a moment when the line stands still.
    bounds: Rect,
}

impl Cuts {
    /// The cuts of a line, from its masks in the two pictures.
    fn of(old: Option<&Mask>, next: Option<&Mask>) -> Option<Cuts> {
        let cuts = |mask: Option<&Mask>, core: bool| -> Vec<Shape> {
            mask.map_or_else(Vec::new, |mask| {
                mask.shapes
                    .iter()
                    .filter(|shape| shape.fill != Some(white()) && is_core(shape) == core)
                    .cloned()
                    .collect()
            })
        };
        let (old_core, next_core) = (cuts(old, true), cuts(next, true));
        let (from, to) = (old_core.first(), next_core.first());
        let core = to.or(from).map(|shape| {
            let morph = from
                .zip(to)
                .and_then(|(a, b)| Morph::new(&route(Some(a)), &route(Some(b))));
            (shape.clone(), morph)
        });
        let (old_cuts, next_cuts) = (cuts(old, false), cuts(next, false));
        let bounds = next.or(old)?.bounds;
        Some(Cuts {
            id: next.or(old)?.id.clone(),
            core,
            core_shown: (
                f64::from(u8::from(from.is_some())),
                f64::from(u8::from(to.is_some())),
            ),
            old: old_cuts,
            next: next_cuts,
            bounds,
        })
    }

    /// The mask at a moment of the move, or none while nothing is cut.
    fn at(&self, progress: f64, along: f64, swapped: f64, t: &Transition) -> Option<Mask> {
        let mut shapes = Vec::new();
        let leaving = 1.0 - ease_in_out(phase(progress, 0.0, OLD_CUTS_GONE_BY));
        if leaving > 0.0 {
            shapes.extend(self.old.iter().map(|shape| cut_at(shape, leaving)));
        }
        let landing = ease_in_out(phase(progress, t.move_end, 1.0));
        if landing > 0.0 {
            shapes.extend(self.next.iter().map(|shape| cut_at(shape, landing)));
        }
        let mut bounds = self.bounds;
        if let Some((shape, morph)) = &self.core {
            let (from, to) = self.core_shown;
            let strength = from + (to - from) * swapped;
            let shape = match morph {
                Some(morph) => {
                    let held = morph.bounds_at(along).inflate(MASK_ROOM, MASK_ROOM);
                    bounds = Rect {
                        x: held.x0,
                        y: held.y0,
                        width: held.width(),
                        height: held.height(),
                    };
                    on_route(shape.clone(), morph.at(along))
                }
                None => shape.clone(),
            };
            if strength > 0.0 {
                shapes.push(cut_at(&shape, strength));
            }
        }
        (!shapes.is_empty()).then(|| Mask {
            id: self.id.clone(),
            bounds,
            shapes,
        })
    }
}

/// The white ground of a mask, which cuts nothing.
fn white() -> Paint {
    Paint::Colour {
        colour: Colour::White,
    }
}

/// One line carried from its old route to its new one.
#[derive(Clone, Debug)]
pub(super) struct LineCarry {
    template: Group,
    slides: Vec<Slide>,
    ghosts: Vec<Ghost>,
    /// How far the line recedes as it travels.
    depth: f64,
    /// What its masks do.
    cuts: Option<Cuts>,
    phases: Transition,
}

/// The steps that carry one job's shape across.
struct Carrying<'a> {
    old: &'a Paths<'a>,
    next: &'a Paths<'a>,
    /// The old stroke's route, for a shape with no counterpart.
    from: Vec<PathStep>,
    slides: Vec<Slide>,
    ghosts: Vec<Ghost>,
}

impl Carrying<'_> {
    /// Borrow an old shape into the new line, to morph to a route and fade out.
    fn borrow(&mut self, before: usize, old: &Shape, to: Vec<PathStep>) {
        let morph = Morph::new(&route(Some(old)), &to);
        self.ghosts.push(Ghost {
            before,
            shape: on_route(old.clone(), to),
            morph,
        });
    }

    /// Carry one shape across: from its counterpart when it has one, and
    /// cross-faded with a borrowed copy of it when its look changed.
    fn carry(&mut self, child: usize, shape: &Shape, previous: Option<&Shape>) {
        let to = route(Some(shape));
        let Some(previous) = previous else {
            let morph = Morph::new(&self.from, &to);
            self.slides.push(Slide {
                child,
                morph,
                fades_in: true,
            });
            return;
        };
        let changed = look(previous) != look(shape);
        let morph = Morph::new(&route(Some(previous)), &to);
        if morph.is_some() || changed {
            self.slides.push(Slide {
                child,
                morph,
                fades_in: changed,
            });
        }
        if changed {
            self.borrow(child, previous, to);
        }
    }

    /// The steps for one job: carried across when the new line has it, borrowed
    /// and seen off along the new route when only the old line had it.
    fn job(&mut self, next: Option<(usize, &Shape)>, previous: Option<(usize, &Shape)>) {
        match (next, previous) {
            (Some((child, shape)), _) => self.carry(child, shape, previous.map(|(_, old)| old)),
            (None, Some((_, old))) => {
                if let Some((child, stroke)) = self.next.stroke {
                    self.borrow(child, old, route(Some(stroke)));
                }
            }
            (None, None) => {}
        }
    }

    /// The halos, which only ever morph: whether they show is the selection's.
    fn halos(&mut self) {
        for (index, &(child, halo)) in self.next.halos.iter().enumerate() {
            let from = self
                .old
                .halos
                .get(index)
                .map_or_else(|| self.from.clone(), |&(_, old)| route(Some(old)));
            let morph = Morph::new(&from, &route(Some(halo)));
            if morph.is_some() {
                self.slides.push(Slide {
                    child,
                    morph,
                    fades_in: false,
                });
            }
        }
    }
}

impl LineCarry {
    /// The carry of a line, or nothing when nothing about it changed.
    pub(super) fn new(
        before: &Found<'_>,
        after: &Found<'_>,
        masks: (Option<&Mask>, Option<&Mask>),
        phases: Transition,
    ) -> Option<LineCarry> {
        let (old, next) = (paths(before.group), paths(after.group));
        let mut carrying = Carrying {
            from: route(old.stroke.map(|(_, shape)| shape)),
            old: &old,
            next: &next,
            slides: Vec::new(),
            ghosts: Vec::new(),
        };
        carrying.halos();
        carrying.job(next.swipe, old.swipe);
        carrying.job(next.stroke, old.stroke);
        let Carrying { slides, ghosts, .. } = carrying;
        if slides.is_empty() && ghosts.is_empty() {
            return None;
        }
        let reach = slides
            .iter()
            .filter_map(|slide| slide.morph.as_ref())
            .map(Morph::reach)
            .fold(0.0, f64::max);
        // The crossing mask cuts gaps where the route used to cross others.
        let mut template = in_flight(after.group);
        template.mask = None;
        Some(LineCarry {
            template,
            slides,
            ghosts,
            depth: depth_of_travel(reach),
            cuts: Cuts::of(masks.0, masks.1),
            phases,
        })
    }

    /// What the line's mask cuts at a moment of the move.
    pub(super) fn mask_at(&self, progress: f64) -> Option<Mask> {
        let t = &self.phases;
        let along = emphasised(phase(progress, t.move_start, t.move_end));
        let swapped = ease_in_out(phase(progress, t.fade_start, t.fade_end));
        self.cuts.as_ref()?.at(progress, along, swapped, t)
    }

    /// The line at a moment of the move.
    pub(super) fn at(&self, progress: f64) -> Group {
        let t = &self.phases;
        let along = emphasised(phase(progress, t.move_start, t.move_end));
        let swapped = ease_in_out(phase(progress, t.fade_start, t.fade_end));
        let shown = receded(self.depth, progress);
        let mut items = Vec::with_capacity(self.template.items.len() + self.ghosts.len());
        for (child, item) in self.template.items.iter().enumerate() {
            for ghost in self.ghosts.iter().filter(|ghost| ghost.before == child) {
                let shape = match &ghost.morph {
                    Some(morph) => on_route(ghost.shape.clone(), morph.at(along)),
                    None => ghost.shape.clone(),
                };
                items.push(Item::Shape(dim(shape, (1.0 - swapped) * shown)));
            }
            items.push(
                match (item, self.slides.iter().find(|slide| slide.child == child)) {
                    (Item::Shape(shape), Some(slide)) => {
                        Item::Shape(dim(slid(shape, slide, along, swapped), shown))
                    }
                    _ => item.clone(),
                },
            );
        }
        Group {
            items,
            mask: self.mask_at(progress).map(|mask| mask.id),
            ..super::content::shell(&self.template)
        }
    }
}

/// A shape of the next line, this far along its slide.
fn slid(shape: &Shape, slide: &Slide, along: f64, swapped: f64) -> Shape {
    let shape = match &slide.morph {
        Some(morph) => on_route(shape.clone(), morph.at(along)),
        None => shape.clone(),
    };
    if slide.fades_in {
        dim(shape, swapped)
    } else {
        shape
    }
}
