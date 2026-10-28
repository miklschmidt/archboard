//! Connect through shelf gutters and explicit frame entrances before emission.

use super::{
    geometry::{clean, crosses_box, length},
    model::{Child, Model},
    ports::{center, port},
    shape::{CLEAR, Shape},
    topology::Topology,
};
use crate::blocks::assembly::PlacedLine;
use crate::geometry::{Point, Side, inflate};
use std::cell::Cell;

struct Channels<'a, 'graph> {
    model: &'a Model<'graph>,
    topology: &'a Topology,
    edge: usize,
    shape: &'a Shape,
    windows: Cell<usize>,
    limit: usize,
}

pub(super) fn route(
    model: &Model<'_>,
    topology: &Topology,
    edge: usize,
    shape: &Shape,
    limit: usize,
) -> (Option<PlacedLine>, usize) {
    let channels = Channels {
        model,
        topology,
        edge,
        shape,
        windows: Cell::new(0),
        limit,
    };
    let line = channels.route();
    (line, channels.windows.get())
}

fn cost(path: &[Point]) -> f64 {
    length(path) + 60.0 * path.len().saturating_sub(2) as f64
}

impl Channels<'_, '_> {
    fn route(&self) -> Option<PlacedLine> {
        let (model, shape, edge) = (self.model, self.shape, self.edge);
        let (from, to) = model.ends[edge];
        let target = shape.endpoints[&to];
        let label = shape.labels.get(&edge).copied();
        let mut paths = Vec::new();
        for prefix in super::channel::tails(model, edge, shape) {
            for above in [true, false] {
                let Some(tail) = self.leave_cell(prefix.clone(), from, above) else {
                    continue;
                };
                let Some(tail) =
                    self.outward(tail, &self.topology.routes[edge].outward, center(target))
                else {
                    continue;
                };
                paths.extend(self.arrivals(&tail));
            }
        }
        paths
            .into_iter()
            .enumerate()
            .min_by(|(a, p), (b, q)| cost(p).total_cmp(&cost(q)).then(a.cmp(b)))
            .map(|(_, points)| PlacedLine {
                id: model.edges[edge].id.clone(),
                points,
                label,
            })
    }

    fn arrivals(&self, tail: &[Point]) -> Vec<Vec<Point>> {
        let (model, shape, edge) = (self.model, self.shape, self.edge);
        let (from, to) = model.ends[edge];
        let source = shape.endpoints[&from];
        let mut paths = Vec::new();
        for side in [Side::Top, Side::Bottom, Side::Left, Side::Right] {
            let Some(end) = port(
                model,
                edge,
                false,
                side,
                shape,
                *tail.last().expect("a departure"),
            ) else {
                continue;
            };
            for above in [true, false] {
                let Some(head) = self.leave_cell(vec![end.attachment, end.approach], to, above)
                else {
                    continue;
                };
                let inward: Vec<_> = self.topology.routes[edge]
                    .inward
                    .iter()
                    .rev()
                    .copied()
                    .collect();
                let Some(head) = self.outward(head, &inward, center(source)) else {
                    continue;
                };
                let scope = self.topology.routes[edge].scope;
                let Some(middle) = self.join(
                    scope,
                    *tail.last().expect("a departure"),
                    *head.last().expect("an arrival"),
                ) else {
                    continue;
                };
                let points = clean(
                    tail.iter()
                        .copied()
                        .chain(middle)
                        .chain(head.into_iter().rev())
                        .collect(),
                );
                if super::channel::feasible(
                    model,
                    self.topology,
                    edge,
                    shape,
                    &points,
                    shape.scopes[&scope].bounds,
                ) {
                    paths.push(points);
                }
            }
        }
        paths
    }

    fn clear(&self, path: &[Point]) -> bool {
        let (model, shape, edge) = (self.model, self.shape, self.edge);
        super::ports::reserved_fragment(model, edge, shape, path)
            && shape.endpoints.iter().all(|(&id, &at)| {
                !crosses_box(
                    path,
                    if model.ends[edge].0 == id || model.ends[edge].1 == id {
                        at
                    } else {
                        inflate(at, 16.0)
                    },
                )
            })
            && shape
                .labels
                .iter()
                .all(|(&id, &at)| id == edge || !crosses_box(path, inflate(at, 12.0)))
            && shape
                .drawing
                .regions
                .iter()
                .all(|r| !crosses_box(path, inflate(r.caption, 16.0)))
            && shape
                .drawing
                .edges
                .iter()
                .all(|line| super::channel::shared_fragment(model, edge, path, line))
    }

    fn leave_cell(&self, mut path: Vec<Point>, endpoint: usize, above: bool) -> Option<Vec<Point>> {
        let cell = self.shape.cells[&endpoint];
        let outside = inflate(cell, 16.0);
        let last = *path.last()?;
        if last.x <= outside.x + 1e-6
            || last.x >= outside.x + outside.width - 1e-6
            || last.y <= outside.y + 1e-6
            || last.y >= outside.y + outside.height - 1e-6
        {
            return self.clear(&path).then_some(path);
        }
        let scope = &self.model.scopes[self.model.endpoints[endpoint].scope];
        let gap = if scope.header == Some(endpoint) {
            16.0
        } else {
            24.0
        };
        let y = if above {
            cell.y - gap
        } else {
            cell.y + cell.height + gap
        };
        path.push(Point { x: last.x, y });
        let path = clean(path);
        self.clear(&path).then_some(path)
    }

