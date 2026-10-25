//! The walls of a scene's frames and group regions (TASK-349): which of them a
//! band passes through, between which x, whether a station stands inside one,
//! and the test of a column against the frames a line lies in.

use std::rc::Rc;

use crate::track::scene::{Item, Map, Placement, Region, Spot, Walls, centre_x};

impl Placement {
    /// The band of a member's card or title row, zero where the scene lacks it.
    fn band_of(&self, id: &str) -> usize {
        self.member(id).map_or(0, |item| self.item(item).band)
    }

    /// The last band a frame covers.
    pub(crate) fn last_band_of(&self, id: &str) -> usize {
        let frame = &self.frames[id];
        let title = self.item(self.titles[id]).band;
        frame
            .members
            .iter()
            .map(|member| self.band_of(member))
            .fold(title, usize::max)
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
        let caption = self.item(region.caption).band;
        let nodes = region.members.iter().flat_map(|id| {
            std::iter::once(id).chain(
                self.frames
                    .get(id)
                    .into_iter()
                    .flat_map(|frame| frame.members.iter()),
            )
        });
        nodes.map(|id| self.band_of(id)).fold(caption, usize::max)
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
