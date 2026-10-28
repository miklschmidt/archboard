//! Exact row lanes and target-owned rails shared by prediction and emission.

use super::super::geometry::clean;
use super::{CLEAR, Key, Model, Paths, Piece, key};
use crate::geometry::{Point, Side};
use std::collections::{BTreeMap, BTreeSet};
const LANE: f64 = 16.0;

pub(super) struct Plan {
    pub offsets: Vec<Point>,
    pub tails: Paths,
    pub heads: Paths,
    pub width: f64,
    pub height: f64,
}

fn keys(model: &Model<'_>, piece: &Piece) -> BTreeSet<Key> {
    piece
        .ports()
        .into_iter()
        .map(|edge| key(model, edge))
        .collect()
}

pub(super) fn skirt(model: &Model<'_>, piece: &Piece, side: Side) -> f64 {
    let ports: BTreeSet<_> = piece
        .tails
        .keys()
        .filter(|_| piece.tail_wall == side)
        .chain(piece.heads.keys().filter(|_| piece.head_wall == side))
        .map(|&edge| key(model, edge))
        .collect();
    if ports.is_empty() {
        0.0
    } else {
        CLEAR + ports.len() as f64 * LANE
    }
}

pub(super) fn plan(
    model: &Model<'_>,
    children: &[Piece],
    rows: &[Vec<usize>],
    top: f64,
    min_width: f64,
) -> Plan {
    let tails: BTreeSet<_> = children
        .iter()
        .flat_map(|p| p.tails.keys())
        .copied()
        .collect();
    let heads: BTreeSet<_> = children
        .iter()
        .flat_map(|p| p.heads.keys())
        .copied()
        .collect();
    let complete: BTreeSet<_> = tails
        .intersection(&heads)
        .map(|&edge| key(model, edge))
        .collect();
    let header_x: Vec<_> = children
        .iter()
        .filter(|p| p.header)
        .flat_map(|p| {
            p.tails
                .values()
                .filter_map(|p| p.last())
                .chain(p.heads.values().filter_map(|p| p.first()))
        })
        .map(|p| p.x)
        .collect();
    let mut tracks = BTreeMap::new();
    let mut x = CLEAR;
    for key in complete {
        while header_x.iter().any(|at| (x - at).abs() < LANE) {
            x += LANE;
        }
        tracks.insert(key, x);
        x += LANE;
    }
    let rail = x + CLEAR;
    let mut plan = Plan {
        offsets: vec![Point { x: 0.0, y: 0.0 }; children.len()],
        tails: Paths::new(),
        heads: Paths::new(),
        width: rail.max(min_width),
        height: top,
    };
    for row in rows {
        add_row(&mut plan, model, children, row, &tracks, rail);
    }
    let body_right = children
        .iter()
        .zip(&plan.offsets)
        .map(|(p, at)| at.x + p.shape.drawing.width)
        .chain(
            plan.tails
                .values()
                .chain(plan.heads.values())
                .flatten()
                .map(|p| p.x),
        )
        .fold(0.0, f64::max);
    let body_bottom = children
        .iter()
        .zip(&plan.offsets)
        .map(|(p, at)| at.y + p.shape.drawing.height)
        .chain(
            plan.tails
                .values()
                .chain(plan.heads.values())
                .flatten()
                .map(|p| p.y),
        )
        .fold(top, f64::max);
    plan.width = (body_right + CLEAR).max(min_width);
    plan.height = body_bottom + CLEAR;
    for edge in tails.symmetric_difference(&heads) {
        let path = plan
            .tails
            .get_mut(edge)
            .or_else(|| plan.heads.get_mut(edge))
            .expect("a boundary path");
        path.push(Point {
            x: if tails.contains(edge) {
                plan.width
            } else {
                0.0
            },
            y: path.last().expect("a row lane").y,
        });
    }
    plan
}

fn add_row(
    plan: &mut Plan,
    model: &Model<'_>,
    children: &[Piece],
    row: &[usize],
    tracks: &BTreeMap<Key, f64>,
    rail: f64,
) {
    let row_keys: BTreeSet<_> = row
        .iter()
        .flat_map(|&i| keys(model, &children[i]))
        .collect();
    let height = row
        .iter()
        .map(|&i| children[i].shape.drawing.height)
        .fold(0.0, f64::max);
    let band = plan.height + height + CLEAR;
    let lanes: BTreeMap<_, _> = row_keys
        .into_iter()
        .enumerate()
        .map(|(i, key)| (key, band + i as f64 * LANE))
        .collect();
    let mut x = rail;
    for &index in row {
        let piece = &children[index];
        let offset = if piece.header {
            Point { x: 0.0, y: 0.0 }
        } else {
            Point {
                x: x + skirt(model, piece, Side::Left),
                y: plan.height,
            }
        };
        plan.offsets[index] = offset;
        let slots = |side| {
            piece
                .tails
                .keys()
                .filter(|_| piece.tail_wall == side)
                .chain(piece.heads.keys().filter(|_| piece.head_wall == side))
                .map(|&edge| key(model, edge))
                .collect::<BTreeSet<_>>()
                .into_iter()
                .enumerate()
                .map(|(i, key)| (key, i))
                .collect::<BTreeMap<_, _>>()
        };
        let tail_slots = slots(piece.tail_wall);
        let head_slots = slots(piece.head_wall);
        for edge in piece.ports() {
            let key = key(model, edge);
            let track = tracks.get(&key).copied().unwrap_or(0.0);
            if let Some(points) = piece.tails.get(&edge) {
                plan.tails.insert(
                    edge,
                    escape(
                        *points.last().expect("a tail"),
                        offset,
                        piece.tail_wall,
                        tail_slots[&key],
                        lanes[&key],
                        track,
                    ),
                );
            }
            if let Some(points) = piece.heads.get(&edge) {
                plan.heads.insert(
                    edge,
                    escape(
                        points[0],
                        offset,
                        piece.head_wall,
                        head_slots[&key],
                        lanes[&key],
                        track,
                    ),
                );
            }
        }
        x = offset.x + piece.shape.drawing.width + skirt(model, piece, Side::Right) + CLEAR;
    }
    plan.width = plan.width.max(x);
    plan.height = band + lanes.len() as f64 * LANE + CLEAR;
}

fn escape(at: Point, by: Point, side: Side, slot: usize, y: f64, rail: f64) -> Vec<Point> {
    let at = Point {
        x: at.x + by.x,
        y: at.y + by.y,
    };
    let x = match side {
        Side::Left => at.x - CLEAR - slot as f64 * LANE,
        Side::Right => at.x + CLEAR + slot as f64 * LANE,
        _ => at.x,
    };
    clean(vec![
        at,
        Point { x, y: at.y },
        Point { x, y },
        Point { x: rail, y },
    ])
}
