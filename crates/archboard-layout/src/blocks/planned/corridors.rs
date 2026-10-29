//! Straight, elbow, and bounded two-channel templates.
use super::{clearance::Clearance, shape::Shape};
use crate::{
    blocks::assembly::PlacedLine,
    geometry::{Point, Rect},
};
pub(super) fn joins(
    ends: (Point, Point),
    bounds: Rect,
    shape: &Shape,
    guidance: (Option<&PlacedLine>, Option<super::lanes::Hint>),
    obstacles: &Clearance,
    simple: bool,
    mut visit: impl FnMut(&[Point]),
) {
    let (a, b) = ends;
    let (guide, hint) = guidance;
    visit(&[a, Point { x: a.x, y: b.y }, b]);
    visit(&[a, Point { x: b.x, y: a.y }, b]);
    let (xs, ys) = coordinates(a, b, bounds, shape, guide, hint);
    let clear = |path: &[Point]| obstacles.clear(path);
    for &x in &xs {
        let path = [a, Point { x, y: a.y }, Point { x, y: b.y }, b];
        if clear(&path) {
            visit(&path);
        }
    }
    for &y in &ys {
        let path = [a, Point { x: a.x, y }, Point { x: b.x, y }, b];
        if clear(&path) {
            visit(&path);
        }
    }
    if simple {
        return;
    }
    two_channels(a, b, &xs, &ys, shape, obstacles, visit);
}

fn coordinates(
    a: Point,
    b: Point,
    bounds: Rect,
    shape: &Shape,
    guide: Option<&PlacedLine>,
    hint: Option<super::lanes::Hint>,
) -> (Vec<f64>, Vec<f64>) {
    let mut xs = vec![
        f64::midpoint(a.x, b.x),
        bounds.x + 16.0,
        bounds.x + bounds.width - 16.0,
    ];
    let mut ys = vec![
        f64::midpoint(a.y, b.y),
        bounds.y + 16.0,
        bounds.y + bounds.height - 16.0,
    ];
    for offset in [-64.0, -48.0, -32.0, -16.0, 16.0, 32.0, 48.0, 64.0] {
        xs.extend([a.x + offset, b.x + offset]);
        ys.extend([a.y + offset, b.y + offset]);
    }
    if bounds == shape.scopes[&0].bounds {
        xs.extend([
            bounds.x,
            bounds.x + 8.0,
            bounds.x + bounds.width - 8.0,
            bounds.x + bounds.width,
        ]);
        ys.extend([
            bounds.y,
            bounds.y + 8.0,
            bounds.y + bounds.height - 8.0,
            bounds.y + bounds.height,
        ]);
    }
    hinted(hint, &mut xs, &mut ys);
    around_boxes(shape, a, b, &mut xs, &mut ys);
    if let Some(guide) = guide {
        xs.extend(guide.points.iter().map(|p| p.x));
        ys.extend(guide.points.iter().map(|p| p.y));
    }
    for label in shape.labels.values() {
        xs.extend([label.x - 16.0, label.x + label.width + 16.0]);
        ys.extend([label.y - 16.0, label.y + label.height + 16.0]);
    }
    around_routes(shape, a, b, &mut xs, &mut ys);
    xs.retain(|&x| x >= bounds.x && x <= bounds.x + bounds.width);
    ys.retain(|&y| y >= bounds.y && y <= bounds.y + bounds.height);
    xs.sort_by(f64::total_cmp);
    xs.dedup();
    ys.sort_by(f64::total_cmp);
    ys.dedup();
    (xs, ys)
}

fn around_boxes(shape: &Shape, a: Point, b: Point, xs: &mut Vec<f64>, ys: &mut Vec<f64>) {
    for at in shape
        .endpoints
        .values()
        .chain(shape.scopes.values().map(|scope| &scope.bounds))
    {
        if at.y < a.y.max(b.y) && at.y + at.height > a.y.min(b.y) {
            for gap in [16.0, 32.0, 48.0] {
                xs.extend([at.x - gap, at.x + at.width + gap]);
            }
        }
        if at.x < a.x.max(b.x) && at.x + at.width > a.x.min(b.x) {
            for gap in [16.0, 32.0, 48.0] {
                ys.extend([at.y - gap, at.y + at.height + gap]);
            }
        }
    }
}