    fn outward(&self, mut path: Vec<Point>, scopes: &[usize], peer: Point) -> Option<Vec<Point>> {
        for &scope in scopes {
            let bounds = self.shape.scopes[&scope].bounds;
            let at = *path.last()?;
            if at.x < bounds.x
                || at.x > bounds.x + bounds.width
                || at.y < bounds.y
                || at.y > bounds.y + bounds.height
            {
                continue;
            }
            path.extend(self.exit(scope, at, peer)?);
            path = clean(path);
        }
        Some(path)
    }

    fn exit(&self, scope: usize, at: Point, peer: Point) -> Option<Vec<Point>> {
        let bounds = self.shape.scopes[&scope].bounds;
        let right = peer.x >= bounds.x + bounds.width / 2.0;
        let mut choices = Vec::new();
        for right in [right, !right] {
            let x = if right {
                bounds.x + bounds.width + CLEAR / 2.0
            } else {
                bounds.x - CLEAR / 2.0
            };
            for y in [
                at.y.clamp(bounds.y + CLEAR, bounds.y + bounds.height - CLEAR),
                bounds.y + CLEAR,
                bounds.y + bounds.height - CLEAR,
            ] {
                if let Some(joined) = self.join(scope, at, Point { x, y }) {
                    choices.push(joined);
                }
            }
        }
        choices
            .into_iter()
            .min_by(|a, b| cost(a).total_cmp(&cost(b)))
    }

    fn templates(
        &self,
        bounds: crate::geometry::Rect,
        obstacles: &[crate::geometry::Rect],
        a: Point,
        b: Point,
    ) -> Vec<Vec<Point>> {
        let mut xs = vec![a.x, b.x, bounds.x + 8.0, bounds.x + bounds.width - 8.0];
        let mut ys = vec![a.y, b.y, bounds.y + 8.0, bounds.y + bounds.height - 8.0];
        for at in obstacles {
            for gap in [16.0, 32.0, 48.0] {
                xs.extend([at.x - gap, at.x + at.width + gap]);
                ys.extend([at.y - gap, at.y + at.height + gap]);
            }
        }
        xs.sort_by(f64::total_cmp);
        xs.dedup();
        ys.sort_by(f64::total_cmp);
        ys.dedup();

        let mut paths = Vec::new();
        for x in &xs {
            paths.push(vec![a, Point { x: *x, y: a.y }, Point { x: *x, y: b.y }, b]);
        }
        for y in &ys {
            paths.push(vec![a, Point { x: a.x, y: *y }, Point { x: b.x, y: *y }, b]);
        }
        paths.extend(self.perimeter(bounds, obstacles, &ys, a, b));
        paths
    }

    fn perimeter(
        &self,
        bounds: crate::geometry::Rect,
        obstacles: &[crate::geometry::Rect],
        ys: &[f64],
        a: Point,
        b: Point,
    ) -> Vec<Vec<Point>> {
        let valid = |p: &[Point]| !obstacles.iter().any(|&at| crosses_box(p, at)) && self.clear(p);
        let mut paths = Vec::new();
        for outer in [bounds.x + 8.0, bounds.x + bounds.width - 8.0] {
            for &one in ys {
                let first = [a, Point { x: a.x, y: one }, Point { x: outer, y: one }];
                if !valid(&first) {
                    continue;
                }
                for &two in ys {
                    paths.push(vec![
                        a,
                        Point { x: a.x, y: one },
                        Point { x: outer, y: one },
                        Point { x: outer, y: two },
                        Point { x: b.x, y: two },
                        b,
                    ]);
                }
            }
        }
        paths
    }

    fn join(&self, scope: usize, a: Point, b: Point) -> Option<Vec<Point>> {
        let bounds = self.shape.scopes[&scope].bounds;
        let obstacles: Vec<_> = self.model.scopes[scope]
            .children
            .iter()
            .map(|child| match child {
                Child::Endpoint(id) => self.shape.cells[id],
                Child::Scope(id) => self.shape.scopes[id].bounds,
            })
            .collect();
        let valid = |p: &[Point]| !obstacles.iter().any(|&at| crosses_box(p, at)) && self.clear(p);
        let paths = self.templates(bounds, &obstacles, a, b);
        let mut ordered: Vec<_> = paths
            .into_iter()
            .map(clean)
            .enumerate()
            .map(|(index, path)| (cost(&path), index, path))
            .collect();
        ordered.sort_by(|a, b| a.0.total_cmp(&b.0).then(a.1.cmp(&b.1)));
        ordered
            .into_iter()
            .map(|(_, _, path)| path)
            .find(|path| valid(path))
            .or_else(|| {
                if self.windows.get() == self.limit {
                    return None;
                }
                self.windows.set(self.windows.get() + 1);
                super::fallback::local(self.model, self.edge, self.shape, scope, a, b)
                    .filter(|path| valid(path))
            })
    }
}
