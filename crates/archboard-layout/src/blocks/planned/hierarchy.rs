//! Connect through shelf gutters and explicit frame entrances before emission.

use super::{
    geometry::{clean, crosses_box, length},
    model::{Child, Model},
    ports::{center, port},
    shape::Shape,
    topology::Topology,
};
use crate::blocks::assembly::PlacedLine;
use crate::geometry::{Point, Side, inflate};
use std::cell::{Cell, RefCell};

use rustc_hash::FxHashMap;

struct Channels<'a, 'graph> {
    model: &'a Model<'graph>,
    topology: &'a Topology,
    edge: usize,
    shape: &'a Shape,
    windows: Cell<usize>,
    limit: usize,
    segments: RefCell<FxHashMap<[u64; 4], bool>>,
}

fn cost(path: &[Point]) -> f64 {
    length(path) + 60.0 * path.len().saturating_sub(2) as f64
}

impl Channels<'_, '_> {
    fn candidates(&self) -> Vec<PlacedLine> {
        let (model, shape, edge) = (self.model, self.shape, self.edge);
        let (_, to) = model.ends[edge];
        let target = shape.endpoints[&to];
        let label = shape.labels.get(&edge).copied();
        let mut paths = Vec::new();
        let mut tails = super::channel::tails(model, edge, shape);
        tails.sort_by_cached_key(|path| {
            (cost(path) + length(&[*path.last().expect("a source approach"), center(target)]))
                .to_bits()
        });
        // Ports already provide straight approaches outside endpoint clearance.
        for tail in tails.into_iter().filter(|path| self.clear(path)) {
            for tail in self.outward(tail, &self.topology.routes[edge].outward, center(target)) {
                paths.extend(self.arrivals(&tail));
            }
        }
        paths.sort_by_cached_key(|path| cost(path).to_bits());
        paths.dedup();
        paths
            .into_iter()
            .map(|points| PlacedLine {
                id: model.edges[edge].id.clone(),
                points,
                label,
            })
            .collect()
    }

