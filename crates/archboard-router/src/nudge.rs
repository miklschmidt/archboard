//! Nudging: the routes found one at a time may run on one line; this moves
//! their segments apart, one axis at a time, as [W09] §5.2 does.
//!
//! - Segments of routes that share an end and run together from it are one
//!   line until the routes part ([W12] §3).
//! - The segment that holds a route's pin stays where the pin is. Where
//!   that leaves a channel too narrow for its lanes, the routes are nudged
//!   again with only the stub out of each pin's buffer held there: the rest
//!   of the segment moves like any other, with a jog at the stub's end.
//! - A middle segment between two turns the same way (a Z or an S) wants the
//!   middle of its channel; any other segment wants to stay where it is.
//! - Two segments that run beside each other in one channel keep their order
//!   and stand a lane apart; two on one line take the order where their
//!   routes part says ([`crate::order`]). Consecutive segments of one route
//!   keep their order, so no run of a route turns back on itself.
//!
//! The placement is solved with [`crate::vpsc`]. A segment never leaves its
//! channel: where a channel is too narrow for its lanes, they stand closer
//! than a lane, and the routes crowded so are counted, to choose between
//! holding a pin's whole segment and holding only its stub.

use crate::grid::{Buffer, SAME, close, sign, stub_end};
use crate::order;
use crate::search::simplified;
use crate::vpsc::{self, Constraint, Var};
use crate::{End, Point, Scene};

/// A weight that makes a variable stay where it is.
const FIXED: f64 = 1e6;

/// The axis a pass of nudging places segments along.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Axis {
    /// Segments that run down, placed along x.
    X,
    /// Segments that run across, placed along y.
    Y,
}

impl Axis {
    /// A point's position on this axis.
    fn of(self, p: Point) -> f64 {
        match self {
            Axis::X => p.x,
            Axis::Y => p.y,
        }
    }
    /// A point's position on the other axis, along the segments placed on this one.
    fn along(self, p: Point) -> f64 {
        match self {
            Axis::X => p.y,
            Axis::Y => p.x,
        }
    }
    /// Move a point to a position on this axis.
    fn set(self, p: &mut Point, value: f64) {
        match self {
            Axis::X => p.x = value,
            Axis::Y => p.y = value,
        }
    }
    /// A buffer's low and high sides across this axis, and along it.
    fn sides(self, b: &Buffer) -> (f64, f64, f64, f64) {
        match self {
            Axis::X => (b.left, b.right, b.top, b.bottom),
            Axis::Y => (b.top, b.bottom, b.left, b.right),
        }
    }
}

/// One segment that runs along the other axis, placed on this one.
#[derive(Clone, Copy)]
struct Segment {
    route: usize,
    index: usize,
    at: f64,
    low: f64,
    high: f64,
    fixed: bool,
    /// Whether the route turns the same way at both ends of the segment.
    zigzag: bool,
    /// Which way the route goes from each end, -1, 0 or 1 across this axis,
    /// summed over both ends.
    turns: i32,
}

/// Union-find over segments.
struct Groups(Vec<usize>);

impl Groups {
    /// The root of a segment's group, with every segment on the way pointed straight at it.
    fn find(&mut self, a: usize) -> usize {
        let mut root = a;
        while self.0[root] != root {
            root = self.0[root];
        }
        let mut node = a;
        while self.0[node] != root {
            let next = self.0[node];
            self.0[node] = root;
            node = next;
        }
        root
    }
    /// Put two segments' groups into one.
    fn join(&mut self, a: usize, b: usize) {
        let (a, b) = (self.find(a), self.find(b));
        // The lower index roots the group, so groups do not depend on order.
        let (low, high) = (a.min(b), a.max(b));
        self.0[high] = low;
    }
}

/// Nudge every route, x then y; where that crowds routes, nudge them again
/// with each pin held only by its stub, and keep the routes crowded less.
pub(crate) fn nudge(
    scene: &Scene,
    buffers: &[Buffer],
    found: &[Option<Vec<Point>>],
) -> Vec<Option<Vec<Point>>> {
    let (mut routes, crowded) = nudged(scene, buffers, found.to_vec());
    if crowded > 0 {
        let cut = found
            .iter()
            .zip(&scene.connectors)
            .map(|(route, ends)| route.as_ref().map(|points| stubbed(buffers, points, *ends)))
            .collect();
        let (again, still) = nudged(scene, buffers, cut);
        if still < crowded {
            routes = again;
        }
    }
    routes
        .into_iter()
        .map(|route| route.map(simplified))
        .collect()
}

