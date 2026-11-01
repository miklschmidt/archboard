//! A dense placement: the parts of each open frame on a grid below its edge tab,
//! the frames in a row or a stack, and the cards outside them round that whole,
//! each near what it joins. Inside a frame compactness comes before fewer bends.
//! The planner routes this placement as it routes any other, so every guard
//! still holds. The grid is only where routing starts: contraction then brings the
//! cards of each row and column as near as what runs between them lets them stand.

mod grid;
mod ring;

use rustc_hash::FxHashMap;

use crate::{
    blocks::assembly::{Placed, PlacedCard, Title},
    constants::CONTAINER_INSET,
    geometry::{Point, Rect},
    graph::{DOOR, Edge, Node, semantic_order},
};

use grid::{Grid, Item, Join};

/// Room between two cells before routing. Contraction takes back what the routes leave.
const CELL_GAP: f64 = 96.0;
/// How wide a gap must stay beyond a label on a line across it.
const LABEL_RUN: f64 = 64.0;
/// The widest grid a frame takes.
const MOST_COLUMNS: usize = 6;
/// Room under the tab, for a line past it to a part below it or from the tab itself.
/// Contraction takes back what no line uses.
const FOOT_ROOM: f64 = 72.0;

/// From this many lines a reading with no frame takes the grid. A smaller one keeps its ranks,
/// which read from top to bottom.
const CROWDED_ROOT: usize = 18;
/// The tallest placement that contraction can still bring into the pane. Several
/// frames stack past it, because a stack still lands larger than the row they make.
const TALLEST: f64 = 1950.0;
/// Room between two frames before routing. Contraction takes back what the routes leave.
const FRAME_GAP: f64 = 112.0;

/// How a reading's frames and doors stand, once each frame has set out its parts.
#[derive(Clone, Copy, Debug)]
struct Way {
    /// Room added to every gap, when the tightest placement finds no route.
    room: f64,
    /// Whether doors can stand beside the frames as well as above and below them.
    sides: bool,
    /// Whether frames fill rows as wide as the widest frame, or else stand side by side.
    stacked: bool,
}

/// A frame's parts set on their grid, in the frame's own coordinates.
struct Set {
    size: Point,
    parts: Vec<Rect>,
}

/// One frame of a reading, or the reading itself, with the parts it sets on a grid.
struct Block<'a> {
    frame: &'a Node,
    /// Whether a frame stands round the grid: the reading's own cards have none.
    framed: bool,
    /// The size of the frame's edge tab, with the shoulder of the frame beside it.
    tab: Point,
    /// Where the first row stands from the frame's top.
    first_row: f64,
    items: Vec<Item<'a>>,
    joins: Vec<Join>,
}

/// What every way of setting a reading out starts from.
struct Reading<'a> {
    graph: &'a Node,
    blocks: Vec<Block<'a>>,
    doors: Vec<&'a Node>,
}

