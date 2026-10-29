//! Labels use existing private ink. They never alter a route's bends.

use super::{
    geometry::{contains, length},
    model::Model,
    shape::Shape,
};
use crate::geometry::{Point, Rect, inflate};

#[derive(Clone, Copy)]
struct Span {
    a: Point,
    b: Point,
    before: f64,
}

fn subtract(parts: Vec<(f64, f64)>, a: f64, b: f64) -> Vec<(f64, f64)> {
    parts
        .into_iter()
        .flat_map(|(lo, hi)| {
            if b <= lo || a >= hi {
                return vec![(lo, hi)];
            }
            let mut left = Vec::new();
            if lo < a {
                left.push((lo, a));
            }
            if b < hi {
                left.push((b, hi));
            }
            left
        })
        .collect()
}

type Strokes = std::collections::BTreeMap<(bool, i64), Vec<(usize, f64, f64, f64)>>;

#[expect(
    clippy::cast_possible_truncation,
    reason = "the rounded coordinate is an integer bin, never a drawing coordinate"
)]
fn bin(at: f64) -> i64 {
    at as i64
}

struct StrokeIndex {
    strokes: Strokes,
}
impl StrokeIndex {
    fn new(model: &Model<'_>, shape: &Shape) -> Self {
        let mut strokes = std::collections::BTreeMap::new();
        for line in &shape.routes {
            let edge = model.edge_index[line.id.as_str()];
            for pair in line.points.windows(2) {
                let horizontal = pair[0].y == pair[1].y;
                let (across, a, b) = if horizontal {
                    (pair[0].y, pair[0].x, pair[1].x)
                } else {
                    (pair[0].x, pair[0].y, pair[1].y)
                };
                strokes
                    .entry((horizontal, bin((across * 1e6).round())))
                    .or_insert_with(Vec::new)
                    .push((edge, across, a.min(b), a.max(b)));
            }
        }
        Self { strokes }
    }
    fn crosses(&self, edge: usize, rect: Rect) -> bool {
        for horizontal in [true, false] {
            let (low, high, start, end) = if horizontal {
                (rect.y, rect.y + rect.height, rect.x, rect.x + rect.width)
            } else {
                (rect.x, rect.x + rect.width, rect.y, rect.y + rect.height)
            };
            let first = bin((low * 1e6).floor()) - 1;
            let last = bin((high * 1e6).ceil()) + 1;
            for (_, strokes) in self.strokes.range((horizontal, first)..=(horizontal, last)) {
                if strokes.iter().any(|&(other, across, lo, hi)| {
                    other != edge && across > low && across < high && lo < end && hi > start
                }) {
                    return true;
                }
            }
        }
        false
    }
    fn touching(&self, edge: usize, rect: Rect, mut visit: impl FnMut(Rect)) {
        for horizontal in [true, false] {
            let (low, high, start, end) = if horizontal {
                (rect.y, rect.y + rect.height, rect.x, rect.x + rect.width)
            } else {
                (rect.x, rect.x + rect.width, rect.y, rect.y + rect.height)
            };
            let first = bin((low * 1e6).floor()) - 1;
            let last = bin((high * 1e6).ceil()) + 1;
            for (_, strokes) in self.strokes.range((horizontal, first)..=(horizontal, last)) {
                for &(_, across, lo, hi) in strokes.iter().filter(|&&(other, across, lo, hi)| {
                    other != edge && across >= low && across <= high && lo <= end && hi >= start
                }) {
                    visit(if horizontal {
                        Rect {
                            x: lo,
                            y: across,
                            width: hi - lo,
                            height: 0.0,
                        }
                    } else {
                        Rect {
                            x: across,
                            y: lo,
                            width: 0.0,
                            height: hi - lo,
                        }
                    });
                }
            }
        }
    }
    fn private(&self, edge: usize, path: &[Point]) -> Vec<Span> {
        let mut spans = Vec::new();
        let mut before = 0.0;
        for pair in path.windows(2) {
            let horizontal = pair[0].y == pair[1].y;
            let (across, a, b) = if horizontal {
                (pair[0].y, pair[0].x, pair[1].x)
            } else {
                (pair[0].x, pair[0].y, pair[1].y)
            };
            let key = bin((across * 1e6).round());
            let mut parts = vec![(a.min(b), a.max(b))];
            for (_, strokes) in self
                .strokes
                .range((horizontal, key - 1)..=(horizontal, key + 1))
            {
                for &(_, _, lo, hi) in strokes
                    .iter()
                    .filter(|&&(other, at, _, _)| other != edge && (at - across).abs() < 1e-6)
                {
                    parts = subtract(parts, lo, hi);
                }
            }
            for (lo, hi) in parts {
                let point = |at| {
                    if horizontal {
                        Point { x: at, y: across }
                    } else {
                        Point { x: across, y: at }
                    }
                };
                let (start, end) = span_ends(lo, hi, a < b);
                spans.push(Span {
                    a: point(start),
                    b: point(end),
                    before: before + (a - start).abs(),
                });
            }
            before += length(pair);
        }
        spans
    }
}