fn around_routes(shape: &Shape, a: Point, b: Point, xs: &mut Vec<f64>, ys: &mut Vec<f64>) {
    for line in &shape.routes {
        for point in &line.points {
            if point.y >= a.y.min(b.y) - 32.0 && point.y <= a.y.max(b.y) + 32.0 {
                xs.extend([point.x - 16.0, point.x + 16.0]);
            }
            if point.x >= a.x.min(b.x) - 32.0 && point.x <= a.x.max(b.x) + 32.0 {
                ys.extend([point.y - 16.0, point.y + 16.0]);
            }
        }
    }
}

fn two_channels(
    a: Point,
    b: Point,
    xs: &[f64],
    ys: &[f64],
    shape: &Shape,
    obstacles: &Clearance,
    mut visit: impl FnMut(&[Point]),
) {
    let clear = |path: &[Point]| obstacles.clear(path);
    let mut start_x: Vec<_> = xs
        .iter()
        .copied()
        .filter(|&x| clear(&[a, Point { x, y: a.y }]))
        .collect();
    let mut end_y: Vec<_> = ys
        .iter()
        .copied()
        .filter(|&y| clear(&[Point { x: b.x, y }, b]))
        .collect();
    let mut start_y: Vec<_> = ys
        .iter()
        .copied()
        .filter(|&y| clear(&[a, Point { x: a.x, y }]))
        .collect();
    let mut end_x: Vec<_> = xs
        .iter()
        .copied()
        .filter(|&x| clear(&[Point { x, y: b.y }, b]))
        .collect();
    start_x.sort_by(|x, y| (x - a.x).abs().total_cmp(&(y - a.x).abs()));
    start_y.sort_by(|x, y| (x - a.y).abs().total_cmp(&(y - a.y).abs()));
    end_x.sort_by(|x, y| (x - b.x).abs().total_cmp(&(y - b.x).abs()));
    end_y.sort_by(|x, y| (x - b.y).abs().total_cmp(&(y - b.y).abs()));
    let breadth = if shape.routes.is_empty() { 8 } else { 16 };
    let sample = |values: Vec<f64>| {
        if values.len() <= breadth {
            return values;
        }
        let mut chosen = values[..breadth / 2].to_vec();
        for i in 0..breadth / 2 {
            chosen
                .push(values[values.len() - 1 - i * (values.len() - breadth / 2) / (breadth / 2)]);
        }
        chosen
    };
    let (start_x, start_y, end_x, end_y) = (
        sample(start_x),
        sample(start_y),
        sample(end_x),
        sample(end_y),
    );
    paired(a, b, &start_x, &end_y, obstacles, false, &mut visit);
    paired(a, b, &start_y, &end_x, obstacles, true, visit);
}
fn paired(
    a: Point,
    b: Point,
    starts: &[f64],
    ends: &[f64],
    obstacles: &Clearance,
    transpose: bool,
    mut visit: impl FnMut(&[Point]),
) {
    let flip = |p: Point| {
        if transpose {
            Point { x: p.y, y: p.x }
        } else {
            p
        }
    };
    let (a, b) = (flip(a), flip(b));
    for &x in starts {
        for &y in ends {
            let inner = [Point { x, y: a.y }, Point { x, y }, Point { x: b.x, y }].map(flip);
            if obstacles.clear(&inner) {
                visit(&[flip(a), inner[0], inner[1], inner[2], flip(b)]);
            }
        }
    }
}

fn hinted(hint: Option<super::lanes::Hint>, xs: &mut Vec<f64>, ys: &mut Vec<f64>) {
    if let Some(hint) = hint {
        if hint.horizontal {
            ys.push(hint.at);
        } else {
            xs.push(hint.at);
        }
    }
}
