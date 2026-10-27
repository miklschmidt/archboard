//! The order a block of cards holds its ports in on a face. A block of cards is
//! laid out before its parent, so Graphviz orders the ports on its top and
//! bottom, and the cards and labels under them, from its own lines alone.
//! Settling then stands each port where its trunk's other end wants it, which
//! can swap two of them; the block is routed again with its ports moved, but
//! its cards and labels keep the old order, so the lines cross inside it. The
//! ports settling swaps are held in its order on a second layout.

use crate::ecma::sort_by;
use crate::geometry::{Rect, Side};
use crate::track::scene::Map;

use super::laid::Laid;
use super::settle::{Settling, settled_ports};

/// A box's middle across.
fn middle_of(at: &Rect) -> f64 {
    at.x + at.width / 2.0
}

/// The ports that stand on the other side of some other port once settled
/// than where the block laid them, in their settled order.
fn inverted(ports: &[(&String, f64)], laid: &Laid) -> Vec<String> {
    let was: Map<&str, f64> = ports
        .iter()
        .map(|(port, _)| (port.as_str(), middle_of(&laid.boxes[port.as_str()])))
        .collect();
    let mut swapped: Vec<(&String, f64)> = ports
        .iter()
        .copied()
        .filter(|&(port, x)| {
            ports.iter().any(|&(other, at)| {
                other != port && (x - at) * (was[port.as_str()] - was[other.as_str()]) < 0.0
            })
        })
        .collect();
    sort_by(&mut swapped, |one, other| one.1 - other.1);
    swapped.into_iter().map(|(port, _)| port.clone()).collect()
}

/// The ports on each face of a block that settling stands in another order
/// than the block's own layout, in the order settling stands them, keyed
/// `block|face`, where two or more are. Nothing is changed.
pub(crate) fn held_orders(settling: &Settling<'_>) -> Map<String, Vec<String>> {
    let mut orders = Map::default();
    for (id, ports) in settled_ports(settling) {
        let block = settling.tree.get(id);
        for face in [Side::Top, Side::Bottom] {
            let on_face: Vec<(&String, f64)> = ports
                .iter()
                .filter(|(port, _)| {
                    block.ports.get(port.as_str()) == Some(&face) && !block.header_entry(port)
                })
                .map(|(port, &x)| (port, x))
                .collect();
            let swapped = inverted(&on_face, &settling.laid[block.id.as_str()]);
            if swapped.len() > 1 {
                orders.insert(format!("{}|{}", block.id, face.name()), swapped);
            }
        }
    }
    orders
}
