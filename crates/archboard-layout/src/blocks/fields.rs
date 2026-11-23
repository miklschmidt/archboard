//! A child block as a Lanes drawing ranks it: a record whose fields are the
//! ports on its top and bottom faces, in the order its own layout stands them.
//! A line to one of those ports aims at its field, so Graphviz orders the cards
//! outside the block by where their lines enter it, and stands each over its
//! port. Blocks' own layouts rank a child block as a plain box.

use crate::geometry::Side;
use crate::viz::Value;

use super::card_layout::CardLayout;

impl CardLayout<'_> {
    /// The ports on one face of a child block, left to right.
    fn faced(&self, child: &str, side: Side) -> Vec<&String> {
        let (Some(id), Some(laid)) = (self.tree.block_of(child), self.laid.get(child)) else {
            return Vec::new();
        };
        let mut ports: Vec<&String> = self
            .tree
            .get(id)
            .ports
            .iter()
            .filter(|&(port, &at)| at == side && laid.boxes.contains_key(port))
            .map(|(port, _)| port)
            .collect();
        ports.sort_by(|one, other| {
            laid.boxes[one.as_str()]
                .x
                .total_cmp(&laid.boxes[other.as_str()].x)
        });
        ports
    }

    /// The record a child block is ranked as, top ports in a row over bottom
    /// ports; none outside a Lanes drawing, or for a block with no such port.
    pub(super) fn record_of(&self, child: &str) -> Option<Value> {
        if !self.tree.lanes {
            return None;
        }
        let row = |side: Side, mark: char| {
            let fields: Vec<String> = (0..self.faced(child, side).len())
                .map(|at| format!("<{mark}{at}>"))
                .collect();
            fields.join("|")
        };
        let (tops, bottoms) = (row(Side::Top, 't'), row(Side::Bottom, 'b'));
        (!tops.is_empty() || !bottoms.is_empty())
            .then(|| Value::from(format!("{{{{{tops}}}|{{{bottoms}}}}}")))
    }

    /// The field a line end aims at, with the face it meets: the field of the
    /// port a pin stands on, in a Lanes drawing.
    pub(super) fn field_of(&self, end: &str) -> Option<String> {
        if !self.tree.lanes {
            return None;
        }
        let pin = self.tree.pins.get(end)?;
        let child = &self.tree.get(pin.block).id;
        let (mark, face) = match self.tree.get(pin.block).ports.get(&pin.port)? {
            Side::Top => ('t', 'n'),
            Side::Bottom => ('b', 's'),
            Side::Left | Side::Right => return None,
        };
        let side = if mark == 't' { Side::Top } else { Side::Bottom };
        let at = self
            .faced(child, side)
            .iter()
            .position(|port| **port == pin.port)?;
        Some(format!("{mark}{at}:{face}"))
    }
}
