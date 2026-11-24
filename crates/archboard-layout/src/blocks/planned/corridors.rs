//! Straight, elbow, and bounded two-channel templates.
use super::{clearance::Clearance, shape::Shape};
use crate::{
    blocks::assembly::PlacedLine,
    geometry::{Point, Rect},
};

/// Edge-invariant geometry extracted once per `choices::search`, reused across all port pairs.
pub(super) struct CorridorBase {
    bounds: Rect,
    fixed_xs: Vec<f64>,
    fixed_ys: Vec<f64>,
    boxes: Vec<Rect>,
    route_points: Vec<Point>,
    breadth: usize,
}

/// Reusable scratch buffers for `CorridorBase::joins`.
#[derive(Default)]
pub(super) struct CorridorScratch {
    xs: Vec<f64>,
    ys: Vec<f64>,
    keys: Vec<i64>,
}

impl CorridorBase {
    pub(super) fn new(
        bounds: Rect,
        shape: &Shape,
        guide: Option<&PlacedLine>,
        hint: Option<super::lanes::Hint>,
    ) -> Self {
        let mut fixed_xs = vec![bounds.x + 16.0, bounds.x + bounds.width - 16.0];
        let mut fixed_ys = vec![bounds.y + 16.0, bounds.y + bounds.height - 16.0];
        if bounds == shape.scopes[&0].bounds {
            fixed_xs.extend([
                bounds.x,
                bounds.x + 8.0,
                bounds.x + bounds.width - 8.0,
                bounds.x + bounds.width,
            ]);
            fixed_ys.extend([
                bounds.y,
                bounds.y + 8.0,
                bounds.y + bounds.height - 8.0,
                bounds.y + bounds.height,
            ]);
        }
        hinted(hint, &mut fixed_xs, &mut fixed_ys);
        if let Some(guide) = guide {
            fixed_xs.extend(guide.points.iter().map(|p| p.x));
            fixed_ys.extend(guide.points.iter().map(|p| p.y));
        }
        for label in shape.labels.values() {
            fixed_xs.extend([label.x - 16.0, label.x + label.width + 16.0]);
            fixed_ys.extend([label.y - 16.0, label.y + label.height + 16.0]);
        }
        let max_x = bounds.x + bounds.width;
        let max_y = bounds.y + bounds.height;
        fixed_xs.retain(|&x| x >= bounds.x && x <= max_x);
        fixed_ys.retain(|&y| y >= bounds.y && y <= max_y);
        let mut keys = Vec::new();
        ordered(&mut fixed_xs, &mut keys);
        ordered(&mut fixed_ys, &mut keys);
        let boxes: Vec<Rect> = shape
            .endpoints
            .values()
            .copied()
            .chain(shape.scopes.values().map(|scope| scope.bounds))
            .collect();
        let route_points: Vec<Point> = shape
            .routes
            .iter()
            .flat_map(|line| line.points.iter().copied())
            .collect();
        let breadth = if shape.routes.is_empty() { 8 } else { 16 };
        Self {
            bounds,
            fixed_xs,
            fixed_ys,
            boxes,
            route_points,
            breadth,
        }
    }

    pub(super) fn joins(
        &self,
        ends: (Point, Point),
        obstacles: &Clearance,
        simple: bool,
        scratch: &mut CorridorScratch,
        mut visit: impl FnMut(&[Point]),
    ) {
        let (a, b) = ends;
        visit(&[a, Point { x: a.x, y: b.y }, b]);
        visit(&[a, Point { x: b.x, y: a.y }, b]);
        // Every corridor of one family leaves and enters on the same two lines, so the reach
        // along each line answers its end runs, and only the middle run needs a lookup.
        let (leave_x, enter_x) = (
            obstacles.reach(false, a.y, a.x),
            obstacles.reach(false, b.y, b.x),
        );
        let (leave_y, enter_y) = (
            obstacles.reach(true, a.x, a.y),
            obstacles.reach(true, b.x, b.y),
        );
        let x_win = coord_window(
            (leave_x, a.x),
            (enter_x, b.x),
            (self.bounds.x, self.bounds.x + self.bounds.width),
            simple,
        );
        let y_win = coord_window(
            (leave_y, a.y),
            (enter_y, b.y),
            (self.bounds.y, self.bounds.y + self.bounds.height),
            simple,
        );
        self.coordinates(a, b, (x_win, y_win), scratch);
        let reached = |(low, high): (f64, f64), from: f64, to: f64| {
            if to < from { to >= low } else { to <= high }
        };
        for &x in &scratch.xs {
            if reached(leave_x, a.x, x)
                && reached(enter_x, b.x, x)
                && obstacles.clear_segment(true, x, a.y, b.y)
            {
                visit(&[a, Point { x, y: a.y }, Point { x, y: b.y }, b]);
            }
        }
        for &y in &scratch.ys {
            if reached(leave_y, a.y, y)
                && reached(enter_y, b.y, y)
                && obstacles.clear_segment(false, y, a.x, b.x)
            {
                visit(&[a, Point { x: a.x, y }, Point { x: b.x, y }, b]);
            }
        }
        if simple {
            return;
        }
        two_channels(
            a,
            b,
            &scratch.xs,
            &scratch.ys,
            self.breadth,
            obstacles,
            visit,
        );
    }

