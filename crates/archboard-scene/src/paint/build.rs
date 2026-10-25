//! Building a scene: a painter returns runs of items, laid out as layers on
//! lines of their own ([`lines`]) or run together ([`concat()`]).

use crate::geometry::{Curve, Point, Segment, round_coord};
use crate::scene::{Group, Item, PathStep, Role, Shape, Subject, Text};

/// What a painter returns: some items in order, possibly none.
pub(super) type Items = Vec<Item>;

/// Runs of items, each on lines of its own, the ones that hold nothing left out.
pub(super) fn lines(fragments: Vec<Items>) -> Items {
    let mut joined = Vec::new();
    for fragment in fragments
        .into_iter()
        .filter(|fragment| !fragment.is_empty())
    {
        if !joined.is_empty() {
            joined.push(Item::Break);
        }
        joined.extend(fragment);
    }
    joined
}

/// Runs of items run together.
pub(super) fn concat(fragments: Vec<Items>) -> Items {
    fragments.into_iter().flatten().collect()
}

/// One shape, as a run of items.
pub(super) fn shape(shape: Shape) -> Items {
    vec![Item::Shape(shape)]
}

/// One run of words, as a run of items.
pub(super) fn text(text: Text) -> Items {
    vec![Item::Text(text)]
}

/// One group, as a run of items.
pub(super) fn grouped(group: Group) -> Items {
    vec![Item::Group(group)]
}

/// A group of some role and subject holding some items, as a run of items.
pub(super) fn group(role: Role, subject: Option<Subject>, items: Items) -> Items {
    grouped(Group {
        subject,
        ..Group::new(role, items)
    })
}

/// A point, rounded as it is drawn.
pub(super) fn point(x: f64, y: f64) -> Point {
    Point {
        x: round_coord(x),
        y: round_coord(y),
    }
}

/// A route as the steps of a path, its points rounded as they are drawn.
pub(super) fn route(curve: &Curve) -> Vec<PathStep> {
    let mut steps = vec![PathStep::Move {
        to: point(curve.from.x, curve.from.y),
    }];
    steps.extend(curve.segments.iter().map(|segment| match segment {
        Segment::Line { to } => PathStep::Line {
            to: point(to.x, to.y),
        },
        Segment::Cubic { first, second, to } => PathStep::Cubic {
            first: point(first.x, first.y),
            second: point(second.x, second.y),
            to: point(to.x, to.y),
        },
    }));
    steps
}
