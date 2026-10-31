//! A dense placement: the parts of one open frame on a grid below its edge tab,
//! and the cards outside it round its walls, each near what it joins. Inside a
//! frame compactness comes before fewer bends. The planner routes this
//! placement as it routes any other, so every guard still holds.

mod grid;
mod ring;

use rustc_hash::FxHashMap;

use crate::{
    blocks::assembly::{Placed, PlacedCard, Title},
    constants::CONTAINER_INSET,
    geometry::{Point, Rect},
    graph::{Edge, Node, PLACING_GROUP, semantic_order},
};

use grid::{Grid, Item, Join};

/// Room between two cells before routing. Contraction takes back what the routes leave.
const CELL_GAP: f64 = 96.0;
/// How wide a gap must stay beyond a label on a line across it.
const LABEL_RUN: f64 = 64.0;
/// The widest grid a frame takes.
const MOST_COLUMNS: usize = 6;
/// Room under the tab when a line runs from it to a part, with its words.
const FOOT_ROOM: f64 = 72.0;

/// One way to set a reading out.
#[derive(Clone, Copy, Debug)]
struct Way {
    columns: usize,
    /// Room added to every gap, when the tightest placement finds no route.
    room: f64,
    /// Whether doors can stand beside the frame as well as above and below it.
    sides: bool,
}

/// A frame's parts set on their grid, in the frame's own coordinates.
struct Set {
    size: Point,
    parts: Vec<Rect>,
}

/// What every way of setting a reading out starts from.
struct Reading<'a> {
    graph: &'a Node,
    frame: &'a Node,
    /// The size of the frame's edge tab, with the shoulder of the frame beside it.
    tab: Point,
    /// Where the first row stands from the frame's top.
    first_row: f64,
    doors: Vec<&'a Node>,
    items: Vec<Item<'a>>,
    joins: Vec<Join>,
}

/// The one frame a reading opens, when it opens exactly one, holding cards alone.
fn open_frame(graph: &Node) -> Option<&Node> {
    let mut frames = graph.kids().iter().filter(|node| node.has_children());
    let frame = frames.next()?;
    let flat = !frame.kids().iter().any(Node::has_children);
    let grouped = |node: &Node| node.option(PLACING_GROUP).is_some();
    let plain = !graph.kids().iter().chain(frame.kids()).any(grouped);
    (frames.next().is_none() && flat && plain).then_some(frame)
}

/// How many lines lead to each part, the longest way, so that a part stands after what reaches it.
fn depths(count: usize, joins: &[Join]) -> Vec<usize> {
    let mut depth = vec![0; count];
    for _ in 0..count {
        for join in joins {
            depth[join.to] = depth[join.to].max(depth[join.from] + 1).min(count);
        }
    }
    depth
}

/// A part reaches something outside the frame.
fn reaches<'a>(item: &mut Item<'a>, door: &'a str, entering: bool) {
    item.outward += 1.0;
    item.doors.push((door, entering));
}

/// The relationships among the parts, and how many leave for the world outside.
fn joins_of<'a>(edges: &'a [std::rc::Rc<Edge>], items: &mut [Item<'a>]) -> Vec<Join> {
    let index: FxHashMap<&'a str, usize> = items
        .iter()
        .enumerate()
        .map(|(at, item)| (item.node.id.as_str(), at))
        .collect();
    let mut joins = Vec::new();
    for edge in edges {
        match (index.get(edge.source()), index.get(edge.target())) {
            (Some(&from), Some(&to)) => joins.push(Join {
                from,
                to,
                label: edge.label().and_then(|label| label.width).unwrap_or(0.0),
            }),
            (Some(&at), None) => reaches(&mut items[at], edge.target(), false),
            (None, Some(&at)) => reaches(&mut items[at], edge.source(), true),
            _ => {}
        }
    }
    joins
}