    fn coordinates(
        &self,
        a: Point,
        b: Point,
        windows: AxisWindows,
        scratch: &mut CorridorScratch,
    ) {
        let (x_win, y_win) = windows;
        let (xs, ys) = (&mut scratch.xs, &mut scratch.ys);
        xs.clear();
        ys.clear();
        if let Some(win) = x_win {
            seed_axis(&self.fixed_xs, (a.x, b.x), win, xs);
        }
        if let Some(win) = y_win {
            seed_axis(&self.fixed_ys, (a.y, b.y), win, ys);
        }
        if x_win.is_some() || y_win.is_some() {
            around_boxes(&self.boxes, a, b, windows, xs, ys);
            around_routes(&self.route_points, a, b, windows, xs, ys);
        }
        if x_win.is_some() {
            ordered(xs, &mut scratch.keys);
        }
        if y_win.is_some() {
            ordered(ys, &mut scratch.keys);
        }
    }
}

type AxisWindows = (Option<(f64, f64)>, Option<(f64, f64)>);

/// The inclusive coordinate window `[min, max]` that `reached(reach, from, v)` can satisfy.
fn reach_window((low, high): (f64, f64), from: f64) -> Option<(f64, f64)> {
    if low > from && high < from {
        return None;
    }
    Some((
        if low <= from { low } else { from },
        if high >= from { high } else { from },
    ))
}

/// The coordinate window needed for one axis: the intersection of both ends' reach windows when
/// `simple` (only 1-channel joins run), or their bounding hull otherwise.
fn coord_window(
    (reach_a, a): ((f64, f64), f64),
    (reach_b, b): ((f64, f64), f64),
    (bound_lo, bound_hi): (f64, f64),
    simple: bool,
) -> Option<(f64, f64)> {
    let (wa, wb) = (reach_window(reach_a, a), reach_window(reach_b, b));
    let (lo, hi) = if simple {
        let (a_lo, a_hi) = wa?;
        let (b_lo, b_hi) = wb?;
        (a_lo.max(b_lo), a_hi.min(b_hi))
    } else {
        match (wa, wb) {
            (Some((a_lo, a_hi)), Some((b_lo, b_hi))) => (a_lo.min(b_lo), a_hi.max(b_hi)),
            (Some(w), None) | (None, Some(w)) => w,
            (None, None) => return None,
        }
    };
    let (lo, hi) = (lo.max(bound_lo), hi.min(bound_hi));
    (lo <= hi).then_some((lo, hi))
}

fn push_in(out: &mut Vec<f64>, v: f64, (lo, hi): (f64, f64)) {
    if v >= lo && v <= hi {
        out.push(v);
    }
}

fn seed_axis(fixed: &[f64], (a, b): (f64, f64), win: (f64, f64), out: &mut Vec<f64>) {
    let start = fixed.partition_point(|&v| v < win.0);
    let end = fixed.partition_point(|&v| v <= win.1);
    out.extend_from_slice(&fixed[start..end]);
    push_in(out, f64::midpoint(a, b), win);
    for offset in [-64.0, -48.0, -32.0, -16.0, 16.0, 32.0, 48.0, 64.0] {
        push_in(out, a + offset, win);
        push_in(out, b + offset, win);
    }
}