/// What a reading sets on grids: the frames it opens, each holding cards alone,
/// or the reading itself when it opens no frame and has too many lines to rank.
fn holders(graph: &Node) -> Option<Vec<&Node>> {
    let mut held: Vec<&Node> = graph
        .kids()
        .iter()
        .filter(|node| node.has_children())
        .collect();
    let lines = graph.edges.as_ref().map_or(0, Vec::len);
    if held.is_empty() && lines >= CROWDED_ROOT {
        held.push(graph);
    }
    let flat = |frame: &&Node| !frame.kids().iter().any(Node::has_children);
    (!held.is_empty() && held.iter().all(flat)).then_some(held)
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

impl<'a> Block<'a> {
    fn of(graph: &'a Node, frame: &'a Node) -> Block<'a> {
        let framed = !std::ptr::eq(frame, graph);
        let mut items: Vec<Item<'a>> = frame.kids().iter().map(Item::of).collect();
        items.sort_by(|a, b| {
            semantic_order(a.node.layout_options.as_ref())
                .total_cmp(&semantic_order(b.node.layout_options.as_ref()))
                .then_with(|| a.node.id.cmp(&b.node.id))
        });
        let edges = graph.edges.as_deref().unwrap_or_default();
        let joins = joins_of(edges, &mut items);
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
        Block {
            frame,
            framed,
            tab: if framed {
                Point {
                    x: frame.w(),
                    y: frame.h(),
                }
            } else {
                Point { x: 0.0, y: 0.0 }
            },
            first_row: if framed {
                frame.h() + CONTAINER_INSET + FOOT_ROOM
            } else {
                0.0
            },
            items,
            joins,
        }
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

    /// Size a settled grid's rows and columns and stand each part in its cell. A card takes the
    /// whole cell. A door keeps its own size in the cell's middle.
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
        let ys = stations(self.first_row, &heights, std::iter::repeat(CELL_GAP + room));
        let parts = self
            .items
            .iter()
            .zip(&grid.cells)
            .map(|(item, &cell)| {
                let (x, y) = grid.at(cell);
                let cell = Rect {
                    x: xs[x],
                    y: ys[y],
                    width: widths[x],
                    height: heights[y],
                };
                if item.node.option(DOOR).is_some() {
                    middle_of(cell, item.node)
                } else {
                    cell
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

    /// This frame's parts set out in some columns, in the frame's own coordinates.
    fn set_out(&self, columns: usize, room: f64) -> Set {
        let mut grid = Grid::new(columns.min(self.items.len()), self.items.len());
        grid.settle(&self.joins, &self.items);
        self.set(&grid, room)
    }

    /// Stand this frame and its parts on the page.
    fn stand(&self, set: &Set, at: Point, drawing: &mut Placed) {
        let bx = Rect {
            x: at.x,
            y: at.y,
            width: set.size.x,
            height: set.size.y,
        };
        let parts = self
            .items
            .iter()
            .zip(&set.parts)
            .map(|(item, part)| PlacedCard {
                id: item.node.id.clone(),
                bx: Rect {
                    x: at.x + part.x,
                    y: at.y + part.y,
                    ..*part
                },
                depth: 1,
                header: None,
            });
        drawing.cards.extend(parts);
        if self.framed {
            let title = Rect {
                width: self.tab.x,
                height: self.tab.y,
                ..bx
            };
            drawing.titles.push(Title {
                bx: title,
                band: title,
            });
            drawing.frames.push(PlacedCard {
                id: self.frame.id.clone(),
                bx,
                depth: 0,
                header: None,
            });
        }
    }
}

/// A card at its own size in the middle of a cell.
fn middle_of(cell: Rect, node: &Node) -> Rect {
    Rect {
        x: cell.x + (cell.width - node.w()) / 2.0,
        y: cell.y + (cell.height - node.h()) / 2.0,
        width: node.w(),
        height: node.h(),
    }
}

/// Where each frame stands in the whole that the doors stand round, and that whole's size. A row
/// holds every frame. A stack holds rows as wide as its widest frame, and each frame takes the
/// first row with room, so a small frame late in the order fills what a short row leaves.
fn together(sets: &[Set], way: Way) -> (Vec<Point>, Point) {
    let gap = FRAME_GAP + way.room;
    let width = if way.stacked {
        sets.iter().map(|set| set.size.x).fold(0.0, f64::max)
    } else {
        f64::INFINITY
    };
    let mut rows: Vec<Point> = Vec::new();
    let seats: Vec<(usize, f64)> = sets
        .iter()
        .map(|set| {
            let row = rows
                .iter()
                .position(|row| row.x + gap + set.size.x <= width)
                .unwrap_or_else(|| {
                    rows.push(Point { x: -gap, y: 0.0 });
                    rows.len() - 1
                });
            let x = rows[row].x + gap;
            rows[row] = Point {
                x: x + set.size.x,
                y: rows[row].y.max(set.size.y),
            };
            (row, x)
        })
        .collect();
    let tops: Vec<f64> = rows
        .iter()
        .scan(0.0, |top, row| {
            let at = *top;
            *top += row.y + gap;
            Some(at)
        })
        .collect();
    let places = seats
        .into_iter()
        .map(|(row, x)| Point { x, y: tops[row] })
        .collect();
    let size = Point {
        x: rows.iter().map(|row| row.x).fold(0.0, f64::max),
        y: rows.iter().map(|row| row.y + gap).sum::<f64>() - gap,
    };
    (places, size)
}

impl<'a> Reading<'a> {
    fn of(graph: &'a Node) -> Option<Reading<'a>> {
        let blocks: Vec<Block<'a>> = holders(graph)?
            .into_iter()
            .map(|frame| Block::of(graph, frame))
            .collect();
        let framed = blocks.iter().any(|block| block.framed);
        Some(Reading {
            graph,
            blocks,
            doors: graph
                .kids()
                .iter()
                .filter(|node| framed && !node.has_children())
                .collect(),
        })
    }

    /// This reading's drawing, set out one way, with no routes yet.
    fn drawing(&self, sets: &[Set], way: Way) -> Placed {
        let (places, size) = together(sets, way);
        let held = || self.blocks.iter().zip(sets).zip(&places);
        let whole = Set {
            size,
            parts: held()
                .flat_map(|((_, set), at)| {
                    set.parts.iter().map(|part| Rect {
                        x: at.x + part.x,
                        y: at.y + part.y,
                        ..*part
                    })
                })
                .collect(),
        };
        let ring = ring::Ring {
            graph: self.graph,
            frames: held()
                .map(|((block, _), at)| {
                    let tab = Point {
                        x: at.x + block.tab.x / 2.0,
                        y: at.y + block.tab.y / 2.0,
                    };
                    (block.frame.id.as_str(), tab)
                })
                .collect(),
            boxes: held()
                .map(|((_, set), at)| Rect {
                    x: at.x,
                    y: at.y,
                    width: set.size.x,
                    height: set.size.y,
                })
                .collect(),
            set: &whole,
            ids: self
                .blocks
                .iter()
                .flat_map(|block| block.items.iter().map(|item| item.node.id.as_str()))
                .collect(),
            extra: way.room,
            sides: way.sides,
        };
        let page = ring.stand(&self.doors);
        let mut drawing = Placed {
            width: page.width,
            height: page.height,
            cards: Vec::new(),
            frames: Vec::new(),
            regions: Vec::new(),
            edges: Vec::new(),
            titles: Vec::new(),
            routed: None,
        };
        for ((block, set), at) in held() {
            let at = Point {
                x: page.frame.x + at.x,
                y: page.frame.y + at.y,
            };
            block.stand(set, at, &mut drawing);
        }
        drawing.cards.extend(page.doors);
        drawing
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

/// How many frames a dense placement of a reading stands.
pub(super) fn frames(graph: &Node) -> usize {
    holders(graph).map_or(0, |held| held.len())
}

/// Every dense placement of a reading, the most promising first.
pub(super) fn drawings(graph: &Node, room: f64) -> Vec<Placed> {
    let Some(reading) = Reading::of(graph) else {
        return Vec::new();
    };
    let widest = reading.blocks.iter().map(|block| block.items.len()).max();
    let most = MOST_COLUMNS.min(widest.unwrap_or(0));
    let arrangements: &[bool] = if reading.blocks.len() > 1 {
        &[false, true]
    } else {
        &[false]
    };
    let ways = arrangements.iter().flat_map(|&stacked| {
        [false, true].map(|sides| Way {
            room,
            sides,
            stacked,
        })
    });
    let ways: Vec<Way> = ways.collect();
    let mut placed: Vec<(f64, Placed)> = (1..=most)
        .flat_map(|columns| {
            let sets: Vec<Set> = (reading.blocks.iter())
                .map(|block| block.set_out(columns, room))
                .collect();
            let reading = &reading;
            ways.iter()
                .map(move |&way| {
                    let drawing = reading.drawing(&sets, way);
                    (
                        super::reading::promise(&drawing, reading.reach(&drawing)),
                        drawing,
                    )
                })
                .collect::<Vec<_>>()
        })
        .collect();
    placed.sort_by(|a, b| a.0.total_cmp(&b.0));
    // A reading whose doors never take a side gives the same placement both ways.
    placed.dedup_by(|a, b| a.0.total_cmp(&b.0).is_eq());
    let drawings: Vec<Placed> = placed.into_iter().map(|(_, drawing)| drawing).collect();
    let short = |drawing: &Placed| drawing.height <= TALLEST;
    if reading.blocks.len() == 1 && drawings.iter().any(short) {
        return drawings.into_iter().filter(short).collect();
    }
    drawings
}