impl<'a> Reading<'a> {
    fn of(graph: &'a Node) -> Option<Reading<'a>> {
        let frame = open_frame(graph)?;
        let mut items: Vec<Item<'a>> = frame.kids().iter().map(Item::of).collect();
        items.sort_by(|a, b| {
            semantic_order(a.node.layout_options.as_ref())
                .total_cmp(&semantic_order(b.node.layout_options.as_ref()))
                .then_with(|| a.node.id.cmp(&b.node.id))
        });
        let edges = graph.edges.as_deref().unwrap_or_default();
        let joins = joins_of(edges, &mut items);
        let inside = |id: &str| items.iter().any(|item| item.node.id == id);
        let footed = edges.iter().any(|edge| {
            (edge.source() == frame.id && inside(edge.target()))
                || (edge.target() == frame.id && inside(edge.source()))
        });
        let depth = depths(items.len(), &joins);
        let mut order: Vec<usize> = (0..items.len()).collect();
        order.sort_by_key(|&at| depth[at]);
        let joins = joins
            .into_iter()
            .map(|join| Join {
                from: order.iter().position(|&at| at == join.from).unwrap_or(0),
                to: order.iter().position(|&at| at == join.to).unwrap_or(0),
                ..join
            })
            .collect();
        let items = order.into_iter().map(|at| items[at].clone()).collect();
        Some(Reading {
            graph,
            frame,
            tab: Point {
                x: frame.w(),
                y: frame.h(),
            },
            first_row: frame.h() + CONTAINER_INSET + if footed { FOOT_ROOM } else { 0.0 },
            doors: graph
                .kids()
                .iter()
                .filter(|node| !node.has_children())
                .collect(),
            items,
            joins,
        })
    }

    /// How wide each column's gap must be: a level line needs its label's run.
    fn column_gaps(&self, grid: &Grid, room: f64) -> Vec<f64> {
        let mut gaps = vec![CELL_GAP + room; grid.columns];
        for join in &self.joins {
            let (ax, ay) = grid.at(grid.cells[join.from]);
            let (bx, by) = grid.at(grid.cells[join.to]);
            if ay == by {
                let at = ax.min(bx);
                gaps[at] = gaps[at].max(join.label + LABEL_RUN);
            }
        }
        gaps
    }

    /// Size a settled grid's rows and columns and stand each part in its cell.
    fn set(&self, grid: &Grid, room: f64) -> Set {
        let rows = grid.rows();
        let mut widths = vec![0.0_f64; grid.columns];
        let mut heights = vec![0.0_f64; rows];
        for (item, &cell) in self.items.iter().zip(&grid.cells) {
            let (x, y) = grid.at(cell);
            widths[x] = widths[x].max(item.node.w());
            heights[y] = heights[y].max(item.node.h());
        }
        let gaps = self.column_gaps(grid, room);
        let xs = stations(CONTAINER_INSET, &widths, gaps.iter().copied());
        let ys = stations(
            self.first_row,
            &heights,
            std::iter::repeat(CELL_GAP + room),
        );
        let parts = self
            .items
            .iter()
            .zip(&grid.cells)
            .map(|(_, &cell)| {
                let (x, y) = grid.at(cell);
                Rect {
                    x: xs[x],
                    y: ys[y],
                    width: widths[x],
                    height: heights[y],
                }
            })
            .collect();
        let last = grid.columns - 1;
        Set {
            size: Point {
                x: f64::max(xs[last] + widths[last] + CONTAINER_INSET, self.tab.x),
                y: ys[rows - 1] + heights[rows - 1] + CONTAINER_INSET,
            },
            parts,
        }
    }

    /// This reading's drawing, set out one way, with no routes yet.
    fn drawing(&self, way: Way) -> Placed {
        let mut grid = Grid::new(way.columns, self.items.len());
        grid.settle(&self.joins, &self.items);
        let set = self.set(&grid, way.room);
        let ring = ring::Ring {
            graph: self.graph,
            frame: &self.frame.id,
            tab: self.tab,
            set: &set,
            ids: self
                .items
                .iter()
                .map(|item| item.node.id.as_str())
                .collect(),
            extra: way.room,
            sides: way.sides,
        };
        let page = ring.stand(&self.doors);
        let origin = page.frame;
        let bx = Rect {
            x: origin.x,
            y: origin.y,
            width: set.size.x,
            height: set.size.y,
        };
        let title = Rect {
            width: self.tab.x,
            height: self.tab.y,
            ..bx
        };
        let parts = self
            .items
            .iter()
            .zip(&set.parts)
            .map(|(item, part)| PlacedCard {
                id: item.node.id.clone(),
                bx: Rect {
                    x: origin.x + part.x,
                    y: origin.y + part.y,
                    ..*part
                },
                depth: 1,
                header: None,
            });
        Placed {
            width: page.width,
            height: page.height,
            cards: parts.chain(page.doors).collect(),
            frames: vec![PlacedCard {
                id: self.frame.id.clone(),
                bx,
                depth: 0,
                header: None,
            }],
            regions: Vec::new(),
            edges: Vec::new(),
            titles: vec![Title {
                bx: title,
                band: title,
            }],
        }
    }

    /// The straight way every line would take, to compare placements before routing.
    fn reach(&self, drawing: &Placed) -> f64 {
        let boxes: FxHashMap<&str, Rect> = drawing
            .cards
            .iter()
            .chain(&drawing.frames)
            .map(|card| (card.id.as_str(), card.bx))
            .collect();
        let centre = |id: &str| boxes.get(id).map_or(0.0, |at| at.x + at.width / 2.0);
        let middle = |id: &str| boxes.get(id).map_or(0.0, |at| at.y + at.height / 2.0);
        self.graph
            .edges
            .iter()
            .flatten()
            .map(|edge| {
                (centre(edge.source()) - centre(edge.target())).abs()
                    + (middle(edge.source()) - middle(edge.target())).abs()
            })
            .sum()
    }
}

/// Where a run of sizes stands from one start, with a gap after each.
fn stations(start: f64, sizes: &[f64], gaps: impl Iterator<Item = f64>) -> Vec<f64> {
    let mut at = start;
    sizes
        .iter()
        .zip(gaps)
        .map(|(size, gap)| {
            let here = at;
            at += size + gap;
            here
        })
        .collect()
}

/// Every dense placement of a reading of one open frame, the most promising first.
pub(super) fn drawings(graph: &Node, room: f64) -> Vec<Placed> {
    let Some(reading) = Reading::of(graph) else {
        return Vec::new();
    };
    let most = MOST_COLUMNS.min(reading.items.len());
    let mut placed: Vec<(f64, Placed)> = (1..=most)
        .flat_map(|columns| {
            [false, true].map(|sides| Way {
                columns,
                room,
                sides,
            })
        })
        .map(|way| {
            let drawing = reading.drawing(way);
            (
                super::reading::promise(&drawing, reading.reach(&drawing)),
                drawing,
            )
        })
        .collect();
    placed.sort_by(|a, b| a.0.total_cmp(&b.0));
    placed.into_iter().map(|(_, drawing)| drawing).collect()
}