/// The routes nudged, x then y, and how many of them are crowded: a segment
/// of each stands closer to another than a lane, because its channel is too
/// narrow for its lanes.
fn nudged(
    scene: &Scene,
    buffers: &[Buffer],
    mut routes: Vec<Option<Vec<Point>>>,
) -> (Vec<Option<Vec<Point>>>, usize) {
    let mut crowded = vec![false; routes.len()];
    for axis in [Axis::X, Axis::Y] {
        nudge_axis(scene, buffers, &mut routes, &mut crowded, axis);
    }
    let count = crowded.iter().filter(|&&crowded| crowded).count();
    (routes, count)
}

/// A route with its first and last segments cut where they leave their
/// pin's buffer, when that lies inside them: the end of the stub stands
/// twice, so that nudging the rest of the segment opens a jog there.
fn stubbed(buffers: &[Buffer], points: &[Point], (tail, head): (End, End)) -> Vec<Point> {
    let cut = |end: End, pin: Point, next: Point| match end {
        End::Pin {
            obstacle, leaves, ..
        } => {
            let stub = stub_end(&buffers[obstacle], pin, leaves);
            let inside = |a: f64, b: f64, c: f64| {
                (a - c).abs() > SAME && (b - c).abs() > SAME && (a < c) == (c < b)
            };
            let on = (stub.x - pin.x).abs() < SAME
                && (next.x - pin.x).abs() < SAME
                && inside(pin.y, next.y, stub.y)
                || (stub.y - pin.y).abs() < SAME
                    && (next.y - pin.y).abs() < SAME
                    && inside(pin.x, next.x, stub.x);
            on.then_some(stub)
        }
        End::Free { .. } => None,
    };
    let mut out = points.to_vec();
    let last = out.len() - 1;
    if last >= 1
        && let Some(stub) = cut(head, out[last], out[last - 1])
    {
        out.splice(last..last, [stub, stub]);
    }
    if out.len() >= 2
        && let Some(stub) = cut(tail, out[0], out[1])
    {
        out.splice(1..1, [stub, stub]);
    }
    out
}

/// Every segment of every route that runs along the other axis.
fn segments_of(routes: &[Option<Vec<Point>>], axis: Axis) -> Vec<Segment> {
    routes
        .iter()
        .enumerate()
        .filter_map(|(route, points)| Some((route, points.as_ref()?)))
        .flat_map(|(route, points)| {
            (0..points.len().saturating_sub(1))
                .filter_map(move |index| segment_of(points, route, index, axis))
        })
        .collect()
}

/// The segment of a route from one of its points to the next, if it runs
/// along the other axis.
fn segment_of(points: &[Point], route: usize, index: usize, axis: Axis) -> Option<Segment> {
    let (a, b) = (points[index], points[index + 1]);
    if (axis.of(a) - axis.of(b)).abs() > SAME || (axis.along(a) - axis.along(b)).abs() < SAME {
        return None;
    }
    let at = axis.of(a);
    let before = (index > 0).then(|| sign(at - axis.of(points[index - 1])));
    let after = points.get(index + 2).map(|p| sign(axis.of(*p) - at));
    let zigzag = matches!((before, after), (Some(x), Some(y)) if x == y && x != 0);
    // Which way the route goes at the low end and at the high end.
    let (low_end, high_end) = if axis.along(a) < axis.along(b) {
        (before.map(|s| -s), after)
    } else {
        (after, before.map(|s| -s))
    };
    Some(Segment {
        route,
        index,
        at,
        low: axis.along(a).min(axis.along(b)),
        high: axis.along(a).max(axis.along(b)),
        fixed: index == 0 || index == points.len().saturating_sub(2),
        zigzag,
        turns: low_end.unwrap_or(0) + high_end.unwrap_or(0),
    })
}

