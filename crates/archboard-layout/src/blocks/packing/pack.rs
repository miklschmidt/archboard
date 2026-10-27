//! A block of blocks: its items are blocks alone (`nested.rs` gathers its
//! loose cards into a cluster). Measured boxes and estimated routes choose
//! rows or columns before one packing is routed. The router (`trunks.rs`)
//! routes the unlabelled trunks around them. Labels stay inside
//! the child blocks beside their cards. The block's header, own ports and
//! strips are placed in `edges.rs`, and the blocks slid in line with their
//! trunks in `slides.rs`.

use crate::constants::BEND_RADIUS;
use crate::ecma::{abs, js_max, max, min, or, sorted_by};
use crate::geometry::{Point, Rect, Side};
use crate::track::chains::LANE;
use crate::track::scene::{Map, Set};
use crate::track::score::scores_better;

use super::super::headers::{Header, Room, Taken, header_within};
use super::super::laid::{Insets, Laid, LaidMap, Size, moved};
use super::super::lone::frame_width;
use super::super::tree::{Block, BlockTree, Kind, header_of};
use super::super::walls::inner_points;
use super::packings::{Packing, extent_of, packings_of};
use super::trunks::{TRUNK_CLEARANCE, TrunkRouter, room_needed};

/// Room between two packed blocks, for the trunks that pass between them.
pub(crate) const PACK_GAP: f64 = 72.0;
/// Room between a block's header or top ports and the blocks under it.
pub(super) const HEAD_GAP: f64 = 48.0;
/// How far apart two ends may be and still be one straight run.
pub(super) const STRAIGHT: f64 = 0.5;

/// Two pins on blocks of their own that face each other: where both stand,
/// and whether one stands over the other.
pub(super) struct Facing {
    pub one: Point,
    pub other: Point,
    pub upright: bool,
}

/// A block of blocks laid out: packed, and its trunks routed.
pub(crate) struct PackLayout<'t> {
    pub(super) tree: &'t BlockTree,
    pub(super) laid: &'t LaidMap,
    pub(super) block: &'t Block,
    pub(super) insets: Insets,
    pub(super) boxes: Map<String, Rect>,
    pub(super) lines: Map<String, Vec<Point>>,
    /// Where its parent settled its own ports on the top and bottom, by port.
    pub settled: Map<String, f64>,
    /// The width it keeps, once its parent has placed it.
    pub held: f64,
    /// Room between two packed blocks, for the trunks that pass between them.
    pub(super) gap: f64,
    /// Room left of the packed blocks, for trunks that run round the leftmost.
    pub(super) margin: f64,
    /// Space for routes that reach the first row through its top faces.
    outer_top: f64,
    /// The block's header as laid out: at its least size until a packing says how wide the block is.
    pub(super) header: Option<Taken>,
}

/// The least size of a block's header, as laid out before a packing widens it.
fn least_header(block: &Block) -> Option<Taken> {
    block.header.as_ref().map(|header| Taken {
        size: Header::size(header),
        index: None,
    })
}

