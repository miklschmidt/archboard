//! Cards nothing connects, set out as a grid (TASK-349). A container or group
//! of cards with no relationship between them has no ranks to follow, and
//! Graphviz lines them all up on one rank. Each such card is chained to the
//! card above it in its column by an invisible, heavy edge one rank long, so
//! Graphviz stacks the rows and keeps the columns straight.

use crate::constants::LAYOUT_ASPECT;
use crate::ecma::{js_max, js_min, max, round};
use crate::track::score::Plan;
use crate::track::spacing::EMPTY_CHANNEL;
use crate::viz::{Attrs, Edge, Value};

/// The fewest loose cards set out as a grid rather than left on one rank.
const MIN_GRID: usize = 4;
/// How strongly a grid column pulls its cards into line.
const COLUMN_WEIGHT: f64 = 100.0;
/// The room beside a card in its row: the gap Graphviz keeps between neighbours.
const COLUMN_ROOM: f64 = 40.0;

/// A loose card and its size.
#[derive(Clone, Debug)]
pub(crate) struct Loose {
    pub id: String,
    pub width: f64,
    pub height: f64,
}

/// Whether some loose cards are enough to set out as a grid.
pub(crate) fn grids(count: usize) -> bool {
    count >= MIN_GRID
}

/// The invisible edges that set loose cards out as a grid, in their order,
/// row by row, with as many columns as bring the grid nearest the page's shape.
pub(crate) fn grid_edges(cards: &[Loose]) -> Vec<Edge> {
    if !grids(cards.len()) {
        return Vec::new();
    }
    let width = max(cards.iter().map(|card| card.width)) + COLUMN_ROOM;
    let height = max(cards.iter().map(|card| card.height)) + EMPTY_CHANNEL;
    let fitting = round(((cards.len() as f64 * LAYOUT_ASPECT * height) / width).sqrt());
    #[expect(
        clippy::cast_possible_truncation,
        clippy::cast_sign_loss,
        reason = "a whole count from 1 to the number of cards: Math.round of a finite root, clamped"
    )]
    let columns = js_max(1.0, js_min(cards.len() as f64, fitting)) as usize;
    cards[columns..]
        .iter()
        .enumerate()
        .map(|(index, head)| {
            Edge::new(
                cards[index].id.clone(),
                head.id.clone(),
                Attrs::of([
                    ("style", Value::from("invis")),
                    ("minlen", Value::Num(1.0)),
                    ("weight", Value::Num(COLUMN_WEIGHT)),
                ]),
            )
        })
        .collect()
}

/// The invisible edges that keep a wrapped rank's rows in columns: every
/// lowered card chained to the card above it in its column.
pub(crate) fn wrap_edges(plan: &Plan) -> Vec<Edge> {
    let mut rows: Vec<Vec<&String>> = Vec::new();
    for (card, &row) in plan {
        if rows.len() <= row {
            rows.resize(row + 1, Vec::new());
        }
        rows[row].push(card);
    }
    let mut edges = Vec::new();
    for (row, cards) in rows.iter().enumerate() {
        if row == 0 {
            continue;
        }
        for (column, head) in cards.iter().enumerate() {
            let Some(tail) = rows[row - 1].get(column) else {
                continue;
            };
            edges.push(Edge::new(
                (*tail).clone(),
                (*head).clone(),
                Attrs::of([
                    ("style", Value::from("invis")),
                    ("minlen", Value::Num(2.0)),
                    ("weight", Value::Num(COLUMN_WEIGHT)),
                ]),
            ));
        }
    }
    edges
}
