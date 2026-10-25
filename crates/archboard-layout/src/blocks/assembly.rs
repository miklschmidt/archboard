//! Every block put where its parent placed it, and every relationship's lines
//! joined end to end through its ports: the drawing's geometry, as the main
//! thread reads it.

use crate::geometry::{Point, Rect};
use crate::json::J;
use crate::track::scene::Map;

use super::laid::{CAPTION_INSET, Laid, LaidMap, corners, moved, shifted};
use super::lone::{Lone, Stop, caption_in, card_in, carried_line};
use super::steps::{Drawn, Surroundings, unstepped};
use super::tree::{Block, BlockId, BlockTree, Kind, Projection, header_of};

/// A card or container, placed.
#[derive(Clone, Debug)]
pub struct PlacedCard {
    pub id: String,
    pub bx: Rect,
    pub depth: usize,
    /// Which of a container's header's wider sizes it took, when it took one.
    pub header: Option<usize>,
}

/// A group region, placed.
#[derive(Clone, Debug)]
pub struct PlacedArea {
    pub group: String,
    pub parent: Option<String>,
    pub bx: Rect,
    pub caption: Rect,
    pub depth: usize,
}

/// A relationship's route and label, placed.
#[derive(Clone, Debug)]
pub struct PlacedLine {
    pub id: String,
    pub points: Vec<Point>,
    pub label: Option<Rect>,
}

/// A container's title row, and the band across the container's top it stands in.
#[derive(Clone, Debug)]
pub struct Title {
    pub bx: Rect,
    pub band: Rect,
}

/// The whole drawing's geometry.
#[derive(Clone, Debug)]
pub struct Placed {
    pub width: f64,
    pub height: f64,
    pub cards: Vec<PlacedCard>,
    pub frames: Vec<PlacedCard>,
    pub regions: Vec<PlacedArea>,
    pub edges: Vec<PlacedLine>,
    pub titles: Vec<Title>,
}

/// A box as the drawing spells it.
fn box_json(at: &Rect) -> J {
    J::obj([
        ("x", J::Num(at.x)),
        ("y", J::Num(at.y)),
        ("width", J::Num(at.width)),
        ("height", J::Num(at.height)),
    ])
}

impl Placed {
    /// The drawing as the solve answers it, with whether facing every block's
    /// walls would change its blocks.
    pub fn json(&self, faces: bool) -> J {
        let card = |one: &PlacedCard| {
            let mut members = vec![
                ("id".to_owned(), J::str(&one.id)),
                ("box".to_owned(), box_json(&one.bx)),
                ("depth".to_owned(), J::Num(one.depth as f64)),
            ];
            if let Some(header) = one.header {
                members.push(("header".to_owned(), J::Num(header as f64)));
            }
            J::Obj(members)
        };
        let region = |one: &PlacedArea| {
            let mut members = vec![("group".to_owned(), J::str(&one.group))];
            if let Some(parent) = &one.parent {
                members.push(("parent".to_owned(), J::str(parent)));
            }
            members.push(("box".to_owned(), box_json(&one.bx)));
            members.push(("caption".to_owned(), box_json(&one.caption)));
            members.push(("depth".to_owned(), J::Num(one.depth as f64)));
            J::Obj(members)
        };
        let edge = |one: &PlacedLine| {
            let points = one
                .points
                .iter()
                .map(|point| J::obj([("x", J::Num(point.x)), ("y", J::Num(point.y))]))
                .collect();
            let mut members = vec![
                ("id".to_owned(), J::str(&one.id)),
                ("points".to_owned(), J::Arr(points)),
            ];
            if let Some(label) = &one.label {
                members.push(("label".to_owned(), box_json(label)));
            }
            J::Obj(members)
        };
        J::obj([
            ("width", J::Num(self.width)),
            ("height", J::Num(self.height)),
            ("cards", J::Arr(self.cards.iter().map(card).collect())),
            ("frames", J::Arr(self.frames.iter().map(card).collect())),
            ("regions", J::Arr(self.regions.iter().map(region).collect())),
            ("edges", J::Arr(self.edges.iter().map(edge).collect())),
            (
                "titles",
                J::Arr(
                    self.titles
                        .iter()
                        .map(|title| {
                            J::obj([
                                ("box", box_json(&title.bx)),
                                ("band", box_json(&title.band)),
                            ])
                        })
                        .collect(),
                ),
            ),
            ("faces", J::Bool(faces)),
        ])
    }

