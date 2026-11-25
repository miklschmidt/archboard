//! Nearest clear label spot along a route's private spans.

use super::{Span, StrokeView, at, clear, own::Own, plate::Plate, subtract};
use crate::blocks::planned::shape::Shape;
use crate::geometry::{Rect, inflate};

pub(super) fn nearest(
    spans: &[Span],
    plate: Plate,
    shape: &Shape,
    own: Own<'_>,
    index: StrokeView<'_>,
    labels: &crate::blocks::planned::label_space::Labels,
) -> Option<Rect> {
    let mut best: Option<(f64, Rect)> = None;
    for &span in spans {
        // Every spot lies at or beyond the start of its private span.
        if best.is_some_and(|(distance, _)| span.before > distance) {
            continue;
        }
        let best_dist = best.map(|(distance, _)| distance);
        if let Some(spot) = best_spot_on(span, plate, shape, own, (index, labels), best_dist)
            && best.is_none_or(|(distance, _)| spot.0.total_cmp(&distance).is_lt())
        {
            best = Some(spot);
        }
    }
    best.map(|(_, at)| at)
}

fn protect_rect(
    free: &mut Vec<(f64, f64)>,
    r: Rect,
    (horizontal, across, along_half, across_half): (bool, f64, f64, f64),
) {
    let (Some(first), Some(last)) = (free.first(), free.last()) else {
        return;
    };
    let (low, high, left, right) = if horizontal {
        (r.x, r.x + r.width, r.y, r.y + r.height)
    } else {
        (r.y, r.y + r.height, r.x, r.x + r.width)
    };
    let (cut_lo, cut_hi) = (low - along_half, high + along_half);
    if across + across_half >= left
        && across - across_half <= right
        && cut_hi > first.0
        && cut_lo < last.1
    {
        subtract(free, cut_lo, cut_hi);
    }
}

fn free_intervals(
    span: Span,
    (lo, hi, a, b, across, along_half, across_half): (f64, f64, f64, f64, f64, f64, f64),
    shape: &Shape,
    own: Own<'_>,
    index: StrokeView<'_>,
) -> Vec<(f64, f64)> {
    let horizontal = span.a.y == span.b.y;
    let params = (horizontal, across, along_half, across_half);
    let mut free = vec![(lo, hi)];
    let geometry = shape
        .label_geometry
        .get_or_init(|| crate::blocks::planned::label_space::Protection::new(shape));
    geometry.nearby(horizontal, across, across_half, |r| {
        protect_rect(&mut free, r, params);
    });
    if free.is_empty() {
        return free;
    }
    for &r in shape.labels.values() {
        protect_rect(
            &mut free,
            inflate(r, crate::blocks::planned::label_space::LABEL_ROOM + 0.01),
            params,
        );
        if free.is_empty() {
            return free;
        }
    }
    for stretch in own.others(span) {
        protect_rect(&mut free, inflate(stretch, own.keep(12.02)), params);
        if free.is_empty() {
            return free;
        }
    }
    let window = search_window(a, b, across, across_half, horizontal);
    index.touching(own.edge, window, |r| {
        protect_rect(&mut free, inflate(r, 12.02), params);
    });
    free
}

fn best_spot_on(
    span: Span,
    plate: Plate,
    shape: &Shape,
    own: Own<'_>,
    (index, labels): (StrokeView<'_>, &crate::blocks::planned::label_space::Labels),
    best_dist: Option<f64>,
) -> Option<(f64, Rect)> {
    let size = plate.size;
    let (a, b, across, along_half, across_half) = projection(span, size);
    let forward = a < b;
    let (low, high) = if forward {
        (span.a, span.b)
    } else {
        (span.b, span.a)
    };
    let lo = a.min(b) + along_half + (plate.room_at(low, own) + 0.01);
    let hi = a.max(b) - along_half - (plate.room_at(high, own) + 0.01);
    if hi < lo {
        return None;
    }
    let min_pos = if forward { lo } else { hi };
    let min_dist = span.before + (min_pos - a).abs();
    if best_dist.is_some_and(|d| !min_dist.total_cmp(&d).is_lt()) {
        return None;
    }
    let free = free_intervals(
        span,
        (lo, hi, a, b, across, along_half, across_half),
        shape,
        own,
        index,
    );
    let candidate = |(lo, hi): (f64, f64)| {
        let position = if forward { lo } else { hi };
        (span.before + (position - a).abs(), position)
    };
    let beats_best = |(dist, _): &(f64, f64)| best_dist.is_none_or(|d| dist.total_cmp(&d).is_lt());
    let clear_spot = |(dist, position)| {
        let label = at(span, position, size);
        clear(shape, own.edge, label, index, labels).then_some((dist, label))
    };
    if forward {
        free.into_iter()
            .map(candidate)
            .take_while(beats_best)
            .find_map(clear_spot)
    } else {
        let mut candidates = free.into_iter().rev().map(candidate).take_while(beats_best);
        let first = candidates.find_map(clear_spot)?;
        // Equal distances keep the first clear interval in ascending coordinate order.
        candidates
            .take_while(|(dist, _)| dist.total_cmp(&first.0).is_eq())
            .filter_map(clear_spot)
            .last()
            .or(Some(first))
    }
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