/// The free span across a segment's axis: between the nearest buffers on
/// either side that it runs beside.
fn channel_of(buffers: &[Buffer], axis: Axis, segment: &Segment) -> (f64, f64) {
    let (mut low, mut high) = (f64::NEG_INFINITY, f64::INFINITY);
    for buffer in buffers {
        let (near, far, from, to) = axis.sides(buffer);
        if !(segment.low < to - SAME && segment.high > from + SAME) {
            continue;
        }
        if far <= segment.at + SAME {
            low = low.max(far);
        } else if near >= segment.at - SAME {
            high = high.min(near);
        }
    }
    (low, high)
}

/// Whether two ends are the same end.
fn same_end(a: &End, b: &End) -> bool {
    match (a, b) {
        (
            End::Pin {
                obstacle: o1,
                at: p1,
                leaves: d1,
            },
            End::Pin {
                obstacle: o2,
                at: p2,
                leaves: d2,
            },
        ) => o1 == o2 && d1 == d2 && close(*p1, *p2),
        (End::Free { at: p1 }, End::Free { at: p2 }) => close(*p1, *p2),
        _ => false,
    }
}

/// One route walked from one of its ends: which route, its points, and
/// whether the walk starts at its head.
#[derive(Clone, Copy)]
struct Walked<'r> {
    route: usize,
    points: &'r [Point],
    from_head: bool,
}

/// The segment of a route that runs from one of its points to the next, by
/// the index of its first point.
fn segment_index(segments: &[Segment], route: usize, index: usize) -> Option<usize> {
    segments
        .iter()
        .position(|s| s.route == route && s.index == index)
}

/// Join the segments of routes that share an end and run together from it.
fn join_shared(
    scene: &Scene,
    routes: &[Option<Vec<Point>>],
    segments: &[Segment],
    groups: &mut Groups,
) {
    let n = scene.connectors.len();
    for one in 0..n {
        for other in one + 1..n {
            join_pair(scene, routes, segments, groups, (one, other));
        }
    }
}

/// Join the segments of two routes from each end they share.
fn join_pair(
    scene: &Scene,
    routes: &[Option<Vec<Point>>],
    segments: &[Segment],
    groups: &mut Groups,
    (one, other): (usize, usize),
) {
    let (Some(a), Some(b)) = (&routes[one], &routes[other]) else {
        return;
    };
    let end_of = |route: usize, from_head: bool| {
        let (tail, head) = scene.connectors[route];
        if from_head { head } else { tail }
    };
    for (from_a, from_b) in [(false, false), (false, true), (true, false), (true, true)] {
        if same_end(&end_of(one, from_a), &end_of(other, from_b)) {
            let walked_a = Walked {
                route: one,
                points: a,
                from_head: from_a,
            };
            let walked_b = Walked {
                route: other,
                points: b,
                from_head: from_b,
            };
            join_together(segments, groups, walked_a, walked_b);
        }
    }
}

/// Join the segments two routes run together on from a shared end, until
/// they part.
fn join_together(segments: &[Segment], groups: &mut Groups, a: Walked<'_>, b: Walked<'_>) {
    let walk_a: Vec<usize> = walk(a.points.len(), a.from_head);
    let walk_b: Vec<usize> = walk(b.points.len(), b.from_head);
    for step in 0..walk_a.len().min(walk_b.len()).saturating_sub(1) {
        let (a0, a1) = (a.points[walk_a[step]], a.points[walk_a[step + 1]]);
        let (b0, b1) = (b.points[walk_b[step]], b.points[walk_b[step + 1]]);
        let together = close(a0, b0)
            && sign(a1.x - a0.x) == sign(b1.x - b0.x)
            && sign(a1.y - a0.y) == sign(b1.y - b0.y);
        if !together {
            break;
        }
        let index_a = walk_a[step].min(walk_a[step + 1]);
        let index_b = walk_b[step].min(walk_b[step + 1]);
        let shared = segment_index(segments, a.route, index_a)
            .zip(segment_index(segments, b.route, index_b));
        if let Some((sa, sb)) = shared {
            groups.join(sa, sb);
        }
        if !close(a1, b1) {
            break;
        }
    }
}

