//! A block's placement read back as a scene (TASK-349): cards and label boxes
//! as items, grouped into bands by the rank they sit on.

use archboard_scene::geometry::Rect;
use indexmap::{IndexMap, IndexSet};
use rustc_hash::FxBuildHasher;

use crate::ecma::{self, max, min, round};
use crate::placed::{PlacedBlock, PlacedEdge, PlacedNode};

/// An insertion-ordered map, as a `Map` of ECMAScript is.
pub(crate) type Map<K, V> = IndexMap<K, V, FxBuildHasher>;
/// An insertion-ordered set, as a `Set` of ECMAScript is.
pub(crate) type Set<K> = IndexSet<K, FxBuildHasher>;

/// The band of an item not yet grouped into one.
pub(crate) const NO_BAND: usize = usize::MAX;

/// An item of the scene, by the place it is kept: the identity a `Map` of
/// items keys it by.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub(crate) struct ItemId(pub usize);

/// Something that sits on a band: a card or a label box; a label box may slide.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Item {
    pub bx: Rect,
    pub band: usize,
    /// How far a card's own faces stand in from its box, for a card laid out as its region.
    pub inset: Option<f64>,
    /// Reserved caption room at the start of its top face.
    pub top_inset: f64,
    /// How far below the item's top its visible card face starts.
    pub face_top: f64,
}

impl Item {
    /// An item on a band.
    pub(crate) fn new(bx: Rect, band: usize) -> Item {
        Item {
            bx,
            band,
            inset: None,
            top_inset: 0.0,
            face_top: 0.0,
        }
    }
}

/// The stretch of an item's box its own face spans: all of it, but for a card
/// laid out as the region round it, whose face stands in from the box.
pub(crate) fn card_face(item: &Item) -> Rect {
    let inset = item.inset.unwrap_or(0.0);
    Rect {
        x: item.bx.x + inset,
        width: item.bx.width - 2.0 * inset,
        ..item.bx
    }
}

/// An item's horizontal centre.
pub(crate) fn centre_x(item: &Item) -> f64 {
    item.bx.x + item.bx.width / 2.0
}

/// The centre height a band groups an item by, rounded to half a point.
fn centre_key(item: &Item) -> f64 {
    round((item.bx.y + item.bx.height / 2.0) * 2.0) / 2.0
}

/// One band: the items on one rank, and where it lies before and after spacing.
#[derive(Clone, Copy, Debug)]
pub(crate) struct Band {
    pub top: f64,
    pub bottom: f64,
    pub new_top: f64,
    /// How far below it the first track of the channel under it runs, once spaced.
    pub first_track: f64,
}

/// The placed block read back into items and bands.
#[derive(Clone, Debug, Default)]
pub(crate) struct Placement {
    pub items: Vec<Item>,
    pub cards: Map<String, ItemId>,
    pub labels: Map<String, ItemId>,
    pub bands: Vec<Band>,
    /// The blocks of group regions packed whole among the scene's cards.
    pub region_blocks: Set<ItemId>,
    /// The stretch of each band that a line drawn straight from a card's side
    /// to the block's wall runs along, by band.
    pub besides: Map<usize, Vec<(f64, f64)>>,
}

impl Placement {
    /// Read every placed item and group them into bands by their centres.
    pub(crate) fn new(placed: &PlacedBlock) -> Placement {
        let mut scene = Placement::default();
        scene.read_cards(&placed.nodes);
        scene.read_labels(&placed.edges);
        let grouped: Vec<ItemId> = scene
            .cards
            .values()
            .chain(scene.labels.values())
            .copied()
            .collect();
        scene.group_bands(&grouped);
        // A card stands at the top of its band, so the cards of a row line up.
        let cards: Vec<ItemId> = scene.cards.values().copied().collect();
        for card in cards {
            let top = scene.bands[scene.item(card).band].top;
            scene.item_mut(card).bx.y = top;
        }
        scene
    }

