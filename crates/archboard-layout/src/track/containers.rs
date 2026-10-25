//! The frames and group regions a track scene draws (TASK-349). Each reaches
//! one inset below the lowest thing it holds, the containers inside it
//! included, so nested containers never share a bottom edge; and the channel
//! below the band a container ends on starts its tracks below that edge.

use archboard_scene::geometry::Rect;

use crate::constants::{CONTAINER_INSET, REGION_INSET};
use crate::ecma::{js_max, max};
use crate::placed::PlacedEdge;
use crate::track::scene::{ItemId, Map, Placement, Set};

/// A frame's box once the scene is spaced, and how deep in frames it sits.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct FrameShape {
    pub id: String,
    pub bx: Rect,
    pub depth: usize,
    /// The region round a frame alone in its group's region, laid out as that region.
    pub region: Option<Rect>,
    /// Which of its header's wider sizes its title row took, when it took one.
    pub header: Option<usize>,
}

/// A group region's band and caption once the scene is spaced.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct RegionShape {
    pub group: String,
    pub parent: Option<String>,
    pub bx: Rect,
    pub caption: Rect,
    pub depth: usize,
}

/// A frame or group region, with everything it holds.
#[derive(Clone, Debug)]
pub(crate) struct Container {
    /// Room it keeps below the lowest thing it holds.
    pub inset: f64,
    /// Its title row or caption, and every card, title row and label it holds, however deep.
    pub items: Vec<ItemId>,
    /// Every frame and region inside it, however deep.
    pub inner: Vec<usize>,
    /// Its left and right walls.
    pub walls: (f64, f64),
}

/// The placed relationships a scene's containers hold the labels of, by id.
pub(crate) type Edges<'a> = Map<&'a str, &'a PlacedEdge>;

/// Every frame and group region of a scene, with what each holds.
pub(crate) struct Containers<'a> {
    pub scene: &'a Placement,
    pub all: Vec<Container>,
    pub frames: Map<String, usize>,
    pub regions: Vec<usize>,
}

