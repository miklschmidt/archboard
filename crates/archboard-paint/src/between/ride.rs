//! A line's pulses through a move. They keep running the whole way, on the line
//! as it stands at each moment. A line that gets another rhythm crosses over to
//! it, so that no pulse jumps.

use archboard_scene::geometry::{Curve, Point, Segment};
use archboard_scene::scene::{Group, Item, PathStep, TrafficMark};

use super::arrive::Ground;
use super::content::shell;
use super::ease::{ease_in_out, emphasised, phase, receded};
use super::line::depth_of_travel;
use super::morph::Morph;
use super::phases::Transition;

/// A curve as the steps of a path.
fn steps_of(curve: &Curve) -> Vec<PathStep> {
    let mut steps = vec![PathStep::Move { to: curve.from }];
    steps.extend(curve.segments.iter().map(|segment| match *segment {
        Segment::Line { to } => PathStep::Line { to },
        Segment::Cubic { first, second, to } => PathStep::Cubic { first, second, to },
    }));
    steps
}

/// The steps of a path as a curve, for a path that a morph gives.
fn curve_of(steps: &[PathStep]) -> Option<Curve> {
    let (PathStep::Move { to }, rest) = steps.split_first()? else {
        return None;
    };
    let from: Point = *to;
    let segments = rest
        .iter()
        .map(|step| match *step {
            PathStep::Line { to } => Some(Segment::Line { to }),
            PathStep::Cubic { first, second, to } => Some(Segment::Cubic { first, second, to }),
            _ => None,
        })
        .collect::<Option<Vec<_>>>()?;
    Some(Curve { from, segments })
}

/// The pulses a traffic group holds.
pub(super) fn mark_of(group: &Group) -> Option<&TrafficMark> {
    group.items.iter().find_map(|item| match item {
        Item::Traffic(mark) => Some(mark),
        _ => None,
    })
}

/// A line's pulses, carried from the last picture to the next.
#[derive(Clone, Debug)]
pub(super) struct Ride {
    group: Group,
    /// The pulses of the last picture, when they run another way.
    last: Option<TrafficMark>,
    next: TrafficMark,
    /// The route between the pulses' routes in the two pictures.
    morph: Option<Morph>,
    /// How far the pulses recede with their line.
    depth: f64,
    /// The visibility of pulses whose entrance was still running.
    ground: Option<Ground>,
    phases: Transition,
}

impl Ride {
    /// The ride between two traffic groups that both hold pulses.
    pub(super) fn new(old: &Group, group: &Group, phases: Transition) -> Option<Ride> {
        let last = mark_of(old)?;
        let next = mark_of(group)?;
        let same = last.motion == next.motion && last.look == next.look;
        let morph = Morph::new(&steps_of(&last.route), &steps_of(&next.route));
        Some(Ride {
            group: shell(group),
            last: (!same).then(|| last.clone()),
            next: next.clone(),
            depth: depth_of_travel(morph.as_ref().map_or(0.0, Morph::reach)),
            morph,
            ground: Ground::new(old, group, phases),
            phases,
        })
    }

    /// One mark on the route of a moment, this much visible.
    fn drawn(&self, mark: &TrafficMark, along: f64, visible: f64, progress: f64) -> Item {
        let route = self
            .morph
            .as_ref()
            .and_then(|morph| curve_of(&morph.at(along)));
        let mut group = self.group.clone();
        if let Some(ground) = self.ground {
            ground.apply(&mut group, progress);
        }
        group.items = vec![Item::Traffic(TrafficMark {
            route: route.unwrap_or_else(|| mark.route.clone()),
            ..mark.clone()
        })];
        group.opacity = Some(group.opacity.unwrap_or(1.0) * visible);
        Item::Group(group)
    }

    /// The pulses at a moment of the move.
    pub(super) fn at(&self, progress: f64) -> Vec<Item> {
        let t = &self.phases;
        let along = emphasised(phase(progress, t.move_start, t.move_end));
        let shown = receded(self.depth, progress);
        let Some(last) = &self.last else {
            return vec![self.drawn(&self.next, along, shown, progress)];
        };
        let swapped = ease_in_out(phase(progress, t.fade_start, t.fade_end));
        vec![
            self.drawn(last, along, (1.0 - swapped) * shown, progress),
            self.drawn(&self.next, along, swapped * shown, progress),
        ]
    }
}
