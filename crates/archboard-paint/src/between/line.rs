//! Carrying a connection's line from its old route to its new one, and
//! drawing a new line on.
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
//! morphs with the stroke, fading in or out. A line only the next scene has is
//! drawn from its start to its end, its arrowhead appearing once it is nearly
//! there.

use archboard_scene::geometry::Point;
use archboard_scene::scene::{Geometry, Group, Item, PathStep, Purpose, Role, Shape};

use super::content::look;
use super::ease::{ease_in_out, ease_out, emphasised, phase};
use super::found::Found;
use super::morph::{Morph, length, route_of};
use super::phases::Transition;

/// How much of an arrival is spent fading in before the rest is drawing on.
const ARRIVE_FADE_SHARE: f64 = 0.25;

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
fn in_flight(group: &Group) -> Group {
    Group {
        items: without_ports_and_pulses(&group.items),
        ..super::content::shell(group)
    }
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

/// One line carried from its old route to its new one.
#[derive(Clone, Debug)]
pub(super) struct LineCarry {
    template: Group,
    slides: Vec<Slide>,
    ghosts: Vec<Ghost>,
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
        // The crossing mask cuts gaps where the route used to cross others.
        let mut template = in_flight(after.group);
        template.mask = None;
        Some(LineCarry {
            template,
            slides,
            ghosts,
            phases,
        })
    }

    /// The line at a moment of the move.
    pub(super) fn at(&self, progress: f64) -> Group {
        let t = &self.phases;
        let along = emphasised(phase(progress, t.move_start, t.move_end));
        let swapped = ease_in_out(phase(progress, t.fade_start, t.fade_end));
        let mut items = Vec::with_capacity(self.template.items.len() + self.ghosts.len());
        for (child, item) in self.template.items.iter().enumerate() {
            for ghost in self.ghosts.iter().filter(|ghost| ghost.before == child) {
                let shape = match &ghost.morph {
                    Some(morph) => on_route(ghost.shape.clone(), morph.at(along)),
                    None => ghost.shape.clone(),
                };
                items.push(Item::Shape(dim(shape, 1.0 - swapped)));
            }
            items.push(
                match (item, self.slides.iter().find(|slide| slide.child == child)) {
                    (Item::Shape(shape), Some(slide)) => {
                        Item::Shape(slid(shape, slide, along, swapped))
                    }
                    _ => item.clone(),
                },
            );
        }
        Group {
            items,
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

/// A shape being drawn on, and how long its route is.
#[derive(Clone, Copy, Debug)]
struct Stroked {
    child: usize,
    length: f64,
}

/// A line only the next scene has, drawn on from its start.
#[derive(Clone, Debug)]
pub(super) struct DrawOn {
    template: Group,
    strokes: Vec<Stroked>,
    start: f64,
    end: f64,
    arrowhead_at: f64,
}

impl DrawOn {
    /// Prepare to draw a line on between two points of the move.
    ///
    /// A dashed line keeps its dashes and simply fades in: drawing it on means
    /// taking its dash away.
    pub(super) fn new(group: &Group, start: f64, end: f64, arrowhead_at: f64) -> DrawOn {
        let strokes = group
            .items
            .iter()
            .enumerate()
            .filter_map(|(child, item)| {
                let Item::Shape(shape) = item else {
                    return None;
                };
                shape
                    .stroke
                    .as_ref()
                    .filter(|stroke| stroke.dashes.is_empty())?;
                let length = length(&route_of(&shape.geometry)?).filter(|length| *length > 0.0)?;
                Some(Stroked { child, length })
            })
            .collect();
        let mut template = in_flight(group);
        template.mask.clone_from(&group.mask);
        DrawOn {
            template,
            strokes,
            start,
            end,
            arrowhead_at,
        }
    }

    /// The line this far through the move.
    pub(super) fn at(&self, progress: f64) -> Group {
        let arrived = phase(progress, self.start, self.end);
        let mut group = self.template.clone();
        group.opacity =
            Some(group.opacity.unwrap_or(1.0) * ease_out(phase(arrived, 0.0, ARRIVE_FADE_SHARE)));
        if arrived >= 1.0 {
            return group;
        }
        let drawn = emphasised(arrived);
        for &Stroked { child, length } in &self.strokes {
            let Some(Item::Shape(shape)) = group.items.get_mut(child) else {
                continue;
            };
            // One dash as long as the line, pulled back all the way and let out.
            if let Some(stroke) = &mut shape.stroke {
                stroke.dashes = vec![length, length];
                stroke.dash_offset = Some(length * (1.0 - drawn));
            }
            // The arrowheads wait until the line is nearly there.
            if arrived < self.arrowhead_at {
                shape.marker = None;
                shape.start_marker = None;
            }
        }
        group
    }
}
