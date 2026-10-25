//! A block's placement read back as a scene (TASK-349): cards, label boxes and
//! frame title rows as items, grouped into bands by the rank they sit on. The
//! placed block carries each relationship's polyline, each frame's title row
//! and every group region.

use std::cell::RefCell;
use std::rc::Rc;

use archboard_scene::geometry::Rect;
use indexmap::{IndexMap, IndexSet};
use rustc_hash::{FxBuildHasher, FxHashMap};

use crate::ecma::{self, max, min, round, via_text};
use crate::placed::{PlacedBlock, PlacedEdge, PlacedNode};

/// An insertion-ordered map, as a `Map` of ECMAScript is.
pub(crate) type Map<K, V> = IndexMap<K, V, FxBuildHasher>;
/// An insertion-ordered set, as a `Set` of ECMAScript is.
pub(crate) type Set<K> = IndexSet<K, FxBuildHasher>;

/// How far a region's caption sits in from its band's left edge.
pub(crate) const REGION_CAPTION_INSET: f64 = 6.0;
/// How far below a region's top edge a label box in its caption row keeps.
const ROW_MARGIN: f64 = 4.0;

/// The band of an item not yet grouped into one.
pub(crate) const NO_BAND: usize = usize::MAX;

/// An item of the scene, by the place it is kept: the identity a `Map` of
/// items keys it by.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub(crate) struct ItemId(pub usize);

/// Something that sits on a band: a card, a label box or a frame's title row; a label box may slide.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Item {
    pub bx: Rect,
    pub band: usize,
    /// How far a card's own faces stand in from its box, for a card laid out as its region.
    pub inset: Option<f64>,
}

