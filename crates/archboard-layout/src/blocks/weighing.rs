//! What the block engine weighs a layout on when it chooses between layouts on
//! how they read (ADR 0039): a block of cards laid out, or a whole drawing as
//! placed, each on its lines as drawn: their crossings, their bends and their
//! length, and the page. A block of cards also counts each line that laps
//! round it past every card it holds as a crossing, and each line that turns
//! round the corner of a container it has no end in. A whole drawing also
//! counts its lines' runs away from their ends (ADR 0039): the length of each
//! line outside the box round both its ends, grown by a lane's room to turn.

use crate::ecma::{abs, js_max, js_min};
use crate::geometry::{Point, Rect, covering, inflate};
use crate::track::containers::FrameShape;
use crate::track::scene::Map;
use crate::track::score::{LAP, Weighed, crossings_of, laps_of};

use super::assembly::Placed;
use super::laid::{Laid, corners};
use super::packing::routed_weighed as trunk_weighed;
use super::tree::Projection;

/// The room round a line's two ends it may use to turn without running away.
const AWAY_SLACK: f64 = 24.0;
/// How far a line runs away from its ends to read as badly as one crossing: the trunk router's rate.
const AWAY_CROSSING: f64 = 300.0;

/// What a layout's lines show a reader: their crossings, their bends and their length.
fn reading_of(width: f64, height: f64, lines: &[Vec<Point>]) -> Weighed {
    let turns: Vec<Vec<Point>> = lines.iter().map(|points| corners(points)).collect();
    let mut length = 0.0;
    for points in &turns {
        for pair in points.windows(2) {
            length += abs(pair[1].x - pair[0].x) + abs(pair[1].y - pair[0].y);
        }
    }
    Weighed {
        width,
        height,
        crossings: crossings_of(turns.iter().map(Vec::as_slice)),
        bends: Some(turns.iter().fold(0.0, |sum, points| {
            sum + points.len().saturating_sub(2) as f64
        })),
        length: Some(length),
        ..Weighed::default()
    }
}

/// Whether a value lies between two bounds, or on one.
fn between(value: f64, low: f64, high: f64) -> bool {
    value >= low && value <= high
}

/// Whether a point stands inside a box or on its edge.
fn within(point: Point, at: &Rect) -> bool {
    between(point.x, at.x - 1.0, at.x + at.width + 1.0)
        && between(point.y, at.y - 1.0, at.y + at.height + 1.0)
}

/// Whether a run is level, passes over or under a box, and passes one of its sides.
fn passes_by(from: Point, to: Point, at: &Rect) -> bool {
    let level = abs(from.y - to.y) < 0.5;
    level
        && !between(from.y, at.y, at.y + at.height)
        && [at.x, at.x + at.width]
            .iter()
            .any(|&side| side > js_min(from.x, to.x) && side < js_max(from.x, to.x))
}

/// Whether a run is upright and runs beside a box for more than a short way.
fn runs_beside(from: Point, to: Point, at: &Rect) -> bool {
    let along = js_min(js_max(from.y, to.y), at.y + at.height) - js_max(js_min(from.y, to.y), at.y);
    abs(from.x - to.x) < 0.5 && !between(from.x, at.x, at.x + at.width) && along > LAP
}

/// How many lines turn round the corner of a container they have no end in.
fn turns_round_of(lines: &[Vec<Point>], frames: &[FrameShape]) -> f64 {
    lines
        .iter()
        .filter(|points| {
            let legs: Vec<(Point, Point)> =
                points.windows(2).map(|pair| (pair[0], pair[1])).collect();
            frames.iter().any(|frame| {
                let at = &frame.bx;
                !within(points[0], at)
                    && !within(points[points.len() - 1], at)
                    && legs.windows(2).any(|pair| {
                        let ((a, b), (c, d)) = (pair[0], pair[1]);
                        (passes_by(a, b, at) && runs_beside(c, d, at))
                            || (runs_beside(a, b, at) && passes_by(c, d, at))
                    })
            })
        })
        .count() as f64
}

/// What a block of cards laid out is weighed on, each line that laps round it
/// past every card it holds or turns round a container it has no end in
/// counted as a crossing more. A label rides its line, so it does not hide a lap.
pub(crate) fn weighed_laid(laid: &Laid) -> Weighed {
    let lines: Vec<Vec<Point>> = laid.lines.values().map(|points| corners(points)).collect();
    let cards: Vec<Rect> = laid
        .boxes
        .iter()
        .filter(|(id, _)| !id.starts_with("label:"))
        .map(|(_, &at)| at)
        .collect();
    let read = reading_of(laid.width, laid.height, &lines);
    let round = turns_round_of(&lines, laid.frames.as_deref().unwrap_or(&[]));
    Weighed {
        crossings: read.crossings + laps_of(lines.iter().map(Vec::as_slice), &cards) + round,
        ..read
    }
}

/// What a whole drawing is weighed on as the trunk router weighs it, with the
/// room its lines spend running round what they pass counted as crossings,
/// and its lines' runs away from their ends.
pub(crate) fn routed_weighed(placed: &Placed, projections: &[Projection]) -> Weighed {
    let lines: Vec<&[Point]> = placed
        .edges
        .iter()
        .map(|edge| edge.points.as_slice())
        .collect();
    Weighed {
        away: Some(away_placed(projections, placed)),
        ..trunk_weighed(placed.width, placed.height, &lines)
    }
}