impl<'a> Containers<'a> {
    /// Read what each frame and region holds.
    pub(crate) fn new(scene: &'a Placement, edges: &Edges<'_>) -> Containers<'a> {
        let mut containers = Containers {
            scene,
            all: Vec::new(),
            frames: Map::default(),
            regions: Vec::new(),
        };
        for (id, frame) in &scene.frames {
            let walls = (frame.x, frame.x + frame.width);
            let below = frame.below.unwrap_or(0.0);
            let inset = CONTAINER_INSET + below;
            let container = containers.container(
                inset,
                scene.titles[id.as_str()],
                &frame.members,
                walls,
                edges,
            );
            containers.all.push(container);
            containers
                .frames
                .insert(id.clone(), containers.all.len() - 1);
        }
        for region in &scene.regions {
            let inside = containers.region_inside(&region.members);
            let container = containers.container(
                REGION_INSET,
                region.caption,
                &inside,
                (region.x, region.x + region.width),
                edges,
            );
            containers.all.push(container);
            containers.regions.push(containers.all.len() - 1);
        }
        let frames: Vec<(String, usize)> = containers
            .frames
            .iter()
            .map(|(id, &at)| (id.clone(), at))
            .collect();
        for (id, at) in frames {
            let inside: Set<String> = scene.frames[id.as_str()].members.iter().cloned().collect();
            let within = containers.within(&inside, Some(&id));
            containers.all[at].inner.extend(within);
        }
        for (index, region) in scene.regions.iter().enumerate() {
            let inside: Set<String> = containers
                .region_inside(&region.members)
                .into_iter()
                .collect();
            let within = containers.within(&inside, None);
            let at = containers.regions[index];
            containers.all[at].inner.extend(within);
        }
        containers
    }

    /// Everything a region holds: its members, and everything inside the frames among them.
    pub(crate) fn region_inside(&self, members: &[String]) -> Vec<String> {
        members
            .iter()
            .flat_map(|id| {
                std::iter::once(id.clone()).chain(
                    self.scene
                        .frames
                        .get(id)
                        .into_iter()
                        .flat_map(|frame| frame.members.iter().cloned()),
                )
            })
            .collect()
    }

    /// A container holding some members, with nothing inside it yet.
    fn container(
        &self,
        inset: f64,
        head: ItemId,
        members: &[String],
        walls: (f64, f64),
        edges: &Edges<'_>,
    ) -> Container {
        let inside: Set<&str> = members.iter().map(String::as_str).collect();
        let scene = self.scene;
        let labels = scene.labels.iter().filter_map(|(edge, &item)| {
            let placed = edges[edge.as_str()];
            (inside.contains(placed.source.as_str()) && inside.contains(placed.target.as_str()))
                .then_some(item)
        });
        let held = members.iter().filter_map(|id| scene.member(id));
        let items = std::iter::once(head).chain(held).chain(labels).collect();
        Container {
            inset,
            items,
            inner: Vec::new(),
            walls,
        }
    }

    /// The frames and regions inside some members: the frames among them, and
    /// the regions that sit in the frame itself or in one of those.
    fn within(&self, inside: &Set<String>, frame: Option<&str>) -> Vec<usize> {
        let frames = self
            .frames
            .iter()
            .filter(|(id, _)| inside.contains(id.as_str()))
            .map(|(_, &at)| at);
        let regions = self
            .scene
            .regions
            .iter()
            .enumerate()
            .filter_map(|(index, region)| {
                let parent = region.parent.as_deref()?;
                (Some(parent) == frame || inside.contains(parent)).then(|| self.regions[index])
            });
        frames.chain(regions).collect()
    }

    /// Where a container's bottom edge stands once the scene is spaced: one
    /// inset below the lowest thing it holds, the containers inside it included.
    pub(crate) fn bottom_of(&self, container: usize, left: f64) -> f64 {
        let container = &self.all[container];
        let items = container.items.iter().map(|&item| {
            let bx = self.scene.moved_id(item, left);
            bx.y + bx.height
        });
        let inner: Vec<f64> = container
            .inner
            .iter()
            .map(|&one| self.bottom_of(one, left))
            .collect();
        max(items.chain(inner)) + container.inset
    }

    /// How far below each band the containers that end on it reach, before spacing.
    pub(crate) fn closings(&self) -> Vec<f64> {
        let mut closing = vec![0.0; self.scene.bands.len()];
        for at in self
            .frames
            .values()
            .copied()
            .chain(self.regions.iter().copied())
        {
            let band = self.last_band(at);
            closing[band] = js_max(closing[band], self.reach(at, band));
        }
        closing
    }

    /// The bands a container ends on right above another container it stands over.
    pub(crate) fn facing(&self) -> Set<usize> {
        let all: Vec<usize> = self
            .frames
            .values()
            .copied()
            .chain(self.regions.iter().copied())
            .collect();
        all.iter()
            .filter(|&&one| all.iter().any(|&other| self.stands_over(one, other)))
            .map(|&one| self.last_band(one))
            .collect()
    }

    /// Whether a container ends on the band right above the band another opens on,
    /// with walls that overlap it.
    fn stands_over(&self, one: usize, other: usize) -> bool {
        let (left, right) = self.all[one].walls;
        let other_walls = self.all[other].walls;
        let opens = self.scene.item(self.all[other].items[0]).band == self.last_band(one) + 1;
        opens && left < other_walls.1 && other_walls.0 < right
    }

    /// The lowest band a container holds anything on.
    pub(crate) fn last_band(&self, container: usize) -> usize {
        self.all[container]
            .items
            .iter()
            .map(|&item| self.scene.item(item).band)
            .max()
            .unwrap_or(0)
    }

    /// How far below a band a container ending on it reaches.
    fn reach(&self, container: usize, band: usize) -> f64 {
        let inner = self.all[container]
            .inner
            .iter()
            .filter(|&&one| self.last_band(one) == band)
            .map(|&one| self.reach(one, band));
        self.all[container].inset + max(std::iter::once(0.0).chain(inner))
    }
}

/// Every frame: Graphviz's width, from its title row down to one inset below
/// everything it holds.
pub(crate) fn frame_shapes(scene: &Placement, edges: &Edges<'_>, left: f64) -> Vec<FrameShape> {
    let containers = Containers::new(scene, edges);
    scene
        .frames
        .iter()
        .map(|(id, frame)| {
            let title = scene.moved_id(scene.titles[id.as_str()], left);
            let bottom = containers.bottom_of(containers.frames[id.as_str()], left);
            let bx = Rect {
                x: frame.x + left,
                y: title.y,
                width: frame.width,
                height: bottom - title.y,
            };
            FrameShape {
                id: id.clone(),
                bx,
                depth: frame.depth,
                region: None,
                header: scene.headers.get(id).copied(),
            }
        })
        .collect()
}

/// Every group region: Graphviz's width, from its caption row down to below
/// everything it holds.
pub(crate) fn region_shapes(scene: &Placement, edges: &Edges<'_>, left: f64) -> Vec<RegionShape> {
    let containers = Containers::new(scene, edges);
    scene
        .regions
        .iter()
        .enumerate()
        .map(|(index, region)| {
            let caption = scene.moved_id(region.caption, left);
            let bottom = containers.bottom_of(containers.regions[index], left);
            let depth = region.parent.as_ref().map_or(0, |parent| {
                scene.frames.get(parent).map_or(0, |frame| frame.depth) + 1
            });
            let bx = Rect {
                x: region.x + left,
                y: caption.y,
                width: region.width,
                height: bottom - caption.y,
            };
            RegionShape {
                group: region.group.clone(),
                parent: region.parent.clone(),
                bx,
                caption,
                depth,
            }
        })
        .collect()
}