fn span_ends(lo: f64, hi: f64, forward: bool) -> (f64, f64) {
    if forward { (lo, hi) } else { (hi, lo) }
}
fn clear(
    shape: &Shape,
    edge: usize,
    at: Rect,
    strokes: &StrokeIndex,
    labels: &super::label_space::Labels,
) -> bool {
    contains(shape.scopes[&0].bounds, at)
        && shape
            .label_geometry
            .get_or_init(|| super::label_space::Protection::new(shape))
            .clear(at)
        && labels.clear(at, &shape.labels)
        && !strokes.crosses(edge, inflate(at, 12.01))
}

fn at(span: Span, position: f64, size: Rect) -> Rect {
    let (x, y) = if span.a.y == span.b.y {
        (position, span.a.y)
    } else {
        (span.a.x, position)
    };
    Rect {
        x: x - size.width / 2.0,
        y: y - size.height / 2.0,
        ..size
    }
}

pub(super) fn slot(
    model: &Model<'_>,
    edge: usize,
    shape: &Shape,
    path: &[Point],
) -> Option<(Rect, bool)> {
    slot_index(
        model,
        edge,
        shape,
        path,
        &StrokeIndex::new(model, shape),
        &super::label_space::Labels::new(&shape.labels),
    )
}

fn slot_index(
    model: &Model<'_>,
    edge: usize,
    shape: &Shape,
    path: &[Point],
    index: &StrokeIndex,
    labels: &super::label_space::Labels,
) -> Option<(Rect, bool)> {
    let label = model.edges[edge].label()?;
    let size = Rect {
        x: 0.0,
        y: 0.0,
        width: label.width.unwrap_or(0.0),
        height: label.height.unwrap_or(0.0),
    };
    let mut spans = index.private(edge, path);
    // Every plate in a stack must meet its own line, not only the stack's envelope.
    spans.retain(|span| !label.stacked || span.a.x == span.b.x);
    spans.sort_by(|a, b| {
        length(&[b.a, b.b])
            .total_cmp(&length(&[a.a, a.b]))
            .then(a.before.total_cmp(&b.before))
    });
    for &span in &spans {
        let horizontal = span.a.y == span.b.y;
        let required = if horizontal { size.width } else { size.height };
        if length(&[span.a, span.b]) < required + 32.0 {
            continue;
        }
        let position = if horizontal {
            f64::midpoint(span.a.x, span.b.x)
        } else {
            f64::midpoint(span.a.y, span.b.y)
        };
        let label = at(span, position, size);
        if clear(shape, edge, label, index, labels) {
            return Some((label, false));
        }
    }
    let spots = spans
        .into_iter()
        .flat_map(|span| spots_for(span, size, shape, edge, index, labels));

    spots
        .min_by(|a, b| a.0.total_cmp(&b.0))
        .map(|(_, at)| (at, true))
}

fn spots_for(
    span: Span,
    size: Rect,
    shape: &Shape,
    edge: usize,
    index: &StrokeIndex,
    labels: &super::label_space::Labels,
) -> Vec<(f64, Rect)> {
    let mut spots = Vec::new();
    let horizontal = span.a.y == span.b.y;
    let (a, b, across, along_half, across_half) = projection(span, size);
    let (lo, hi) = (a.min(b) + along_half + 16.01, a.max(b) - along_half - 16.01);
    if hi < lo {
        return Vec::new();
    }
    let mut free = vec![(lo, hi)];
    let mut protect = |r: Rect| {
        let (low, high, left, right) = if horizontal {
            (r.x, r.x + r.width, r.y, r.y + r.height)
        } else {
            (r.y, r.y + r.height, r.x, r.x + r.width)
        };
        if across + across_half >= left && across - across_half <= right {
            free = subtract(
                std::mem::take(&mut free),
                low - along_half,
                high + along_half,
            );
        }
    };
    let geometry = shape
        .label_geometry
        .get_or_init(|| super::label_space::Protection::new(shape));
    for &r in &geometry.obstacles {
        protect(r);
    }
    for &r in shape.labels.values() {
        protect(inflate(r, 8.02));
    }
    let window = search_window(a, b, across, across_half, horizontal);
    index.touching(edge, window, |r| protect(inflate(r, 12.02)));
    spots.extend(free.into_iter().filter_map(|(lo, hi)| {
        let position = if a < b { lo } else { hi };
        let label = at(span, position, size);
        clear(shape, edge, label, index, labels)
            .then_some((span.before + (position - a).abs(), label))
    }));
    spots
}

