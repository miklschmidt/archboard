//! Space reserved from the graph before a packing is routed.
use super::pack::{HEAD_GAP, PackLayout};
use super::packings::Packing;
use super::trunks::TRUNK_CLEARANCE;
use crate::ecma::js_max;
use crate::geometry::Side;
use crate::track::chains::LANE;
use crate::track::scene::Set;

impl PackLayout<'_> {
    /// Space for the distinct trunks between an own face and the packed items.
    pub(super) fn port_room(&self, side: Side) -> f64 {
        let ports = self.block.ports.values().filter(|&&on| on == side).count();
        let headed = if side == Side::Top {
            let header = self.header_id();
            self.block
                .lines
                .values()
                .filter(|line| line.from == header || line.to == header)
                .count()
        } else {
            0
        };
        js_max(
            HEAD_GAP,
            (ports + headed) as f64 * LANE + 2.0 * TRUNK_CLEARANCE,
        )
    }

    /// Whether an end is on the top face of a block in the first row.
    fn on_top(&self, end: &str, items: &Set<&str>) -> bool {
        self.tree.pins.get(end).is_some_and(|pin| {
            let block = self.tree.get(pin.block);
            items.contains(block.id.as_str()) && block.ports.get(&pin.port) == Some(&Side::Top)
        })
    }

    /// Reserve lanes for the distinct graph connections above the first row.
    pub(super) fn top_room(&self, packing: &Packing) -> f64 {
        let indices: Vec<usize> = if packing.across {
            packing.groups[0].clone()
        } else {
            packing
                .groups
                .iter()
                .filter_map(|group| group.first().copied())
                .collect()
        };
        let items: Set<&str> = indices
            .iter()
            .map(|&index| self.block.items[index].as_str())
            .collect();
        let lines: Vec<_> = self
            .block
            .lines
            .values()
            .filter(|line| self.on_top(&line.from, &items) || self.on_top(&line.to, &items))
            .collect();
        if lines.is_empty() {
            return 0.0;
        }
        let sources: Set<String> = lines
            .iter()
            .map(|line| {
                format!(
                    "{}|{}",
                    line.source.as_deref().unwrap_or(&line.key),
                    crate::track::route::trunk_kind(&line.edge)
                )
            })
            .collect();
        let targets: Set<String> = lines
            .iter()
            .map(|line| {
                format!(
                    "{}|{}",
                    line.target.as_deref().unwrap_or(&line.key),
                    crate::track::route::trunk_kind(&line.edge)
                )
            })
            .collect();
        sources.len().min(targets.len()) as f64 * LANE + 2.0 * TRUNK_CLEARANCE
    }
}