impl Item {
    /// An item on a band.
    pub(crate) fn new(bx: Rect, band: usize) -> Item {
        Item {
            bx,
            band,
            inset: None,
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

/// A size a frame's title row can take: how far its words reach in, and how tall it stands.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct TitleStep {
    pub words: f64,
    pub height: f64,
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

/// Where a station of a line stands: its band and its x.
#[derive(Clone, Copy, Debug)]
pub(crate) struct Spot {
    pub band: usize,
    pub x: f64,
}

/// A frame: its placed node, its depth and every card or frame inside it.
#[derive(Clone, Debug)]
pub(crate) struct Frame {
    pub x: f64,
    pub width: f64,
    /// The region's inset it keeps below what it holds, laid out as its lone region.
    pub below: Option<f64>,
    /// How wide its lone region's caption needs it.
    pub wide: Option<f64>,
    pub depth: usize,
    pub members: Vec<String>,
}

/// A group region: Graphviz's cluster box, its caption row and the nodes it gathers.
#[derive(Clone, Debug)]
pub(crate) struct Region {
    pub group: String,
    pub parent: Option<String>,
    pub members: Vec<String>,
    pub x: f64,
    pub width: f64,
    pub caption: ItemId,
}

/// A title row's or caption's painted words.
#[derive(Clone, Copy, Debug)]
pub(crate) struct Heading {
    pub band: usize,
    pub left: f64,
    pub end: f64,
    pub walls: (f64, f64),
}

/// Each frame and region a band passes through, by id, with its walls.
pub(crate) type Walls = Rc<Map<String, (f64, f64)>>;

/// The placed hierarchy read back into items, bands and frames.
#[derive(Clone, Debug, Default)]
pub(crate) struct Placement {
    pub items: Vec<Item>,
    pub cards: Map<String, ItemId>,
    pub labels: Map<String, ItemId>,
    pub titles: Map<String, ItemId>,
    /// How far each title row's words reach in from its left edge.
    pub words: FxHashMap<ItemId, f64>,
    /// Each size a title row can take, narrowest first; none where it has one size.
    pub steps: FxHashMap<ItemId, Vec<TitleStep>>,
    /// Which of its sizes each frame's title row took, by frame, where it took a wider one.
    pub headers: Map<String, usize>,
    pub frames: Map<String, Frame>,
    /// Each band's frame and region walls, once asked for.
    walls: RefCell<FxHashMap<usize, Walls>>,
    pub regions: Vec<Region>,
    pub bands: Vec<Band>,
    /// A block's own ports that may still slide along its top or bottom edge,
    /// each with the stretch it may stand on.
    pub slides: Map<ItemId, (f64, f64)>,
    /// The blocks of group regions packed whole among the scene's cards.
    pub region_blocks: Set<ItemId>,
    /// Whether the scene's sides are the page's: the whole board drawn inline.
    pub edges_page: bool,
    /// Whether the scene is drawn by the Track engine, its containers and regions inline.
    pub inline: bool,
    /// The stretch of each band that a line drawn straight from a card's side
    /// to the block's wall runs along, by band.
    pub besides: Map<usize, Vec<(f64, f64)>>,
}

/// A frame's title row, as its placed node carries it, and how far in from
/// its left edge the title's words reach.
fn title_row(node: &PlacedNode) -> Option<(Item, f64, Vec<TitleStep>, f64)> {
    let frame = node.frame.as_ref()?;
    let [x, y, width, height, words] = frame.title.map(via_text);
    let inset = frame.below.map_or(0.0, via_text);
    let mut item = Item::new(
        Rect {
            x,
            y,
            width,
            height,
        },
        NO_BAND,
    );
    if inset > 0.0 {
        item.inset = Some(inset);
    }
    let steps = frame
        .steps
        .as_ref()
        .map(|rows| {
            rows.iter()
                .map(|&(reach, tall)| TitleStep {
                    words: via_text(reach),
                    height: via_text(tall),
                })
                .collect()
        })
        .unwrap_or_default();
    Some((item, words, steps, inset))
}

impl Placement {
    /// Read every placed item and group them into bands by their centres.
    pub(crate) fn new(placed: &PlacedBlock) -> Placement {
        let mut scene = Placement::default();
        scene.visit(&placed.children, 0, &[]);
        scene.read_labels(&placed.edges);
        scene.read_regions(placed);
        let heads: Vec<ItemId> = scene
            .titles
            .values()
            .copied()
            .chain(scene.regions.iter().map(|region| region.caption))
            .collect();
        let grouped: Vec<ItemId> = scene
            .cards
            .values()
            .chain(scene.labels.values())
            .copied()
            .chain(heads.iter().copied())
            .collect();
        scene.group_bands(&grouped);
        // A card stands at the top of its band, so the cards of a row line up.
        let cards: Vec<ItemId> = scene.cards.values().copied().collect();
        for card in cards {
            let top = scene.bands[scene.item(card).band].top;
            scene.item_mut(card).bx.y = top;
        }
        // A title row or caption sits at the foot of its band, on the cards it heads.
        for head in heads {
            let item = *scene.item(head);
            scene.item_mut(head).bx.y = scene.bands[item.band].bottom - item.bx.height;
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

    /// Read every group region placement wrote on the root.
    fn read_regions(&mut self, placed: &PlacedBlock) {
        for row in &placed.regions {
            let [bx, _, bw, _] = row.bx.map(via_text);
            let [_, y, width, height] = row.caption.map(via_text);
            // The caption reads from the band's top-left corner, as a frame's title does.
            let x = bx + REGION_CAPTION_INSET;
            let caption = self.add(Item::new(
                Rect {
                    x,
                    y,
                    width,
                    height,
                },
                NO_BAND,
            ));
            self.regions.push(Region {
                group: row.group.clone(),
                parent: row.parent.clone(),
                members: row.members.clone(),
                x: bx,
                width: bw,
                caption,
            });
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
        let keys: Vec<f64> = items.iter().map(|&id| centre_key(self.item(id))).collect();
        let centres = ecma::sorted_by(&ecma::unique(&keys), |one, other| one - other);
        for centre in centres {
            let on: Vec<ItemId> = items
                .iter()
                .zip(&keys)
                .filter(|&(_, key)| *key == centre)
                .map(|(&id, _)| id)
                .collect();
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

    /// Read cards, frames and title rows, keeping each frame's members.
    fn visit(&mut self, nodes: &[PlacedNode], depth: usize, frames: &[String]) {
        for node in nodes {
            for frame in frames {
                self.frames
                    .get_mut(frame)
                    .expect("an enclosing frame")
                    .members
                    .push(node.id.clone());
            }
            let Some((item, words, steps, _)) = title_row(node) else {
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
                continue;
            };
            let id = self.add(item);
            self.titles.insert(node.id.clone(), id);
            self.words.insert(id, words);
            self.steps.insert(id, steps);
            let row = node.frame.as_ref().expect("a frame");
            self.frames.insert(
                node.id.clone(),
                Frame {
                    x: node.x,
                    width: node.width,
                    below: row.below.map(via_text),
                    wide: row.wide.map(via_text),
                    depth,
                    members: Vec::new(),
                },
            );
            let mut within = frames.to_vec();
            within.push(node.id.clone());
            if let Some(children) = &node.children {
                self.visit(children, depth + 1, &within);
            }
        }
    }

    /// The item a relationship ends at: a card, or a frame's title row.
    pub(crate) fn endpoint(&self, id: &str) -> ItemId {
        self.cards
            .get(id)
            .or_else(|| self.titles.get(id))
            .copied()
            .unwrap_or_else(|| panic!("Track placement omitted endpoint {id}"))
    }

    /// The card or title row of a member, if the scene holds it.
    pub(crate) fn member(&self, id: &str) -> Option<ItemId> {
        self.cards.get(id).or_else(|| self.titles.get(id)).copied()
    }

    /// Every title row's and caption's painted words.
    pub(crate) fn headings(&self) -> Vec<Heading> {
        let titles = self.titles.iter().map(|(id, &item)| {
            let frame = &self.frames[id];
            let row = self.item(item);
            Heading {
                band: row.band,
                left: row.bx.x,
                end: row.bx.x + self.words[&item],
                walls: (frame.x, frame.x + frame.width),
            }
        });
        let captions = self.regions.iter().map(|region| {
            let caption = self.item(region.caption);
            Heading {
                band: caption.band,
                left: caption.bx.x,
                end: caption.bx.x + caption.bx.width,
                walls: (region.x, region.x + region.width),
            }
        });
        titles.chain(captions).collect()
    }

    /// What a label box keeps clear of on its band for each group region
    /// heading it: the caption's words, and the whole caption row when the box
    /// would reach above the region's top edge there.
    pub(crate) fn captions_for(&self, label: &Item) -> Vec<Item> {
        self.regions
            .iter()
            .filter(|region| self.item(region.caption).band == label.band)
            .map(|region| {
                let caption = *self.item(region.caption);
                if label.bx.y >= caption.bx.y + ROW_MARGIN {
                    caption
                } else {
                    Item::new(
                        Rect {
                            x: region.x,
                            width: region.width,
                            ..caption.bx
                        },
                        caption.band,
                    )
                }
            })
            .collect()
    }

    /// The title band of every group region a label box reaches down into.
    pub(crate) fn title_bands_for(&self, label: &Item) -> Vec<Item> {
        let (top, bottom) = (label.bx.y, label.bx.y + label.bx.height);
        self.regions
            .iter()
            .filter(|region| {
                let caption = self.item(region.caption);
                caption.band == label.band
                    && top < caption.bx.y + caption.bx.height + ROW_MARGIN
                    && bottom > caption.bx.y - ROW_MARGIN
            })
            .map(|region| {
                let caption = self.item(region.caption);
                Item::new(
                    Rect {
                        x: region.x,
                        width: region.width,
                        ..caption.bx
                    },
                    caption.band,
                )
            })
            .collect()
    }

    /// The band of a member's card or title row, zero where the scene lacks it.
    fn band_of(&self, id: &str) -> f64 {
        self.member(id)
            .map_or(0.0, |item| self.item(item).band as f64)
    }

    /// The last band a frame covers.
    pub(crate) fn last_band_of(&self, id: &str) -> usize {
        let frame = &self.frames[id];
        let title = self.item(self.titles[id]).band as f64;
        max(std::iter::once(title).chain(frame.members.iter().map(|member| self.band_of(member))))
            as usize
    }

    /// Whether a station stands inside a frame: on a band the frame covers, between its walls.
    pub(crate) fn inside(&self, id: &str, station: Spot) -> bool {
        let walls = self.walled(station.band);
        walls
            .get(id)
            .is_some_and(|&(low, high)| station.x > low && station.x < high)
    }

    /// Whether some stations of a line may stand on a column for the frames it
    /// lies in, read once for a search that tries column after column.
    pub(crate) fn keeps_frames(&self, lanes: &[Spot], before: Spot, after: Spot) -> KeepsFrames {
        let mut held = Vec::new();
        for lane in lanes {
            for (id, &(low, high)) in self.walled(lane.band).iter() {
                let inside = self.inside(id, before);
                if inside == self.inside(id, after) {
                    held.push((low, high, inside));
                }
            }
        }
        KeepsFrames { held }
    }

    /// Every frame and group region a band passes through, with its left and right walls.
    pub(crate) fn walled(&self, band: usize) -> Walls {
        if let Some(known) = self.walls.borrow().get(&band) {
            return Rc::clone(known);
        }
        let mut walls = Map::default();
        for (id, pair) in self
            .frame_walls(band)
            .into_iter()
            .chain(self.region_walls(band))
        {
            walls.insert(id, pair);
        }
        let walls = Rc::new(walls);
        self.walls.borrow_mut().insert(band, Rc::clone(&walls));
        walls
    }

    /// Every frame a band passes through, with its walls.
    pub(crate) fn frame_walls(&self, band: usize) -> Vec<(String, (f64, f64))> {
        self.frames
            .iter()
            .filter(|(id, _)| {
                band >= self.item(self.titles[id.as_str()]).band && band <= self.last_band_of(id)
            })
            .map(|(id, frame)| {
                // A lone region is laid out as the frame, whose drawn walls stand inside it.
                let inset = self.item(self.titles[id.as_str()]).inset.unwrap_or(0.0);
                (id.clone(), (frame.x + inset, frame.x + frame.width - inset))
            })
            .collect()
    }

    /// Every group region a band passes through, with its walls.
    fn region_walls(&self, band: usize) -> Vec<(String, (f64, f64))> {
        self.regions
            .iter()
            .filter(|region| {
                band >= self.item(region.caption).band && band <= self.region_last_band(region)
            })
            .map(|region| {
                (
                    format!(
                        "{}|{}",
                        region.parent.as_deref().unwrap_or(""),
                        region.group
                    ),
                    (region.x, region.x + region.width),
                )
            })
            .collect()
    }

    /// The last band a region covers: its lowest member's, frames' members included.
    pub(crate) fn region_last_band(&self, region: &Region) -> usize {
        let caption = self.item(region.caption).band as f64;
        let nodes = region.members.iter().flat_map(|id| {
            std::iter::once(id).chain(
                self.frames
                    .get(id)
                    .into_iter()
                    .flat_map(|frame| frame.members.iter()),
            )
        });
        max(std::iter::once(caption).chain(nodes.map(|id| self.band_of(id)))) as usize
    }

    /// The walls of each group region that a relaid label box on a band keeps out of.
    pub(crate) fn regions_off(
        &self,
        from: Spot,
        to: Spot,
        label: &Item,
        band: usize,
    ) -> Vec<(f64, f64)> {
        self.regions
            .iter()
            .filter(|region| {
                self.region_last_band(region) == band
                    && !self.holds(
                        region,
                        Spot {
                            band: label.band,
                            x: centre_x(label),
                        },
                    )
                    && !(self.holds(region, from) && self.holds(region, to))
            })
            .map(|region| (region.x, region.x + region.width))
            .collect()
    }

    /// Whether a group region holds a point.
    fn holds(&self, region: &Region, Spot { band, x }: Spot) -> bool {
        band >= self.item(region.caption).band
            && band <= self.region_last_band(region)
            && x > region.x
            && x < region.x + region.width
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

/// [`Placement::keeps_frames`]: the test of a column.
#[derive(Clone, Debug)]
pub(crate) struct KeepsFrames {
    held: Vec<(f64, f64, bool)>,
}

impl KeepsFrames {
    /// Whether a column keeps the frames: true when it does.
    pub(crate) fn passes(&self, x: f64) -> bool {
        self.held
            .iter()
            .all(|&(low, high, inside)| (x > low && x < high) == inside)
    }
}