/// A route's point indices, from its tail or from its head.
fn walk(len: usize, from_head: bool) -> Vec<usize> {
    if from_head {
        (0..len).rev().collect()
    } else {
        (0..len).collect()
    }
}

/// The stretch along the axis that two segments share, when they share more than a touch.
fn overlap(a: &Segment, b: &Segment) -> Option<(f64, f64)> {
    let (low, high) = (a.low.max(b.low), a.high.min(b.high));
    (high - low > SAME).then_some((low, high))
}

/// Whether a buffer stands between two positions over a span along the axis.
fn walled(buffers: &[Buffer], axis: Axis, from: f64, to: f64, span: (f64, f64)) -> bool {
    let (low, high) = (from.min(to), from.max(to));
    buffers.iter().any(|buffer| {
        let (near, far, start, end) = axis.sides(buffer);
        span.0 < end - SAME && span.1 > start + SAME && near >= low - SAME && far <= high + SAME
    })
}

/// The orders of segments on one line, surest first, each kept only where
/// it does not contradict the orders kept before it. Routes that cross
/// whichever way they stand can give orders round a cycle, which no
/// placement satisfies.
fn acyclic(count: usize, mut orders: Vec<(u8, usize, usize)>) -> Vec<(usize, usize)> {
    orders.sort_by_key(|&(rank, _, _)| rank);
    let mut after: Vec<Vec<usize>> = vec![Vec::new(); count];
    let mut kept = Vec::new();
    for (_, left, right) in orders {
        // Keeping left before right closes a cycle when right already comes
        // before left.
        let mut seen = vec![false; count];
        let mut stack = vec![right];
        let mut cycle = false;
        while let Some(node) = stack.pop() {
            if node == left {
                cycle = true;
                break;
            }
            if !std::mem::replace(&mut seen[node], true) {
                stack.extend(&after[node]);
            }
        }
        if !cycle {
            after[left].push(right);
            kept.push((left, right));
        }
    }
    kept
}

/// Consecutive segments of one route keep their order, so no run of the
/// route turns back on itself.
fn keep_route_order(
    routes: &[Option<Vec<Point>>],
    segments: &[Segment],
    var_of: &[usize],
    fixed: &[bool],
    axis: Axis,
    constraints: &mut Vec<Constraint>,
) {
    for (route, points) in routes.iter().enumerate() {
        let Some(points) = points else { continue };
        let mine: Vec<usize> = (0..segments.len())
            .filter(|&s| segments[s].route == route)
            .collect();
        for pair in mine.windows(2) {
            let (s1, s2) = (pair[0], pair[1]);
            if segments[s2].index != segments[s1].index + 2 {
                continue;
            }
            let (v1, v2) = (var_of[s1], var_of[s2]);
            if v1 == v2 || (fixed[v1] && fixed[v2]) {
                continue;
            }
            let direction =
                axis.of(points[segments[s2].index]) - axis.of(points[segments[s1].index]);
            match sign(direction) {
                1 => constraints.push(Constraint {
                    left: v1,
                    right: v2,
                    gap: 0.0,
                }),
                -1 => constraints.push(Constraint {
                    left: v2,
                    right: v1,
                    gap: 0.0,
                }),
                _ => {}
            }
        }
    }
}

/// Each movable variable's channel, as a fixed wall variable on either side
/// that it may not pass.
fn wall_in(
    channels: &[(f64, f64)],
    fixed: &[bool],
    vars: &mut Vec<Var>,
    constraints: &mut Vec<Constraint>,
) {
    for (v, &(low, high)) in channels.iter().enumerate() {
        if fixed[v] {
            continue;
        }
        if low.is_finite() {
            vars.push(Var {
                desired: low,
                weight: FIXED,
            });
            constraints.push(Constraint {
                left: vars.len() - 1,
                right: v,
                gap: 0.0,
            });
        }
        if high.is_finite() {
            vars.push(Var {
                desired: high,
                weight: FIXED,
            });
            constraints.push(Constraint {
                left: v,
                right: vars.len() - 1,
                gap: 0.0,
            });
        }
    }
}

