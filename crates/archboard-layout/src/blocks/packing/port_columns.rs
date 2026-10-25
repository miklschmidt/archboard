//! Ports that share an edge stand a lane apart. Unrelated ports that face
//! each other also need separate columns: the router fixes their end segments
//! and can overlap those segments when the pins stand on the same column.

use crate::ecma::{abs, js_max, js_min};
use crate::geometry::{Rect, Side};
use crate::track::chains::LANE;
use crate::track::scene::{Map, Set};

use super::super::laid::{LaidMap, SAME};
use super::super::tree::{Block, BlockId, BlockTree};
use super::open_edge::{Span, nearest_free};

/// A port of a block inside: its block's box in the parent, where it stands
/// among its block's settled ports, and the span where it can stand.
struct Port {
    bx: Rect,
    block: BlockId,
    /// Which of the settled blocks it is on.
    held: usize,
    id: String,
    pin: String,
    side: Option<Side>,
    span: Span,
}

/// Whether two ports leave their blocks toward each other: the upper one
/// downward and the lower one upward.
fn facing(one: &Port, other: &Port) -> bool {
    let (upper, lower) = if one.side == Some(Side::Bottom) {
        (one, other)
    } else {
        (other, one)
    };
    upper.side == Some(Side::Bottom)
        && lower.side == Some(Side::Top)
        && upper.bx.y + upper.bx.height <= lower.bx.y
}

/// A port's column in its parent's coordinates.
fn column_of(port: &Port, settled: &[(BlockId, Map<String, f64>)]) -> f64 {
    port.bx.x + settled[port.held].1[port.id.as_str()]
}

/// Keep unrelated facing ports off one column before routing their trunks.
/// `settled` holds the inner blocks' positions, moved in place; `span_of` is
/// the span where a port can stand.
pub(crate) fn separate_facing_ports(
    block: &Block,
    settled: &mut [(BlockId, Map<String, f64>)],
    tree: &BlockTree,
    laid: &LaidMap,
    span_of: impl Fn(&Block, &str) -> Span,
) {
    let boxes = &laid[block.id.as_str()].boxes;
    let ports: Vec<Port> = settled
        .iter()
        .enumerate()
        .flat_map(|(held, (id, positions))| {
            let inner = tree.get(*id);
            let at = boxes[inner.id.as_str()];
            let span_of = &span_of;
            positions.keys().map(move |port| Port {
                bx: at,
                block: *id,
                held,
                id: port.clone(),
                pin: format!("pin:{}:{port}", inner.id),
                side: inner.ports.get(port).copied(),
                span: span_of(inner, port),
            })
        })
        .collect();
    let connected: Set<String> = block
        .lines
        .values()
        .flat_map(|line| {
            [
                format!("{}>{}", line.from, line.to),
                format!("{}>{}", line.to, line.from),
            ]
        })
        .collect();
    for (index, one) in ports.iter().enumerate() {
        let others: Vec<&Port> = ports
            .iter()
            .enumerate()
            .filter(|&(at, other)| {
                if at == index {
                    return false;
                }
                if one.block == other.block {
                    return one.side == other.side;
                }
                facing(one, other) && !connected.contains(&format!("{}>{}", one.pin, other.pin))
            })
            .map(|(_, other)| other)
            .collect();
        let x = column_of(one, settled);
        if !others
            .iter()
            .any(|other| abs(column_of(other, settled) - x) < SAME)
        {
            continue;
        }
        let (low, high) = (one.span.0 + one.bx.x, one.span.1 + one.bx.x);
        let blocked: Vec<Rect> = others
            .iter()
            .map(|other| column_of(other, settled))
            .filter(|&at| at + LANE > low && at - LANE < high)
            .map(|at| Rect {
                x: at,
                y: 0.0,
                width: 0.0,
                height: 0.0,
            })
            .collect();
        if let Some(free) = nearest_free((low, high), &blocked, LANE, x) {
            let to = js_max(free.0, js_min(free.1, x)) - one.bx.x;
            settled[one.held].1.insert(one.id.clone(), to);
        }
    }
}

/// Wanted x's spread a lane apart within a span, in their order.
pub(crate) fn spread(span: Span, wanted: &[f64]) -> Vec<f64> {
    let gap = if wanted.len() > 1 {
        js_min(LANE, (span.1 - span.0) / (wanted.len() - 1) as f64)
    } else {
        0.0
    };
    let mut xs: Vec<f64> = wanted
        .iter()
        .map(|&x| js_min(span.1, js_max(span.0, x)))
        .collect();
    for index in 1..xs.len() {
        xs[index] = js_max(xs[index], xs[index - 1] + gap);
    }
    for index in (0..xs.len()).rev() {
        let next = xs.get(index + 1).copied().unwrap_or(span.1 + gap);
        xs[index] = js_min(xs[index], next - gap);
    }
    xs
}