    /// The drawing with the steps its joined lines need not take taken out.
    pub fn unstepped(mut self) -> Placed {
        let mut boxes: Vec<Rect> = self.cards.iter().map(|card| card.bx).collect();
        boxes.extend(self.regions.iter().map(|region| region.caption));
        boxes.extend(self.titles.iter().map(|title| title.bx));
        let walls: Vec<Rect> = self
            .frames
            .iter()
            .map(|frame| frame.bx)
            .chain(self.regions.iter().map(|region| region.bx))
            .collect();
        let mut bands: Vec<Rect> = self.titles.iter().map(|title| title.band).collect();
        bands.extend(self.regions.iter().map(|region| Rect {
            height: region.caption.y + region.caption.height - region.bx.y,
            ..region.bx
        }));
        let lines: Vec<Drawn<'_>> = self
            .edges
            .iter()
            .map(|edge| Drawn {
                points: &edge.points,
                label: edge.label,
            })
            .collect();
        let routes = unstepped(
            &lines,
            &Surroundings {
                boxes: &boxes,
                walls: &walls,
                bands: &bands,
            },
        );
        for (edge, points) in self.edges.iter_mut().zip(routes) {
            edge.points = points;
        }
        self
    }
}

/// How many containers a block draws inline around one of its cards.
fn frames_around(block: &Block, card: &str) -> usize {
    block
        .clusters_from(block.cluster_of.get(card).map(String::as_str))
        .into_iter()
        .filter(|cluster| {
            block
                .clusters
                .get(*cluster)
                .is_some_and(|one| one.kind == super::tree::ClusterKind::Frame)
        })
        .count()
}

/// A card or container alone in its region: the region, the block around it,
/// and its region's box and its own.
struct Alone {
    id: String,
    lone: Lone,
    block: BlockId,
    stop: Stop,
}

/// Every block put where its parent placed it, and every relationship joined.
pub struct Assembly<'a> {
    tree: &'a BlockTree,
    laid: &'a LaidMap,
    origins: Map<String, Point>,
    depths: Map<String, usize>,
    lone: Vec<Alone>,
}