/// The joined groups of one axis's segments, one solver variable each: the
/// segments it holds, where it stands, whether a pin holds it there, and the
/// channel it may move in.
struct Variables {
    /// Each segment's variable.
    var_of: Vec<usize>,
    /// Each variable's segments, in the order of their first segment.
    members: Vec<Vec<usize>>,
    at: Vec<f64>,
    fixed: Vec<bool>,
    channels: Vec<(f64, f64)>,
}

/// How two variables that run beside each other are kept apart: by where they
/// stand, or, standing on one line, by an order with how sure it is.
enum Apart {
    Beside(Constraint),
    OnOneLine((u8, usize, usize)),
}

impl Variables {
    /// One variable per group, in the order of its first segment.
    fn of(segments: &[Segment], groups: &mut Groups, buffers: &[Buffer], axis: Axis) -> Variables {
        let roots: Vec<usize> = (0..segments.len()).map(|s| groups.find(s)).collect();
        let mut var_of = vec![usize::MAX; segments.len()];
        let mut members: Vec<Vec<usize>> = Vec::new();
        for (s, &root) in roots.iter().enumerate() {
            if var_of[root] == usize::MAX {
                var_of[root] = members.len();
                members.push(Vec::new());
            }
            var_of[s] = var_of[root];
            members[var_of[root]].push(s);
        }
        let at = members.iter().map(|m| segments[m[0]].at).collect();
        let fixed = members
            .iter()
            .map(|m| m.iter().any(|&s| segments[s].fixed))
            .collect();
        let channels = members
            .iter()
            .map(|m| {
                m.iter()
                    .map(|&s| channel_of(buffers, axis, &segments[s]))
                    .fold((f64::NEG_INFINITY, f64::INFINITY), |(l, h), (a, b)| {
                        (l.max(a), h.min(b))
                    })
            })
            .collect();
        Variables {
            var_of,
            members,
            at,
            fixed,
            channels,
        }
    }

    /// Where each variable wants to stand, and how hard: a pin's stays put, a
    /// lone zigzag wants the middle of its channel, any other where it is.
    fn wanted(&self, segments: &[Segment]) -> Vec<Var> {
        (0..self.members.len())
            .map(|v| {
                let (low, high) = self.channels[v];
                let centred = !self.fixed[v]
                    && self.members[v].len() == 1
                    && segments[self.members[v][0]].zigzag
                    && low.is_finite()
                    && high.is_finite();
                Var {
                    desired: if centred {
                        f64::midpoint(low, high)
                    } else {
                        self.at[v]
                    },
                    weight: if self.fixed[v] { FIXED } else { 1.0 },
                }
            })
            .collect()
    }

    /// The first two segments of two variables that run beside each other,
    /// and the span they share along the axis.
    fn beside(
        &self,
        segments: &[Segment],
        a: usize,
        b: usize,
    ) -> Option<(usize, usize, (f64, f64))> {
        self.members[a].iter().find_map(|&sa| {
            self.members[b]
                .iter()
                .find_map(|&sb| overlap(&segments[sa], &segments[sb]).map(|span| (sa, sb, span)))
        })
    }
}

/// The order of two variables on one line, by a segment of each, with how
/// sure it is: where their routes part, else fewer turns towards the low side,
/// then input order, a guess ranked last.
fn line_order(
    routes: &[Option<Vec<Point>>],
    (one, a): (&Segment, usize),
    (other, b): (&Segment, usize),
) -> (u8, usize, usize) {
    let parted = match (&routes[one.route], &routes[other.route]) {
        (Some(pa), Some(pb)) => order::side(pa, one.index, pb, other.index),
        _ => None,
    };
    let (a_first, rank) = match parted {
        Some((side, sureness)) => (side < 0, sureness as u8),
        None => (one.turns <= other.turns, 3),
    };
    let (left, right) = if a_first { (a, b) } else { (b, a) };
    (rank, left, right)
}

/// One axis of the nudge: the scene, its buffers and the axis's segments.
struct Nudging<'n> {
    scene: &'n Scene,
    buffers: &'n [Buffer],
    axis: Axis,
    segments: Vec<Segment>,
}

