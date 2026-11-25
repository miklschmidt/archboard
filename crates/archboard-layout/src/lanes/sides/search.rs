//! Iterative bus, knot, and side-port trial search for Lanes blocks.

use archboard_scene::geometry::Point;

use crate::lanes::channels::End;
use crate::lanes::knots::{knots_in, knotted_lines};
use crate::lanes::route::{Prepared, RouterSnapshot, SceneLine};
use crate::lanes::scene::{ItemId, Map, Placement};
use crate::lanes::spacing::Rim;

use super::{Choice, Routing, TRIED};

/// Route a Lanes block, with the buses that cross no more lines gathered, the lines that tie a
/// knot on a run of their own where that unties it, and the ends that read
/// better on a card's side landed there: each candidate in turn, kept when the block, routed
/// again with it and those kept before it, crosses no more lines and bends no more, and for a
/// side, bends less.
pub(crate) fn route_with_sides(
    scene: &mut Placement,
    lines: &[SceneLine<'_>],
    spacing: (f64, f64),
    rim: Option<Rim>,
    reserve: bool,
) -> Result<Map<String, Vec<Point>>, Map<ItemId, f64>> {
    let prepared = Prepared::new(scene, lines, true);
    let kept = Choice::default();
    let empty_trunks = prepared.post_trunks(&kept.loose);
    let pre_gather = prepared.pre_gather(scene, &empty_trunks, reserve, &kept)?;
    let pre_gather_scene = scene.clone();
    let (best, best_done) = prepared.finish(scene, &pre_gather, spacing, rim, &kept);
    let drawn = scene.clone();
    let mut search = Search {
        scene,
        prepared: &prepared,
        spacing,
        rim,
        reserve,
        kept,
        best,
        drawn,
        best_done,
    };
    for bus in search.best.buses.clone() {
        search.try_bus(&pre_gather_scene, &pre_gather, bus);
    }
    // A line whose turn ties a knot runs on its own where that unties more knots than it ties.
    for line in knotted_lines(&search.best.routes).into_iter().take(TRIED) {
        search.try_loose(line);
    }
    let candidates =
        search
            .prepared
            .side_candidates_of(&search.drawn, &search.best_done, spacing.0);
    if !candidates.is_empty() {
        let post_trunks = search.prepared.post_trunks(&search.kept.loose);
        for candidate in candidates.into_iter().take(TRIED) {
            search.try_sided(&post_trunks, candidate);
        }
    }
    *search.scene = search.drawn;
    Ok(search.best.routes)
}

/// A search over a Lanes block's routings: the choice kept so far, its routing and its scene.
struct Search<'s, 'p, 'l, 'e> {
    scene: &'s mut Placement,
    prepared: &'p Prepared<'l, 'e>,
    spacing: (f64, f64),
    rim: Option<Rim>,
    reserve: bool,
    kept: Choice,
    best: Routing,
    drawn: Placement,
    best_done: RouterSnapshot,
}

impl Search<'_, '_, '_, '_> {
    fn keep_if(&mut self, trying: Choice, again: Routing, done: RouterSnapshot, better: bool) {
        if better {
            self.kept = trying;
            self.best = again;
            self.drawn = self.scene.clone();
            self.best_done = done;
        }
    }

    /// Try gathering one bus from the shared pre-gather snapshot (buses only affect `gather`).
    fn try_bus(
        &mut self,
        pre_gather_scene: &Placement,
        pre_gather: &RouterSnapshot,
        bus: (ItemId, ItemId, bool),
    ) {
        let mut trying = self.kept.clone();
        trying.buses.insert(bus);
        *self.scene = pre_gather_scene.clone();
        let (again, done) =
            self.prepared
                .finish(self.scene, pre_gather, self.spacing, self.rim, &trying);
        let better = again.crossings <= self.best.crossings && again.bends <= self.best.bends;
        self.keep_if(trying, again, done, better);
    }

    /// Try loosening one knotted line, reusing the choice-independent `Prepared` prefix.
    fn try_loose(&mut self, line: String) {
        let mut trying = self.kept.clone();
        trying.loose.insert(line);
        let post_trunks = self.prepared.post_trunks(&trying.loose);
        let Ok(pre_gather) =
            self.prepared
                .pre_gather(self.scene, &post_trunks, self.reserve, &trying)
        else {
            return;
        };
        let (again, done) =
            self.prepared
                .finish(self.scene, &pre_gather, self.spacing, self.rim, &trying);
        let better = knots_in(&again.routes) < knots_in(&self.best.routes)
            && again.crossings <= self.best.crossings;
        self.keep_if(trying, again, done, better);
    }

    /// Try landing one end on a card's side, reusing the post-`bundle_trunks` snapshot.
    fn try_sided(&mut self, post_trunks: &RouterSnapshot, candidate: (String, End)) {
        let mut trying = self.kept.clone();
        trying.sided.insert(candidate);
        let Ok(pre_gather) =
            self.prepared
                .pre_gather(self.scene, post_trunks, self.reserve, &trying)
        else {
            return;
        };
        let (again, done) =
            self.prepared
                .finish(self.scene, &pre_gather, self.spacing, self.rim, &trying);
        let better = again.refused.is_empty()
            && again.crossings <= self.best.crossings
            && again.bends < self.best.bends;
        self.keep_if(trying, again, done, better);
    }
}
