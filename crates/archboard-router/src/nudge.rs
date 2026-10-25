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

use crate::grid::{Buffer, SAME, sign, stub_end};
use crate::joining::{Groups, join_shared};
use crate::order;
use crate::search::simplified;
use crate::segments::{Axis, Segment, channel_of, overlap, segments_of, walled};
use crate::vpsc::{self, Constraint, Var};
use crate::{End, Point, Scene};

/// A weight that makes a variable stay where it is.
const FIXED: f64 = 1e6;

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