fn projection(span: Span, size: Rect) -> (f64, f64, f64, f64, f64) {
    let horizontal = span.a.y == span.b.y;
    if horizontal {
        (
            span.a.x,
            span.b.x,
            span.a.y,
            size.width / 2.0,
            size.height / 2.0,
        )
    } else {
        (
            span.a.y,
            span.b.y,
            span.a.x,
            size.height / 2.0,
            size.width / 2.0,
        )
    }
}

fn search_window(a: f64, b: f64, across: f64, across_half: f64, horizontal: bool) -> Rect {
    if horizontal {
        Rect {
            x: a.min(b),
            y: across - across_half - 12.01,
            width: (a - b).abs(),
            height: 2.0 * across_half + 24.02,
        }
    } else {
        Rect {
            x: across - across_half - 12.01,
            y: a.min(b),
            width: 2.0 * across_half + 24.02,
            height: (a - b).abs(),
        }
    }
}

pub(super) fn arrange(model: &Model<'_>, shape: &mut Shape) -> Option<usize> {
    let strokes = StrokeIndex::new(model, shape);
    shape.labels.clear();
    let mut labels = super::label_space::Labels::default();
    let indices: Vec<_> = shape
        .routes
        .iter()
        .map(|line| model.edge_index.get(line.id.as_str()).copied())
        .collect::<Option<_>>()?;
    let mut order: Vec<_> = (0..shape.routes.len()).collect();
    order.sort_by(|&a, &b| {
        let area = |index: usize| {
            model.edges[indices[index]]
                .label()
                .map_or(0.0, |l| l.width.unwrap_or(0.0) * l.height.unwrap_or(0.0))
        };
        area(b).total_cmp(&area(a)).then(a.cmp(&b))
    });
    seed(shape, &indices, &order, &strokes, &mut labels);
    let mut fallbacks = 0;
    for _ in 0..4 {
        let (count, changed) = update(model, shape, &indices, &order, &strokes, &mut labels)?;
        fallbacks = count;
        if !changed {
            return Some(fallbacks);
        }
    }
    consistent(model, shape, &indices, &order, &strokes, &labels)?;
    Some(fallbacks)
}

