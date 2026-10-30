//! A frame's title row as wide as the room its frame gives it (TASK-486).
//! Graphviz ranks a title row at the header's least width. Once Graphviz has
//! said how wide the frame is and where the lines crossing the row stand, the
//! row takes the widest size its words can take there: left of the first line
//! or item on the row, and inside the frame's walls. A wider row takes fewer
//! lines, so it stands shorter, and its band shrinks with it before the bands
//! are spaced.

use crate::constants::ARCHITECTURE_HEADER_PADDING;
use crate::ecma::{max, min};
use crate::track::chains::{ChainId, Kind, LANE, Track};
use crate::track::scene::{ItemId, Placement, Set, TitleStep};

/// How far a title row's words may reach in from its left edge.
fn room_for(scene: &Placement, id: &str, lanes: &[(usize, f64)]) -> f64 {
    let title = scene.titles[id];
    let row = *scene.item(title);
    let frame = &scene.frames[id];
    let left = row.bx.x;
    let right = frame.x + frame.width;
    let items = scene
        .cards
        .values()
        .chain(scene.labels.values())
        .chain(scene.titles.values())
        .copied()
        .chain(scene.regions.iter().map(|region| region.caption))
        .filter(|&item| item != title && scene.item(item).band == row.band);
    let blockers: Vec<f64> = lanes
        .iter()
        .filter(|&&(band, _)| band == row.band)
        .map(|&(_, x)| x)
        .chain(items.map(|item| scene.item(item).bx.x))
        .filter(|&x| x > left && x < right)
        .collect();
    min(std::iter::once(right - ARCHITECTURE_HEADER_PADDING)
        .chain(blockers.iter().map(|x| x - LANE)))
        - left
}

/// The widest size of a title row whose words reach no further than some room.
fn widest(steps: &[TitleStep], room: f64) -> usize {
    let mut index = 0;
    while index + 1 < steps.len() && steps[index + 1].words <= room {
        index += 1;
    }
    index
}

/// Size a band again round its items, about the centre Graphviz ranked them on.
fn respan(scene: &mut Placement, index: usize) {
    let band = scene.bands[index];
    let centre = f64::midpoint(band.top, band.bottom);
    let on = |items: &mut dyn Iterator<Item = ItemId>, scene: &Placement| -> Vec<ItemId> {
        items
            .filter(|&item| scene.item(item).band == index)
            .collect()
    };
    let cards = on(&mut scene.cards.values().copied(), scene);
    let heads = on(
        &mut scene
            .titles
            .values()
            .copied()
            .chain(scene.regions.iter().map(|region| region.caption)),
        scene,
    );
    let labels = on(&mut scene.labels.values().copied(), scene);
    let tallest = max(cards
        .iter()
        .chain(&heads)
        .chain(&labels)
        .map(|&item| scene.item(item).bx.height));
    let (top, bottom) = (centre - tallest / 2.0, centre + tallest / 2.0);
    scene.bands[index].top = top;
    scene.bands[index].bottom = bottom;
    for card in cards {
        scene.item_mut(card).bx.y = top;
    }
    for head in heads {
        let item = scene.item_mut(head);
        item.bx.y = bottom - item.bx.height;
    }
}

impl Track<'_> {
    /// Give every frame's title row the widest size it has room for, before
    /// anything reads its words' reach or its band's height.
    pub(crate) fn fit_title_rows(&mut self, chains: &[ChainId]) {
        let lanes: Vec<(usize, f64)> = chains
            .iter()
            .flat_map(|&chain| self.chain(chain).stations.iter().copied())
            .filter(|&station| self.station(station).kind == Kind::Lane)
            .map(|station| (self.station(station).band, self.x(station)))
            .collect();
        let mut bands: Set<usize> = Set::default();
        let titles: Vec<(String, ItemId)> = self
            .scene
            .titles
            .iter()
            .map(|(id, &item)| (id.clone(), item))
            .collect();
        for (id, title) in titles {
            let steps = self.scene.steps[&title].clone();
            // A frame laid out as its region stands in from the row by the region's room on each side.
            let inset = 2.0 * self.scene.item(title).inset.unwrap_or(0.0);
            let index = if steps.len() < 2 {
                0
            } else {
                widest(&steps, room_for(self.scene, &id, &lanes) - inset)
            };
            if index == 0 {
                continue;
            }
            let TitleStep { words, height } = steps[index];
            self.scene.item_mut(title).bx.height = height;
            self.scene.words.insert(title, words + inset);
            self.scene.headers.insert(id, index);
            bands.insert(self.scene.item(title).band);
        }
        for band in bands {
            respan(self.scene, band);
        }
    }
}