/// How much of one level or upright run lies outside a box.
fn outside(from: Point, to: Point, region: &Rect) -> f64 {
    let level = abs(from.y - to.y) < abs(from.x - to.x);
    let (one, other, across) = if level {
        (from.x, to.x, from.y)
    } else {
        (from.y, to.y, from.x)
    };
    let (start, end) = (js_min(one, other), js_max(one, other));
    let (low, high, near, far) = if level {
        (
            region.x,
            region.x + region.width,
            region.y,
            region.y + region.height,
        )
    } else {
        (
            region.y,
            region.y + region.height,
            region.x,
            region.x + region.width,
        )
    };
    let inside = if across < near || across > far {
        0.0
    } else {
        js_min(end, high) - js_max(start, low)
    };
    end - start - js_max(0.0, inside)
}

/// How far one line runs outside the box round its two ends.
fn away_of(points: &[Point], ends: (Rect, Rect)) -> f64 {
    let region = inflate(covering(ends.0, ends.1), AWAY_SLACK);
    points
        .windows(2)
        .fold(0.0, |sum, pair| sum + outside(pair[0], pair[1], &region))
}

/// How many crossings some lines' runs away from their ends weigh: each
/// line's length outside the box round its two ends, in `AWAY_CROSSING`s.
pub(crate) fn runs_away<'a>(lines: impl Iterator<Item = (&'a [Point], (Rect, Rect))>) -> f64 {
    lines.fold(0.0, |crossings, (points, ends)| {
        crossings + (away_of(points, ends) / AWAY_CROSSING).floor()
    })
}

/// What a whole drawing as placed is weighed on, its lines joined end to end
/// through every block, and their runs away from their ends.
pub(crate) fn weighed_placed(placed: &Placed, projections: &[Projection]) -> Weighed {
    let lines: Vec<Vec<Point>> = placed
        .edges
        .iter()
        .map(|edge| edge.points.clone())
        .collect();
    Weighed {
        away: Some(away_placed(projections, placed)),
        ..reading_of(placed.width, placed.height, &lines)
    }
}

/// How many crossings the runs away of a whole drawing's lines weigh.
fn away_placed(projections: &[Projection], placed: &Placed) -> f64 {
    let mut boxes: Map<&str, Rect> = Map::default();
    for one in placed.frames.iter().chain(&placed.cards) {
        boxes.insert(&one.id, one.bx);
    }
    let ends: Map<&str, (&str, &str)> = projections
        .iter()
        .map(|projection| {
            (
                projection.edge.id.as_str(),
                (projection.edge.source(), projection.edge.target()),
            )
        })
        .collect();
    runs_away(placed.edges.iter().filter_map(|edge| {
        let &(from, to) = ends.get(edge.id.as_str())?;
        Some((edge.points.as_slice(), (*boxes.get(from)?, *boxes.get(to)?)))
    }))
}

#[cfg(test)]
mod tests {
    use std::rc::Rc;

    use super::*;
    use crate::blocks::assembly::{PlacedCard, PlacedLine};
    use crate::blocks::tree::BlockId;
    use crate::graph::Edge;
    use crate::track::score::reads_better;

    fn card(id: &str, x: f64, y: f64) -> PlacedCard {
        PlacedCard {
            id: id.to_owned(),
            bx: Rect {
                x,
                y,
                width: 200.0,
                height: 80.0,
            },
            depth: 0,
            header: None,
        }
    }

    fn placed_line(id: &str, points: &[(f64, f64)]) -> PlacedLine {
        PlacedLine {
            id: id.to_owned(),
            points: points.iter().map(|&(x, y)| Point { x, y }).collect(),
            label: None,
        }
    }

    fn projection(id: &str, source: &str, target: &str) -> Projection {
        Projection {
            edge: Rc::new(Edge {
                id: id.to_owned(),
                sources: vec![source.to_owned()],
                targets: vec![target.to_owned()],
                labels: None,
                layout_options: None,
            }),
            at: BlockId(0),
            out: Vec::new(),
            into: Vec::new(),
            from: source.to_owned(),
            to: target.to_owned(),
        }
    }

    /// Four cards with two relationships drawn: one straight down between the
    /// two middle cards, and one from the left card to the right card along a route.
    fn weighed_across(across: &[(f64, f64)]) -> Weighed {
        let placed = Placed {
            width: 800.0,
            height: 800.0,
            cards: vec![
                card("from", 0.0, 300.0),
                card("to", 600.0, 300.0),
                card("above", 300.0, 0.0),
                card("below", 300.0, 700.0),
            ],
            frames: Vec::new(),
            regions: Vec::new(),
            edges: vec![
                placed_line("down", &[(400.0, 80.0), (400.0, 700.0)]),
                placed_line("across", across),
            ],
            titles: Vec::new(),
        };
        let projections = [
            projection("across", "from", "to"),
            projection("down", "above", "below"),
        ];
        weighed_placed(&placed, &projections)
    }

    #[test]
    fn a_line_run_away_from_its_ends_round_the_picture_reads_worse_than_a_crossing() {
        // The line from the left card to the right card either hops the line
        // between them, or loops round over the top of the picture to miss it.
        let hopping = weighed_across(&[(200.0, 340.0), (600.0, 340.0)]);
        let looping = weighed_across(&[
            (100.0, 300.0),
            (100.0, -40.0),
            (700.0, -40.0),
            (700.0, 300.0),
        ]);
        assert_eq!((hopping.crossings, looping.crossings), (1.0, 0.0));
        assert!(reads_better(&hopping, &looping));
        assert!(!reads_better(&looping, &hopping));
    }
}