    /// An item.
    pub(crate) fn item(&self, id: ItemId) -> &Item {
        &self.items[id.0]
    }

    /// An item, to change.
    pub(crate) fn item_mut(&mut self, id: ItemId) -> &mut Item {
        &mut self.items[id.0]
    }

    /// Keep a new item.
    pub(crate) fn add(&mut self, item: Item) -> ItemId {
        self.items.push(item);
        ItemId(self.items.len() - 1)
    }

    /// Read every placed card.
    fn read_cards(&mut self, nodes: &[PlacedNode]) {
        for node in nodes {
            let id = self.add(Item::new(
                Rect {
                    x: node.x,
                    y: node.y,
                    width: node.width,
                    height: node.height,
                },
                NO_BAND,
            ));
            self.cards.insert(node.id.clone(), id);
        }
    }

    /// Read every relationship's placed label box.
    fn read_labels(&mut self, edges: &[PlacedEdge]) {
        for edge in edges {
            if let Some(label) = edge.label {
                let id = self.add(Item::new(label, NO_BAND));
                self.labels.insert(edge.id.clone(), id);
            }
        }
    }

    /// Group items into bands, one per distinct centre height, top to bottom.
    fn group_bands(&mut self, items: &[ItemId]) {
        let mut grouped: Map<u64, (f64, Vec<ItemId>)> = Map::default();
        for &id in items {
            let centre = centre_key(self.item(id));
            let (_, on) = grouped
                .entry(ecma::number_key(centre))
                .or_insert_with(|| (centre, Vec::new()));
            // A nonnumeric centre has a band, but no item compares equal to it.
            if !centre.is_nan() {
                on.push(id);
            }
        }
        let mut groups: Vec<_> = grouped.into_values().collect();
        ecma::sort_by(&mut groups, |one, other| one.0 - other.0);
        for (_, on) in groups {
            let band = self.bands.len();
            for &id in &on {
                self.item_mut(id).band = band;
            }
            self.bands.push(Band {
                top: min(on.iter().map(|&id| self.item(id).bx.y)),
                bottom: max(on.iter().map(|&id| {
                    let bx = self.item(id).bx;
                    bx.y + bx.height
                })),
                new_top: 0.0,
                first_track: 0.0,
            });
        }
    }

    /// The item a relationship ends at: a card.
    pub(crate) fn endpoint(&self, id: &str) -> ItemId {
        self.cards
            .get(id)
            .copied()
            .unwrap_or_else(|| panic!("A placement omitted endpoint {id}"))
    }

    /// An item's box after its band moved.
    pub(crate) fn moved(&self, item: &Item, left: f64) -> Rect {
        let band = &self.bands[item.band];
        Rect {
            x: item.bx.x + left,
            y: item.bx.y - band.top + band.new_top,
            width: item.bx.width,
            height: item.bx.height,
        }
    }

    /// An item's box after its band moved, by id.
    pub(crate) fn moved_id(&self, id: ItemId, left: f64) -> Rect {
        self.moved(self.item(id), left)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bands_follow_rounded_centres_and_span_every_item_on_the_rank() {
        let mut scene = Placement::default();
        let items: Vec<ItemId> = [(100.0, 20.0), (0.0, 20.0), (101.125, 18.0), (-5.0, 10.0)]
            .into_iter()
            .map(|(y, height)| {
                scene.add(Item::new(
                    Rect {
                        x: 0.0,
                        y,
                        width: 40.0,
                        height,
                    },
                    NO_BAND,
                ))
            })
            .collect();
        scene.group_bands(&items);
        let ranks: Vec<usize> = items.iter().map(|&id| scene.item(id).band).collect();
        assert_eq!(ranks, [2, 1, 2, 0]);
        let bounds: Vec<(f64, f64)> = scene
            .bands
            .iter()
            .map(|band| (band.top, band.bottom))
            .collect();
        assert_eq!(bounds, [(-5.0, 5.0), (0.0, 20.0), (100.0, 120.0)]);
    }
}