impl<'t> PackLayout<'t> {
    /// Start the layout of a block of blocks. Both a side port and the packed
    /// block have router buffers: a trunk needs a lane between them to turn
    /// before it reaches the packed block.
    pub(crate) fn new(
        tree: &'t BlockTree,
        laid: &'t LaidMap,
        block: &'t Block,
        insets: Insets,
    ) -> PackLayout<'t> {
        let ports = [Side::Left, Side::Right]
            .into_iter()
            .map(|side| block.ports.values().filter(|&&at| at == side).count())
            .max()
            .unwrap_or(0);
        let insets = if ports > 0 {
            Insets {
                side: js_max(
                    insets.side,
                    (ports + 1) as f64 * LANE + 2.0 * TRUNK_CLEARANCE,
                ),
                ..insets
            }
        } else {
            insets
        };
        PackLayout {
            tree,
            laid,
            block,
            insets,
            boxes: Map::default(),
            lines: Map::default(),
            settled: Map::default(),
            held: 0.0,
            gap: PACK_GAP,
            margin: TRUNK_CLEARANCE,
            outer_top: 0.0,
            header: least_header(block),
        }
    }

    /// A fresh layout of the same block with the same insets.
    fn again(&self) -> PackLayout<'t> {
        PackLayout::new(self.tree, self.laid, self.block, self.insets)
    }

    /// The item a line end stands on: its index, or nothing for the block's own header or port.
    fn item_of(&self, end: &str) -> Option<usize> {
        let pin = self.tree.pins.get(end)?;
        let id = &self.tree.get(pin.block).id;
        self.block.items.iter().position(|item| item == id)
    }

    /// The items in the order their lines run: by the longest run of lines
    /// that leads to each, then in the board's order.
    fn sequence(&self) -> Vec<usize> {
        let count = self.block.items.len();
        let mut rank = vec![0_usize; count];
        let pairs: Vec<(usize, usize)> = self
            .block
            .lines
            .values()
            .filter_map(|line| Some((self.item_of(&line.tail)?, self.item_of(&line.head)?)))
            .filter(|(tail, head)| tail != head)
            .collect();
        for _ in 0..count {
            for &(tail, head) in &pairs {
                rank[head] = rank[head].max(rank[tail] + 1);
            }
        }
        let indices: Vec<usize> = (0..count).collect();
        sorted_by(&indices, |&one, &other| {
            or(
                rank[one] as f64 - rank[other] as f64,
                one as f64 - other as f64,
            )
        })
    }

    /// The items' sizes, by index.
    fn sizes_of(&self, group: &[usize]) -> Vec<Size> {
        group
            .iter()
            .map(|&index| {
                let inner = &self.laid[self.block.items[index].as_str()];
                Size {
                    width: inner.width,
                    height: inner.height,
                }
            })
            .collect()
    }

    /// The size of the items packed one way, without the block's own header, ports and insets.
    pub(super) fn size_of(&self, packing: &Packing) -> Size {
        let extents: Vec<(f64, f64)> = packing
            .groups
            .iter()
            .map(|group| extent_of(&self.sizes_of(group), packing.across, self.gap))
            .collect();
        let long = max(extents.iter().map(|extent| extent.0));
        let deep = extents.iter().fold(0.0, |sum, extent| sum + extent.1)
            + (extents.len() as f64 - 1.0) * self.gap;
        if packing.across {
            Size {
                width: long,
                height: deep,
            }
        } else {
            Size {
                width: deep,
                height: long,
            }
        }
    }

    /// The packings worth laying out: every one whose estimated size fits the
    /// reference pane nearly as well as the best.
    fn packings(&self) -> Vec<Packing> {
        let around = self.head_room() + self.insets.top + self.insets.bottom;
        packings_of(&self.sequence(), |packing| {
            let Size { width, height } = self.size_of(packing);
            Size {
                width: width + 2.0 * self.insets.side,
                height: height + around,
            }
        })
    }

    /// The room above the packed items: the header and top ports, and the gap under them.
    pub(super) fn head_room(&self) -> f64 {
        let header = self.header.map_or(0.0, |header| header.size.height);
        let ports = if self.block.ports.values().any(|&side| side == Side::Top) {
            super::super::leaves::PORT
        } else {
            0.0
        };
        if header > 0.0 || ports > 0.0 || self.outer_top > 0.0 {
            js_max(header, ports) + js_max(self.port_room(Side::Top), self.outer_top)
        } else {
            0.0
        }
    }

    /// Place the items packed one way, with its room, each group centred along
    /// its row or column and aligned across it: rows stand on one top line and
    /// columns on one left edge, so their ports line up.
    fn place(&mut self, packing: &Packing) {
        self.gap = packing.gap.unwrap_or(PACK_GAP);
        self.margin = packing.margin.unwrap_or(TRUNK_CLEARANCE);
        self.header = least_header(self.block);
        self.outer_top = self.top_room(packing);
        let top = self.insets.top + self.head_room();
        let size = self.size_of(packing);
        let length = if packing.across {
            size.width
        } else {
            size.height
        };
        let mut deep = 0.0;
        for group in &packing.groups {
            let sizes = self.sizes_of(group);
            let (long, thick) = extent_of(&sizes, packing.across, self.gap);
            let mut along = (length - long) / 2.0;
            for (&index, item) in group.iter().zip(&sizes) {
                let (x, y) = if packing.across {
                    (along, deep)
                } else {
                    (deep, along)
                };
                self.boxes.insert(
                    self.block.items[index].clone(),
                    Rect {
                        x: self.insets.side + self.margin + x,
                        y: top + y,
                        width: item.width,
                        height: item.height,
                    },
                );
                along += if packing.across {
                    item.width
                } else {
                    item.height
                } + self.gap;
            }
            deep += thick + self.gap;
        }
        self.widen_header(size);
    }

    /// Take the widest size of the block's header that it has room for, once
    /// its items are placed (TASK-486): no wider than what the block holds, so
    /// it widens no block, and left of where each top port wants to stand, so
    /// it pushes none of them aside. The items move up as far as it is shorter.
    fn widen_header(&mut self, size: Size) {
        let Insets { side, top, .. } = self.insets;
        let before = self.head_room();
        let Some(least) = self
            .block
            .header
            .as_ref()
            .filter(|least| least.steps.is_some())
        else {
            return;
        };
        let width = js_max(
            js_max(size.width, least.width) + 2.0 * side + self.margin,
            self.held,
        );
        let edge = (side, width - side);
        let beside: Vec<f64> = self
            .block
            .ports
            .iter()
            .filter(|&(_, &at)| at == Side::Top)
            .map(|(port, _)| self.wanted_x(port, Side::Top, top, edge) - LANE - side)
            .collect();
        self.header = Some(header_within(
            least,
            &Room {
                frame: frame_width(self.block.lone.as_ref(), width),
                content: frame_width(self.block.lone.as_ref(), width),
                beside: &beside,
            },
        ));
        let by = before - self.head_room();
        for one in self.boxes.values_mut() {
            one.y -= by;
        }
    }

    /// Where a pin stands in the block, and the edge of its own block it is on.
    pub(super) fn pin_at(&self, end: &str) -> (Point, Side) {
        let pin = &self.tree.pins[end];
        let inner = self.tree.get(pin.block);
        let at = self.laid[inner.id.as_str()].boxes[pin.port.as_str()];
        let bx = self.boxes[inner.id.as_str()];
        let side = inner.ports[pin.port.as_str()];
        let point = Point {
            x: bx.x + at.x + at.width / 2.0,
            y: bx.y + at.y + at.height / 2.0,
        };
        (point, side)
    }

    /// Move a packed block by a little where a trunk between two pins facing
    /// each other steps sideways by less than its two bends need, when the
    /// block keeps its room from every other: the step would be drawn as a
    /// notch. Each block moves once.
    fn align_pins(&mut self) {
        let mut done: Set<String> = Set::default();
        let lines: Vec<(String, String)> = self
            .block
            .lines
            .values()
            .map(|line| (line.tail.clone(), line.head.clone()))
            .collect();
        for (tail, head) in lines {
            let (Some(one), Some(other)) = (self.tree.pins.get(&tail), self.tree.pins.get(&head))
            else {
                continue;
            };
            let Some(by) = self.step_of(&tail, &head) else {
                continue;
            };
            let back = Point { x: -by.x, y: -by.y };
            let choices = [
                (self.tree.get(other.block).id.clone(), by),
                (self.tree.get(one.block).id.clone(), back),
            ];
            let Some((id, by)) = choices
                .into_iter()
                .find(|(id, by)| !done.contains(id) && self.room_for(id, *by))
            else {
                continue;
            };
            let to = moved(self.boxes[id.as_str()], by);
            self.boxes.insert(id.clone(), to);
            done.insert(id);
        }
    }

    /// How far a trunk steps sideways between two pins facing each other, on
    /// blocks of their own, when the step is too short for its two bends: the
    /// move that brings the lower end's block in line.
    fn step_of(&self, tail: &str, head: &str) -> Option<Point> {
        let Facing {
            one,
            other,
            upright,
        } = self.facing(tail, head)?;
        let step = if upright {
            one.x - other.x
        } else {
            one.y - other.y
        };
        if abs(step) < STRAIGHT || abs(step) >= 2.0 * BEND_RADIUS {
            return None;
        }
        Some(if upright {
            Point { x: step, y: 0.0 }
        } else {
            Point { x: 0.0, y: step }
        })
    }

    /// Two pins on blocks of their own that face each other, over and under or side by side.
    pub(super) fn facing(&self, tail: &str, head: &str) -> Option<Facing> {
        let (one, other) = (self.tree.pins.get(tail)?, self.tree.pins.get(head)?);
        if one.block == other.block {
            return None;
        }
        let ((one, from), (other, to)) = (self.pin_at(tail), self.pin_at(head));
        let upright = match (from, to) {
            (Side::Bottom, Side::Top) | (Side::Top, Side::Bottom) => true,
            (Side::Right, Side::Left) | (Side::Left, Side::Right) => false,
            _ => return None,
        };
        Some(Facing {
            one,
            other,
            upright,
        })
    }

    /// Whether a packed block, moved, keeps the room trunks need between it and every other.
    fn room_for(&self, id: &str, by: Point) -> bool {
        let room = self.gap - 2.0 * LANE;
        let at = moved(self.boxes[id], by);
        self.block
            .items
            .iter()
            .filter(|item| *item != id)
            .map(|item| self.boxes[item.as_str()])
            .all(|other| {
                at.x + at.width + room <= other.x
                    || other.x + other.width + room <= at.x
                    || at.y + at.height + room <= other.y
                    || other.y + other.height + room <= at.y
            })
    }

    /// Estimate each packing from its measured boxes, pins and connections.
    /// Route only the packing with the best estimated cost and page fit.
    /// A parent that keeps a packing reuses that arrangement.
    pub(crate) fn lay(mut self, kept: Option<&Packing>) -> (Laid, Packing) {
        if let Some(kept) = kept {
            let laid = self.lay_out(kept);
            return self.widened(laid, kept);
        }
        let mut best = None;
        for mut packing in self.packings() {
            packing.aligned = true;
            let mut layout = self.again();
            let (width, _, low, _) = layout.prepare(&packing);
            let estimate = TrunkRouter {
                block: layout.block,
                laid: layout.laid,
                tree: layout.tree,
                boxes: &layout.boxes,
            }
            .estimate(width, low + layout.insets.bottom);
            if best
                .as_ref()
                .is_none_or(|(_, weighed)| scores_better(&estimate, weighed))
            {
                best = Some((packing, estimate));
            }
        }
        let (packing, _) = best.expect("a packing is estimated");
        let laid = self.lay_out(&packing);
        self.widened(laid, &packing)
    }

    /// Where the packed items stand, packed one way.
    pub(super) fn extent_of(&self, packing: &Packing) -> Rect {
        let Size { width, height } = self.size_of(packing);
        Rect {
            x: self.insets.side + self.margin,
            y: self.insets.top + self.head_room(),
            width,
            height,
        }
    }

    /// Route the chosen packing with enough room between its trunks: widen
    /// gaps whose trunks crowd closer than a lane, and keep the left wall inset.
    /// The layout is the one this laid out with the packing.
    fn widened(&self, laid: Laid, packing: &Packing) -> (Laid, Packing) {
        let boxes: Vec<Rect> = self
            .block
            .items
            .iter()
            .map(|id| self.boxes[id.as_str()])
            .collect();
        let lines: Vec<&[Point]> = self.lines.values().map(Vec::as_slice).collect();
        let room = room_needed(&boxes, &lines, self.gap);
        let inner = if self.block.kind == Kind::Root {
            self.lines.values().flatten().copied().collect()
        } else {
            inner_points(self.block, &self.lines)
        };
        let short = js_max(
            0.0,
            self.insets.side - min(inner.iter().map(|point| point.x)),
        );
        if room <= self.gap && short == 0.0 {
            return (laid, packing.clone());
        }
        let mut again = self.again();
        again.settled.clone_from(&self.settled);
        again.held = self.held;
        let wider = Packing {
            gap: Some(js_max(room, self.gap)),
            margin: Some(packing.margin.unwrap_or(TRUNK_CLEARANCE) + short),
            ..packing.clone()
        };
        let laid = again.lay_out(&wider);
        (laid, wider)
    }

    /// Place the measured boxes and graph pins before routing.
    fn prepare(&mut self, packing: &Packing) -> (f64, f64, f64, bool) {
        self.place(packing);
        self.align_pins();
        if packing.aligned {
            let extent = self.extent_of(packing);
            self.slide_to_trunks(packing.across, extent);
        }
        let size = self.size_of(packing);
        let Insets { side, top, .. } = self.insets;
        let header = self.header.map_or(0.0, |header| header.size.width);
        let width = js_max(
            js_max(js_max(size.width, header), self.block.port_width(header))
                + 2.0 * side
                + self.margin,
            self.held,
        );
        let ended = self.block.ports.values().any(|&at| at == Side::Bottom);
        let items = top + self.head_room();
        let low = items
            + size.height
            + if ended {
                self.port_room(Side::Bottom)
            } else {
                0.0
            };
        self.place_edges(width, top, low);
        (width, items, low, ended)
    }

    /// Route the one chosen arrangement.
    fn lay_out(&mut self, packing: &Packing) -> Laid {
        let (width, items, low, ended) = self.prepare(packing);
        let side = self.insets.side;
        self.route();
        let bottom = self.close_strips(items, low, ended);
        let reach = self
            .boxes
            .values()
            .map(|one| Point {
                x: one.x + one.width,
                y: one.y + one.height,
            })
            .chain(self.lines.values().flatten().copied());
        let (right, foot) = reach.fold((width, bottom), |(right, foot), point| {
            (js_max(right, point.x + side), js_max(foot, point.y))
        });
        let height = if ended {
            let boxes = self
                .boxes
                .iter()
                .filter(|(id, _)| self.block.ports.get(id.as_str()) != Some(&Side::Bottom))
                .map(|(_, one)| one.y + one.height);
            let points = inner_points(self.block, &self.lines);
            let body = max(boxes.chain(points.iter().map(|point| point.y)));
            js_max(foot, body + super::super::place::insets_of(self.block).side)
        } else {
            foot + self.insets.bottom
        };
        Laid {
            width: right,
            height,
            boxes: self.boxes.clone(),
            lines: self.lines.clone(),
            header: self.header.and_then(|header| header.index),
            ..Laid::default()
        }
    }

    /// The id of the block's header item.
    pub(super) fn header_id(&self) -> String {
        header_of(self.block)
    }
}