    fn arrivals(&self, tail: &[Point]) -> Vec<Vec<Point>> {
        let (model, shape, edge) = (self.model, self.shape, self.edge);
        let (from, _) = model.ends[edge];
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
            let head = vec![end.attachment, end.approach];
            if !self.clear(&head) {
                continue;
            }
            let inward: Vec<_> = self.topology.routes[edge]
                .inward
                .iter()
                .rev()
                .copied()
                .collect();
            for head in self.outward(head, &inward, center(source)) {
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
        // Clearance is the conjunction of each segment's obstacle and sharing checks.
        // The borrowed placement and route set stay fixed for this entire search.
        path.windows(2).all(|pair| {
            let key = [
                pair[0].x.to_bits(),
                pair[0].y.to_bits(),
                pair[1].x.to_bits(),
                pair[1].y.to_bits(),
            ];
            *self
                .segments
                .borrow_mut()
                .entry(key)
                .or_insert_with(|| self.clear_segment(pair))
        })
    }

    fn clear_segment(&self, path: &[Point]) -> bool {
        let (model, shape, edge) = (self.model, self.shape, self.edge);
        shape.endpoints.iter().all(|(&id, &at)| {
            !crosses_box(
                path,
                if model.ends[edge].0 == id || model.ends[edge].1 == id {
                    at
                } else {
                    inflate(at, 16.0)
                },
            )
        }) && shape
            .labels
            .iter()
            .all(|(&id, &at)| id == edge || !crosses_box(path, inflate(at, 4.0)))
            && shape
                .drawing
                .regions
                .iter()
                .all(|r| !crosses_box(path, inflate(r.caption, 16.0)))
            && shape
                .routes
                .iter()
                .all(|line| super::channel::shared_fragment(model, edge, path, line))
    }

    fn outward(&self, path: Vec<Point>, scopes: &[usize], peer: Point) -> Vec<Vec<Point>> {
        let mut beam = vec![path];
        for &scope in scopes {
            let bounds = self.shape.scopes[&scope].bounds;
            let mut next = Vec::new();
            for path in beam {
                let at = *path.last().expect("an approach");
                if at.x < bounds.x
                    || at.x > bounds.x + bounds.width
                    || at.y < bounds.y
                    || at.y > bounds.y + bounds.height
                {
                    next.push(path);
                    continue;
                }
                for exit in self.exits(scope, at, peer) {
                    next.push(clean(path.iter().copied().chain(exit).collect()));
                }
            }
            next.sort_by_cached_key(|path| {
                (cost(path) + length(&[*path.last().expect("a scope exit"), peer])).to_bits()
            });
            next.dedup();
            next.truncate(4);
            beam = next;
        }
        beam
    }

    fn exits(&self, scope: usize, at: Point, peer: Point) -> Vec<Vec<Point>> {
        let bounds = self.shape.scopes[&scope].bounds;
        let mut choices = Vec::new();
        for right in [
            peer.x >= bounds.x + bounds.width / 2.0,
            peer.x < bounds.x + bounds.width / 2.0,
        ] {
            let x = if right {
                bounds.x + bounds.width + 16.0
            } else {
                bounds.x - 16.0
            };
            choices.extend(
                [
                    at.y.clamp(bounds.y + 32.0, bounds.y + bounds.height - 32.0),
                    bounds.y + 32.0,
                    bounds.y + bounds.height - 32.0,
                ]
                .into_iter()
                .filter_map(|y| self.join(scope, at, Point { x, y })),
            );
        }
        for bottom in [
            peer.y >= bounds.y + bounds.height / 2.0,
            peer.y < bounds.y + bounds.height / 2.0,
        ] {
            let y = if bottom {
                bounds.y + bounds.height + 16.0
            } else {
                bounds.y - 16.0
            };
            choices.extend(
                [
                    at.x.clamp(bounds.x + 32.0, bounds.x + bounds.width - 32.0),
                    bounds.x + 32.0,
                    bounds.x + bounds.width - 32.0,
                ]
                .into_iter()
                .filter_map(|x| self.join(scope, at, Point { x, y })),
            );
        }
        choices.sort_by_cached_key(|path| {
            (cost(path) + length(&[*path.last().expect("a scope exit"), peer])).to_bits()
        });
        let mut sides = std::collections::BTreeSet::new();
        choices.retain(|path| {
            let last = path.last().expect("a scope exit");
            let side = if last.x < bounds.x {
                0
            } else if last.x > bounds.x + bounds.width {
                1
            } else if last.y < bounds.y {
                2
            } else {
                3
            };
            sides.insert(side)
        });
        choices
    }

    fn templates(
        &self,
        bounds: crate::geometry::Rect,
        obstacles: &[crate::geometry::Rect],
        a: Point,
        b: Point,
        mut visit: impl FnMut(&[Point]),
    ) {
        let mut xs = vec![a.x, b.x, bounds.x + 16.0, bounds.x + bounds.width - 16.0];
        let mut ys = vec![a.y, b.y, bounds.y + 16.0, bounds.y + bounds.height - 16.0];
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

        for x in &xs {
            visit(&[a, Point { x: *x, y: a.y }, Point { x: *x, y: b.y }, b]);
        }
        for y in &ys {
            visit(&[a, Point { x: a.x, y: *y }, Point { x: b.x, y: *y }, b]);
        }
        self.perimeter(bounds, obstacles, &ys, (a, b), visit);
    }

    fn perimeter(
        &self,
        bounds: crate::geometry::Rect,
        obstacles: &[crate::geometry::Rect],
        ys: &[f64],
        ends: (Point, Point),
        mut visit: impl FnMut(&[Point]),
    ) {
        let (a, b) = ends;
        let valid = |p: &[Point]| !obstacles.iter().any(|&at| crosses_box(p, at)) && self.clear(p);
        for outer in [bounds.x + 16.0, bounds.x + bounds.width - 16.0] {
            for &one in ys {
                let first = [a, Point { x: a.x, y: one }, Point { x: outer, y: one }];
                if !valid(&first) {
                    continue;
                }
                for &two in ys {
                    visit(&[
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
    }

    fn join(&self, scope: usize, a: Point, b: Point) -> Option<Vec<Point>> {
        let bounds = self.shape.scopes[&scope].bounds;
        let obstacles: Vec<_> = self.model.scopes[scope]
            .children
            .iter()
            .map(|child| match child {
                Child::Endpoint(id) => self.shape.endpoints[id],
                Child::Scope(id) => self.shape.scopes[id].bounds,
            })
            .collect();
        let valid = |p: &[Point]| !obstacles.iter().any(|&at| crosses_box(p, at)) && self.clear(p);
        let mut best: Option<(f64, Vec<Point>)> = None;
        let mut path = Vec::with_capacity(6);
        self.templates(bounds, &obstacles, a, b, |points| {
            super::geometry::clean_into(points.iter().copied(), &mut path);
            let score = cost(&path);
            // The old stable cost sort selected the first valid minimum.
            // A later tie cannot win, and guards do not change the search state.
            if best
                .as_ref()
                .is_none_or(|(old, _)| score.total_cmp(old).is_lt())
                && valid(&path)
            {
                best = Some((score, path.clone()));
            }
        });
        best.map(|(_, path)| path).or_else(|| {
            let inside = |p: Point| {
                p.x >= bounds.x
                    && p.x <= bounds.x + bounds.width
                    && p.y >= bounds.y
                    && p.y <= bounds.y + bounds.height
            };
            if self.windows.get() == self.limit || !inside(a) || !inside(b) {
                return None;
            }
            self.windows.set(self.windows.get() + 1);
            super::fallback::local(self.model, self.edge, self.shape, scope, a, b)
                .filter(|path| valid(path))
        })
    }
}

pub(super) fn candidates(
    model: &Model<'_>,
    topology: &Topology,
    edge: usize,
    shape: &Shape,
) -> Vec<PlacedLine> {
    bounded_candidates(model, topology, edge, shape, 0).0
}

pub(super) fn bounded_candidates(
    model: &Model<'_>,
    topology: &Topology,
    edge: usize,
    shape: &Shape,
    limit: usize,
) -> (Vec<PlacedLine>, usize) {
    let channels = Channels {
        model,
        topology,
        edge,
        shape,
        windows: Cell::new(0),
        limit,
        segments: RefCell::default(),
    };
    let lines = channels.candidates();
    (lines, channels.windows.get())
}