impl<'a> Assembly<'a> {
    /// Place every block from the root down.
    pub fn new(tree: &'a BlockTree, laid: &'a LaidMap) -> Assembly<'a> {
        let root = &tree.get(tree.root).id;
        let mut assembly = Assembly {
            tree,
            laid,
            origins: Map::default(),
            depths: Map::default(),
            lone: Vec::new(),
        };
        assembly
            .origins
            .insert(root.clone(), Point { x: 0.0, y: 0.0 });
        assembly.depths.insert(root.clone(), 0);
        assembly.descend(tree.root);
        assembly.lone = assembly.lone_laid();
        assembly
    }

    /// A block laid out.
    fn laid_of(&self, block: &Block) -> &'a Laid {
        &self.laid[block.id.as_str()]
    }

    /// Give the blocks inside one block their origins and containment depths.
    fn descend(&mut self, id: BlockId) {
        let block = self.tree.get(id);
        let origin = self.origins[block.id.as_str()];
        let depth = self.depths[block.id.as_str()];
        for item in &block.items {
            let Some(inner) = self.tree.block_of(item) else {
                continue;
            };
            let at = moved(self.laid_of(block).boxes[item.as_str()], origin);
            self.origins
                .insert(item.clone(), Point { x: at.x, y: at.y });
            self.depths.insert(item.clone(), depth);
            self.descend(inner);
        }
    }

    /// Where a block stands in the drawing.
    fn origin(&self, block: &Block) -> Point {
        self.origins[block.id.as_str()]
    }

    /// A box of one block's, in the drawing.
    fn inside(&self, block: &Block, id: &str) -> Rect {
        moved(self.laid_of(block).boxes[id], self.origin(block))
    }

    /// A block's box in the drawing.
    fn box_of(&self, block: &Block) -> Rect {
        let Point { x, y } = self.origin(block);
        let laid = self.laid_of(block);
        Rect {
            x,
            y,
            width: laid.width,
            height: laid.height,
        }
    }

    /// Every block, in the tree's order.
    fn blocks(&self) -> impl Iterator<Item = &'a Block> {
        let tree = self.tree;
        tree.blocks.values().map(move |&id| tree.get(id))
    }

    /// Every card, in the drawing.
    fn cards(&self) -> Vec<PlacedCard> {
        self.blocks()
            .flat_map(|block| {
                block
                    .items
                    .iter()
                    .filter(|item| !self.tree.is_block(item))
                    .map(move |id| {
                        let at = self.inside(block, id);
                        PlacedCard {
                            id: id.clone(),
                            bx: self.tree.lone.get(id).map_or(at, |lone| card_in(at, lone)),
                            depth: self.depths[block.id.as_str()] + frames_around(block, id),
                            header: None,
                        }
                    })
            })
            .collect()
    }

    /// Every region round one card or container that the blocks laid out as
    /// its node, in the drawing, captioned clear of the lines into it.
    fn lone_regions(&self, lines: &[&[Point]]) -> Vec<PlacedArea> {
        self.lone
            .iter()
            .map(|alone| {
                let block = self.tree.get(alone.block);
                PlacedArea {
                    group: alone.lone.group.clone(),
                    parent: block.frame_around(block.cluster_of.get(&alone.id).map(String::as_str)),
                    bx: alone.stop.region,
                    caption: caption_in(alone.stop.region, &alone.lone, lines),
                    depth: self.depths[block.id.as_str()] + frames_around(block, &alone.id),
                }
            })
            .collect()
    }

    /// Every card or container alone in its region, laid out as the region's
    /// box: a card as an item of its block, or a container as a cluster of the
    /// block that draws it inline.
    fn lone_laid(&self) -> Vec<Alone> {
        self.tree
            .lone
            .iter()
            .map(|(id, lone)| {
                let block = self.tree.holder[id.as_str()];
                Alone {
                    id: id.clone(),
                    lone: lone.clone(),
                    block,
                    stop: self.laid_in(self.tree.get(block), id, lone),
                }
            })
            .collect()
    }

    /// The box a block laid a card or container alone in its region out as,
    /// and the node's own.
    fn laid_in(&self, block: &Block, id: &str, lone: &Lone) -> Stop {
        let inline = self
            .laid_of(block)
            .frames
            .iter()
            .flatten()
            .find(|frame| frame.id == id);
        match inline {
            None => {
                let region = self.inside(block, id);
                Stop {
                    region,
                    card: card_in(region, lone),
                }
            }
            Some(frame) => {
                let origin = self.origin(block);
                Stop {
                    region: moved(
                        frame
                            .region
                            .expect("a frame alone in its region keeps the region's box"),
                        origin,
                    ),
                    card: moved(frame.bx, origin),
                }
            }
        }
    }

    /// Where a line stops at a card or container alone in its region.
    fn lone_end(&self, end: &str) -> Option<&Stop> {
        self.lone
            .iter()
            .find(|alone| alone.id == end)
            .map(|alone| &alone.stop)
    }

    /// Every container, in the drawing.
    fn frames(&self) -> Vec<PlacedCard> {
        self.blocks()
            .flat_map(|block| {
                let origin = self.origin(block);
                let depth = self.depths[block.id.as_str()];
                self.laid_of(block)
                    .frames
                    .iter()
                    .flatten()
                    .map(move |frame| PlacedCard {
                        id: frame.id.clone(),
                        bx: moved(frame.bx, origin),
                        depth: depth + frame.depth,
                        header: frame.header,
                    })
            })
            .collect()
    }

    /// Every group region, in the drawing.
    fn regions(&self) -> Vec<PlacedArea> {
        let packed = self
            .blocks()
            .filter(|block| block.kind == Kind::Region)
            .map(|block| PlacedArea {
                group: block.group.clone().unwrap_or_default(),
                parent: None,
                bx: self.box_of(block),
                caption: self.caption(block),
                depth: self.depths[block.id.as_str()],
            });
        let inline = self.blocks().flat_map(|block| {
            let origin = self.origin(block);
            let depth = self.depths[block.id.as_str()];
            self.laid_of(block)
                .regions
                .iter()
                .flatten()
                .map(move |region| PlacedArea {
                    group: region.group.clone(),
                    parent: region.parent.clone(),
                    bx: moved(region.bx, origin),
                    caption: moved(region.caption, origin),
                    depth: depth + region.depth,
                })
        });
        packed.chain(inline).collect()
    }

    /// A region's caption box: in the band's top-left corner, as a frame's
    /// title is, whatever slot Graphviz kept for it on the first rank.
    fn caption(&self, block: &Block) -> Rect {
        let slot = self.inside(block, &header_of(block));
        let band = self.box_of(block);
        Rect {
            x: band.x + CAPTION_INSET,
            y: band.y + CAPTION_INSET,
            width: slot.width,
            height: slot.height - CAPTION_INSET,
        }
    }

    /// One relationship's lines joined end to end, and its label's box.
    fn joined(&self, projection: &Projection) -> PlacedLine {
        let edge = &projection.edge;
        let route = &self.tree.routes[edge.id.as_str()];
        let mut points = Vec::new();
        for (block, key) in &route.pieces {
            let block = self.tree.get(*block);
            if let Some(line) = self.laid_of(block).lines.get(key) {
                points.extend(shifted(line, self.origin(block)));
            }
        }
        let label_at = self.tree.get(route.label_at);
        let name = format!("label:{}", edge.id);
        let label = self
            .laid_of(label_at)
            .boxes
            .contains_key(&name)
            .then(|| self.inside(label_at, &name));
        let carried = carried_line(
            &corners(&points),
            self.lone_end(edge.source()),
            self.lone_end(edge.target()),
        );
        PlacedLine {
            id: edge.id.clone(),
            points: corners(&carried),
            label,
        }
    }

    /// The drawing's geometry.
    pub fn placed(&self) -> Placed {
        let root = self.laid_of(self.tree.get(self.tree.root));
        let edges: Vec<PlacedLine> = self
            .tree
            .projections
            .iter()
            .map(|projection| self.joined(projection))
            .collect();
        let lines: Vec<&[Point]> = edges.iter().map(|edge| edge.points.as_slice()).collect();
        let mut regions = self.regions();
        regions.extend(self.lone_regions(&lines));
        Placed {
            width: root.width,
            height: root.height,
            cards: self.cards(),
            frames: self.frames(),
            regions,
            titles: self.titles(),
            edges,
        }
    }

    /// Every container's title row and the band across its top it stands in, in the drawing.
    fn titles(&self) -> Vec<Title> {
        self.blocks()
            .flat_map(|block| {
                let laid = self.laid_of(block);
                let origin = self.origin(block);
                laid.frames.iter().flatten().filter_map(move |frame| {
                    let name = format!("title:{}", frame.id);
                    laid.boxes.contains_key(&name).then(|| {
                        let title = self.inside(block, &name);
                        let at = moved(frame.bx, origin);
                        Title {
                            bx: title,
                            band: Rect {
                                height: title.y + title.height - at.y,
                                ..at
                            },
                        }
                    })
                })
            })
            .collect()
    }
}