fn consistent(
    model: &Model<'_>,
    shape: &mut Shape,
    indices: &[usize],
    order: &[usize],
    strokes: &StrokeIndex,
    labels: &super::label_space::Labels,
) -> Option<()> {
    for &index in order {
        let edge = indices[index];
        if model.edges[edge].label().is_none() {
            continue;
        }
        let old = shape.labels.remove(&edge)?;
        let (label, _) = slot_index(
            model,
            edge,
            shape,
            &shape.routes[index].points,
            strokes,
            labels,
        )?;
        shape.labels.insert(edge, old);
        if old != label {
            return None;
        }
    }
    Some(())
}
fn seed(
    shape: &mut Shape,
    indices: &[usize],
    order: &[usize],
    strokes: &StrokeIndex,
    labels: &mut super::label_space::Labels,
) {
    for &index in order {
        let line = &shape.routes[index];
        if let Some(label) = line.label
            && clear(shape, indices[index], label, strokes, labels)
        {
            let edge = indices[index];
            shape.labels.insert(edge, label);
            labels.remember(edge, label);
        }
    }
}
fn update(
    model: &Model<'_>,
    shape: &mut Shape,
    indices: &[usize],
    order: &[usize],
    strokes: &StrokeIndex,
    labels: &mut super::label_space::Labels,
) -> Option<(usize, bool)> {
    let mut changed = false;
    let mut fallbacks = 0;
    for &index in order {
        let edge = indices[index];
        if model.edges[edge].label().is_none() {
            continue;
        }
        let old = shape.labels.remove(&edge);
        let (label, fallback) = slot_index(
            model,
            edge,
            shape,
            &shape.routes[index].points,
            strokes,
            labels,
        )?;
        changed |= old != Some(label);
        shape.labels.insert(edge, label);
        labels.remember(edge, label);
        shape.routes[index].label = Some(label);
        fallbacks += usize::from(fallback);
    }
    Some((fallbacks, changed))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        blocks::{
            assembly::{Placed, PlacedLine},
            planned::shape::ScopePlacement,
        },
        graph::Node,
    };
    use serde_json::json;

    fn drawing(paths: &[(&str, &[(f64, f64)])]) -> Shape {
        let mut shape = Shape::new(Placed {
            width: 1000.0,
            height: 1000.0,
            cards: vec![],
            frames: vec![],
            regions: vec![],
            titles: vec![],
            edges: paths
                .iter()
                .map(|(id, points)| PlacedLine {
                    id: (*id).to_owned(),
                    label: None,
                    points: points.iter().map(|&(x, y)| Point { x, y }).collect(),
                })
                .collect(),
        });
        std::rc::Rc::make_mut(&mut shape.scopes).insert(
            0,
            ScopePlacement {
                bounds: Rect {
                    x: 0.0,
                    y: 0.0,
                    width: 1000.0,
                    height: 1000.0,
                },
            },
        );
        shape
    }
    fn graph() -> Node {
        serde_json::from_value(json!({"id":"root","children":[
            {"id":"a","width":100,"height":60},{"id":"b","width":100,"height":60},
            {"id":"c","width":100,"height":60}],"edges":[
            {"id":"ab","sources":["a"],"targets":["b"],"labels":[{"width":80,"height":24}]},
            {"id":"ac","sources":["a"],"targets":["c"]}]}))
        .unwrap()
    }
    #[test]
    fn stacked_labels_follow_a_vertical_run_even_when_the_horizontal_run_is_longer() {
        let graph: Node = serde_json::from_value(json!({"id":"root","children":[
            {"id":"a","width":100,"height":60},{"id":"b","width":100,"height":60}],
            "edges":[{"id":"ab","sources":["a"],"targets":["b"],
                "labels":[{"width":80,"height":180,"stacked":true}]}]}))
        .unwrap();
        let model = Model::new(&graph).unwrap();
        let shape = drawing(&[("ab", &[(100.0, 100.0), (900.0, 100.0), (900.0, 500.0)])]);
        let (label, _) = slot(&model, 0, &shape, &shape.routes[0].points).unwrap();
        assert_eq!(label.x + label.width / 2.0, 900.0);
        assert!(label.y > 100.0 && label.y + label.height < 500.0);
        assert!(slot(&model, 0, &shape, &shape.routes[0].points[..2]).is_none());
    }

    #[test]
    fn words_use_the_longest_private_run_after_the_fan_splits() {
        let graph = graph();
        let model = Model::new(&graph).unwrap();
        let shape = drawing(&[
            (
                "ab",
                &[
                    (100.0, 100.0),
                    (700.0, 100.0),
                    (700.0, 400.0),
                    (900.0, 400.0),
                ],
            ),
            (
                "ac",
                &[
                    (100.0, 100.0),
                    (700.0, 100.0),
                    (700.0, 200.0),
                    (500.0, 200.0),
                ],
            ),
        ]);
        let (label, fallback) = slot(&model, 0, &shape, &shape.routes[0].points).unwrap();
        assert!(!fallback);
        assert_eq!(
            (label.x + label.width / 2.0, label.y + label.height / 2.0),
            (700.0, 300.0)
        );
    }
    #[test]
    fn blocked_midpoints_use_the_nearest_clear_private_spot_without_rerouting() {
        let graph = graph();
        let model = Model::new(&graph).unwrap();
        let shape = drawing(&[
            ("ab", &[(100.0, 500.0), (900.0, 500.0)]),
            ("ac", &[(500.0, 450.0), (500.0, 550.0)]),
        ]);
        let path = shape.routes[0].points.clone();
        let (label, fallback) = slot(&model, 0, &shape, &path).unwrap();
        assert!(fallback);
        assert!((label.x - 116.01).abs() < 1e-6);
        assert_eq!(label.y, 488.0);
        assert_eq!(shape.routes[0].points, path);
    }
}