/// Coordinates in `f64::total_cmp` order without repeats. Each sorts by the integer that
/// orders as `total_cmp` does, which compares faster, and equal keys are equal bits.
fn ordered(values: &mut Vec<f64>, keys: &mut Vec<i64>) {
    if values.len() <= 1 {
        return;
    }
    let key = |bits: i64| bits ^ ((bits >> 63).cast_unsigned() >> 1).cast_signed();
    keys.clear();
    keys.extend(values.iter().map(|v| key(v.to_bits().cast_signed())));
    keys.sort_unstable();
    keys.dedup();
    values.clear();
    values.extend(
        keys.iter()
            .map(|&k| f64::from_bits(key(k).cast_unsigned())),
    );
    values.dedup();
}

fn around_boxes(
    boxes: &[Rect],
    a: Point,
    b: Point,
    (x_win, y_win): AxisWindows,
    xs: &mut Vec<f64>,
    ys: &mut Vec<f64>,
) {
    let (lo_x, hi_x) = (a.x.min(b.x), a.x.max(b.x));
    let (lo_y, hi_y) = (a.y.min(b.y), a.y.max(b.y));
    for at in boxes {
        if let Some(win) = x_win
            && at.y < hi_y
            && at.y + at.height > lo_y
        {
            for gap in [16.0, 32.0, 48.0] {
                push_in(xs, at.x - gap, win);
                push_in(xs, at.x + at.width + gap, win);
            }
        }
        if let Some(win) = y_win
            && at.x < hi_x
            && at.x + at.width > lo_x
        {
            for gap in [16.0, 32.0, 48.0] {
                push_in(ys, at.y - gap, win);
                push_in(ys, at.y + at.height + gap, win);
            }
        }
    }
}

fn around_routes(
    points: &[Point],
    a: Point,
    b: Point,
    (x_win, y_win): AxisWindows,
    xs: &mut Vec<f64>,
    ys: &mut Vec<f64>,
) {
    let (lo_x, hi_x) = (a.x.min(b.x) - 32.0, a.x.max(b.x) + 32.0);
    let (lo_y, hi_y) = (a.y.min(b.y) - 32.0, a.y.max(b.y) + 32.0);
    for point in points {
        if let Some(win) = x_win
            && point.y >= lo_y
            && point.y <= hi_y
        {
            push_in(xs, point.x - 16.0, win);
            push_in(xs, point.x + 16.0, win);
        }
        if let Some(win) = y_win
            && point.x >= lo_x
            && point.x <= hi_x
        {
            push_in(ys, point.y - 16.0, win);
            push_in(ys, point.y + 16.0, win);
        }
    }
}

fn two_channels(
    a: Point,
    b: Point,
    xs: &[f64],
    ys: &[f64],
    breadth: usize,
    obstacles: &Clearance,
    mut visit: impl FnMut(&[Point]),
) {
    // One reach along each end's two lines answers every run that leaves or enters there.
    let within = |values: &[f64], vertical: bool, at: Point| {
        let (along, from) = if vertical { (at.x, at.y) } else { (at.y, at.x) };
        let (low, high) = obstacles.reach(vertical, along, from);
        (values.iter().copied())
            .filter(|&to| if to < from { to >= low } else { to <= high })
            .collect::<Vec<_>>()
    };
    let mut start_x = within(xs, false, a);
    let mut end_y = within(ys, true, b);
    let mut start_y = within(ys, true, a);
    let mut end_x = within(xs, false, b);
    start_x.sort_by(|x, y| (x - a.x).abs().total_cmp(&(y - a.x).abs()));
    start_y.sort_by(|x, y| (x - a.y).abs().total_cmp(&(y - a.y).abs()));
    end_x.sort_by(|x, y| (x - b.x).abs().total_cmp(&(y - b.x).abs()));
    end_y.sort_by(|x, y| (x - b.y).abs().total_cmp(&(y - b.y).abs()));
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
    // Each line's reach answers every pair on it without another lookup.
    let across: Vec<_> = ends
        .iter()
        .map(|&y| obstacles.reach(transpose, y, b.x))
        .collect();
    for &x in starts {
        let (low, high) = obstacles.reach(!transpose, x, a.y);
        for (&y, &(left, right)) in ends.iter().zip(&across) {
            let down = if y < a.y { y >= low } else { y <= high };
            if down && (if x < b.x { x >= left } else { x <= right }) {
                let inner = [Point { x, y: a.y }, Point { x, y }, Point { x: b.x, y }].map(flip);
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