impl Nudging<'_> {
    /// How two variables are kept apart, or nothing when both are held, they
    /// do not run beside each other, or a buffer stands between them.
    fn apart(
        &self,
        routes: &[Option<Vec<Point>>],
        vars: &Variables,
        (a, b): (usize, usize),
    ) -> Option<Apart> {
        if vars.fixed[a] && vars.fixed[b] {
            return None;
        }
        let (sa, sb, span) = vars.beside(&self.segments, a, b)?;
        if walled(self.buffers, self.axis, vars.at[a], vars.at[b], span) {
            return None;
        }
        if (vars.at[a] - vars.at[b]).abs() > SAME {
            let (left, right) = if vars.at[a] < vars.at[b] {
                (a, b)
            } else {
                (b, a)
            };
            return Some(Apart::Beside(Constraint {
                left,
                right,
                gap: self.scene.params.lane,
            }));
        }
        let (one, other) = (&self.segments[sa], &self.segments[sb]);
        Some(Apart::OnOneLine(line_order(routes, (one, a), (other, b))))
    }

    /// The separation of every two variables beside each other, then the
    /// orders of those on one line that close no cycle, a lane apart.
    fn separations(&self, routes: &[Option<Vec<Point>>], vars: &Variables) -> Vec<Constraint> {
        let count = vars.members.len();
        let mut constraints = Vec::new();
        // Orders of segments on one line, with how sure each is.
        let mut on_one_line: Vec<(u8, usize, usize)> = Vec::new();
        for a in 0..count {
            for b in a + 1..count {
                match self.apart(routes, vars, (a, b)) {
                    Some(Apart::Beside(constraint)) => constraints.push(constraint),
                    Some(Apart::OnOneLine(order)) => on_one_line.push(order),
                    None => {}
                }
            }
        }
        let lane = self.scene.params.lane;
        constraints.extend(
            acyclic(count, on_one_line)
                .into_iter()
                .map(|(left, right)| Constraint {
                    left,
                    right,
                    gap: lane,
                }),
        );
        constraints
    }

    /// Stand each moved segment where the solver placed its variable, held to
    /// its channel, and mark the routes the solver crowded past a wall.
    fn stand(
        &self,
        vars: &Variables,
        placed: &[f64],
        routes: &mut [Option<Vec<Point>>],
        crowded: &mut [bool],
    ) {
        for v in (0..vars.members.len()).filter(|&v| !vars.fixed[v]) {
            let (low, high) = vars.channels[v];
            let value = placed[v].max(low).min(high);
            for &s in &vars.members[v] {
                let segment = self.segments[s];
                // The solver stood it past its channel's wall, which only too
                // many lanes for the channel make it do.
                crowded[segment.route] |= (value - placed[v]).abs() > SAME;
                if let Some(points) = routes[segment.route].as_mut() {
                    self.axis.set(&mut points[segment.index], value);
                    self.axis.set(&mut points[segment.index + 1], value);
                }
            }
        }
    }
}

/// Nudge the segments that run along the other axis apart on this one:
/// one solver variable per joined group of segments, the separation and
/// order constraints between them, and the walls of each one's channel.
fn nudge_axis(
    scene: &Scene,
    buffers: &[Buffer],
    routes: &mut [Option<Vec<Point>>],
    crowded: &mut [bool],
    axis: Axis,
) {
    let segments = segments_of(routes, axis);
    if segments.is_empty() {
        return;
    }
    let mut groups = Groups((0..segments.len()).collect());
    join_shared(scene, routes, &segments, &mut groups);
    let vars = Variables::of(&segments, &mut groups, buffers, axis);
    let nudging = Nudging {
        scene,
        buffers,
        axis,
        segments,
    };
    let mut wanted = vars.wanted(&nudging.segments);
    let mut constraints = nudging.separations(routes, &vars);
    keep_route_order(
        routes,
        &nudging.segments,
        &vars.var_of,
        &vars.fixed,
        axis,
        &mut constraints,
    );
    wall_in(&vars.channels, &vars.fixed, &mut wanted, &mut constraints);
    let placed = vpsc::solve(&wanted, &constraints);
    nudging.stand(&vars, &placed, routes, crowded);
}
