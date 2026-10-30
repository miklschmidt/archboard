//! A packed block slid along its row or column to stand over or under the
//! blocks its lines reach, where packing centred it on the row instead: its
//! lines then drop straight rather than stepping across the gap.

use crate::ecma::{abs, js_max, js_min, max, min};
use crate::geometry::{Point, Rect};
use crate::track::chains::LANE;

use super::super::laid::{SAME, moved};
use super::super::tree::Line;
use super::pack::{Facing, PackLayout, STRAIGHT};

/// Where a line leaves a packed block and where it reaches another whose pins
/// face it: its pin on the block, the other's, and whether they face over and under.
struct Faced {
    mine: Point,
    theirs: Point,
    upright: bool,
}

impl PackLayout<'_> {
    /// The packed block a line end stands on, when it is a pin on one.
    fn owner_of(&self, end: &str) -> Option<&str> {
        let pin = self.tree.pins.get(end)?;
        Some(self.tree.get(pin.block).id.as_str())
    }

    /// Where a line leaves a packed block and where it reaches another, when
    /// it joins the block to another whose pins face each other.
    fn faced(&self, id: &str, line: &Line) -> Option<Faced> {
        let owners = [self.owner_of(&line.tail), self.owner_of(&line.head)];
        if !owners.contains(&Some(id)) {
            return None;
        }
        let Facing {
            one,
            other,
            upright,
        } = self.facing(&line.tail, &line.head)?;
        Some(if owners[1] == Some(id) {
            Faced {
                mine: other,
                theirs: one,
                upright,
            }
        } else {
            Faced {
                mine: one,
                theirs: other,
                upright,
            }
        })
    }

    /// How far each line between a packed block and another, their pins
    /// facing each other across the way the packing is read, steps sideways
    /// from it; nothing when a line faces the other way.
    fn steps_of(&self, id: &str, across: bool) -> Option<Vec<f64>> {
        let pairs: Vec<Faced> = self
            .block
            .lines
            .values()
            .filter_map(|line| self.faced(id, line))
            .collect();
        if pairs.iter().any(|pair| pair.upright != across) {
            return None;
        }
        Some(
            pairs
                .iter()
                .map(|pair| {
                    if across {
                        pair.theirs.x - pair.mine.x
                    } else {
                        pair.theirs.y - pair.mine.y
                    }
                })
                .collect(),
        )
    }

    /// How far a packed block slides to stand in line with the blocks its
    /// lines reach: their steps' mean, when they agree to within a lane.
    fn slide_of(&self, id: &str, across: bool) -> Option<Point> {
        let steps = self.steps_of(id, across).unwrap_or_default();
        let spread = max(steps.iter().copied()) - min(steps.iter().copied());
        if steps.is_empty() || spread > LANE {
            return None;
        }
        let step = steps.iter().fold(0.0, |sum, one| sum + one) / steps.len() as f64;
        if abs(step) < STRAIGHT {
            return None;
        }
        Some(if across {
            Point { x: step, y: 0.0 }
        } else {
            Point { x: 0.0, y: step }
        })
    }

    /// Whether a packed block may slide: it stays within the packed items'
    /// extent, so the block never grows, and what it sweeps through keeps the
    /// room trunks need from every other, so it never jumps a neighbour.
    fn slides(&self, id: &str, by: Point, extent: Rect) -> bool {
        let from = self.boxes[id];
        let to = moved(from, by);
        let inside = to.x >= extent.x - SAME
            && to.x + to.width <= extent.x + extent.width + SAME
            && to.y >= extent.y - SAME
            && to.y + to.height <= extent.y + extent.height + SAME;
        let room = self.gap - 2.0 * LANE;
        let (low, high) = (js_min(from.x, to.x), js_max(from.x, to.x) + from.width);
        let (top, bottom) = (js_min(from.y, to.y), js_max(from.y, to.y) + from.height);
        inside
            && self
                .block
                .items
                .iter()
                .filter(|item| *item != id)
                .map(|item| self.boxes[item.as_str()])
                .all(|other| {
                    high + room <= other.x
                        || other.x + other.width + room <= low
                        || bottom + room <= other.y
                        || other.y + other.height + room <= top
                })
    }

    /// Slide each packed block whose lines across the way the packing is read
    /// all step the same way to stand in line with the blocks they reach,
    /// where it may. Answers whether any block slid.
    pub(super) fn slide_to_trunks(&mut self, across: bool, extent: Rect) -> bool {
        let mut slid = false;
        for id in self.block.items.clone() {
            let Some(by) = self.slide_of(&id, across) else {
                continue;
            };
            if !self.slides(&id, by, extent) {
                continue;
            }
            let to = moved(self.boxes[id.as_str()], by);
            self.boxes.insert(id, to);
            slid = true;
        }
        slid
    }
}
