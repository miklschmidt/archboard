//! A crossing no hop with a bend's room fits still gets an arc: a hop that
//! stands wherever a line runs straight past both of its feet, the hops
//! beside it on one line grown into one crest over it too, or a hop on each
//! line crossing its cluster, all bulging one way (TASK-570). Where every
//! such arc is crowded, the one that keeps the most clear space stands.

use archboard_scene::geometry::{Curve, curve_bounds, inflate, segment_start};

use super::super::crowding::{
    CROSSWISE_CLEARANCE, facing_crowding, facing_hops, forced_crowding, knot_crowding,
    mark_crowding, own_head_crowding,
};
use super::super::drawn_lines::{Axis, Run, along, on_run};
use super::super::hops::{
    Bulge, Hop, crest_along, crest_margin, flipped, hop_fits, hump, passes_beneath,
};
use super::super::{BRIDGE_CLEARANCE, BRIDGE_RADIUS};
use super::{LEAST_ROOM, Rise, Settling, at_on};
use crate::ecma::{js_min, max, min, sign};

/// How near two hops along one line stand before they read as one knot: the
/// clear space each keeps from the other.
const BESIDE: f64 = BRIDGE_CLEARANCE * 2.0;

/// Arcs that could stand over a crossing together: each rise with its curve,
/// the standing hops they take the place of, and how near they come to what
/// crowds them.
struct Arcs {
    rises: Vec<(Rise, Curve)>,
    replaces: Vec<usize>,
    near: f64,
    /// Whether one of them reads as one knot with another hop or bulges into
    /// a junction mark.
    knotted: bool,
    /// Whether every line rising in them may rise over the line beneath it
    /// by their looks (`looks_allow`).
    looked: bool,
}

impl Arcs {
    /// How many more arcs stand with these than without: a crest grown from
    /// the hops beside a crossing adds none.
    fn added(&self) -> isize {
        self.rises.len().cast_signed() - self.replaces.len().cast_signed()
    }
}

/// The arcs to stand, of those tried in order: the first clear of other ink;
/// else the best of the rest, by these in turn: none of them a knot with
/// another hop or bulging into a junction mark, the looks allow them, they come least near what crowds
/// them, they add the fewest arcs.
fn chosen(mut arcs: Vec<Arcs>) -> Option<Arcs> {
    let index = arcs.iter().position(|arc| arc.near > 1.0).or_else(|| {
        let tier = |arc: &Arcs| (!arc.knotted, arc.looked);
        let best = arcs.iter().map(tier).max()?;
        let pool: Vec<usize> = (0..arcs.len())
            .filter(|&index| tier(&arcs[index]) == best)
            .collect();
        let nearest = max(pool.iter().map(|&index| arcs[index].near));
        let fewest = pool
            .iter()
            .filter(|&&index| arcs[index].near == nearest)
            .map(|&index| arcs[index].added())
            .min()?;
        pool.into_iter()
            .find(|&index| arcs[index].near == nearest && arcs[index].added() == fewest)
    })?;
    Some(arcs.swap_remove(index))
}

impl Settling<'_> {
    /// Whether a cluster's line lies beneath another line at none of its
    /// crossings, so rising over one more keeps it above along all of them.
    fn above_along(&self, cluster: usize) -> bool {
        self.cluster(cluster)
            .crossings
            .iter()
            .all(|&crossing| self.risen[crossing].is_none_or(|risen| risen == cluster))
    }

    /// Stand an arc over a crossing the other stages left (`arcs_over`,
    /// `chosen`). True when an arc stands.
    pub(super) fn force(&mut self, crossing: usize) -> bool {
        let arcs = self.arcs_over(crossing);
        let Some(arcs) = chosen(arcs) else {
            return false;
        };
        self.unstand(&arcs.replaces);
        for (rise, curve) in arcs.rises {
            self.stand(&rise, curve);
        }
        true
    }

    /// The arcs that could stand over a crossing, in the order they are
    /// tried (`more_arcs`), up to the first clear of other ink: the one
    /// `chosen` takes.
    fn arcs_over(&mut self, crossing: usize) -> Vec<Arcs> {
        let (mut arcs, mut unlooked): (Vec<Arcs>, Vec<Arcs>) = self
            .bundles(crossing, false)
            .into_iter()
            .partition(|bundle| bundle.looked);
        for stage in 0..4 {
            if arcs.iter().any(|arc| arc.near > 1.0) {
                break;
            }
            self.more_arcs(stage, crossing, &mut arcs, &mut unlooked);
        }
        arcs
    }

    /// After the bundles over a crossing that the looks allow, the arcs tried
    /// at each later stage: a hop of its own on each line that runs straight
    /// past both of its feet (`ranked`), bulging the usual way, then the
    /// other; on each line, the hops beside it grown into one crest over it
    /// too; the bundles the looks do not allow, and the bundle again with the
    /// hops its cluster's line stands over it taken down; and each hop of its
    /// own that faces another with that one turned.
    fn more_arcs(
        &mut self,
        stage: usize,
        crossing: usize,
        arcs: &mut Vec<Arcs>,
        unlooked: &mut Vec<Arcs>,
    ) {
        match stage {
            0 => {
                for cluster in self.ranked(crossing) {
                    for bulge in [1.0, -1.0] {
                        let rise = Rise {
                            cluster,
                            crossings: vec![crossing],
                        };
                        let curve = self.hop_over(cluster, crossing, bulge);
                        arcs.push(self.judged(vec![(rise, curve)], Vec::new()));
                    }
                }
            }
            1 => {
                for cluster in self.risers(crossing) {
                    arcs.extend(self.grown(cluster, crossing));
                }
            }
            2 => {
                arcs.append(unlooked);
                arcs.extend(self.bundles(crossing, true));
            }
            _ => {
                let alone: Vec<(Rise, Curve)> = arcs
                    .iter()
                    .filter(|arc| arc.replaces.is_empty() && arc.rises.len() == 1)
                    .map(|arc| arc.rises[0].clone())
                    .collect();
                for (rise, curve) in alone {
                    arcs.extend(self.turned(&rise, &curve));
                }
            }
        }
    }

    /// The lines a hop of a crossing's own fits on, by their clusters,
    /// ranked: one its look lets rise over the other, then one not hopped
    /// along its cluster, then one whose hop keeps clear of an arrowhead's
    /// approach.
    fn ranked(&self, crossing: usize) -> Vec<usize> {
        let point = self.crossings[crossing].point;
        let mut ranked: Vec<([bool; 3], usize)> = Vec::new();
        for cluster in self.risers(crossing) {
            let run = &self.scene.runs[self.cluster(cluster).run];
            let fits = |rooms| hop_fits(&self.scene, run, run.axis.of(point), rooms);
            if fits(false) {
                let (line, beneath) = self.sides(cluster, crossing);
                let may = self.lead_over(line, beneath).is_some();
                ranked.push(([may, self.above_along(cluster), fits(true)], cluster));
            }
        }
        ranked.sort_by_key(|&(key, _)| std::cmp::Reverse(key));
        ranked.into_iter().map(|(_, cluster)| cluster).collect()
    }

    /// Whether every line rising in some rises may rise over the line beneath
    /// it by their looks: no dashed or dotted line over a solid one.
    fn looks_allow(&self, rises: &[(Rise, Curve)]) -> bool {
        rises.iter().all(|(rise, _)| {
            rise.crossings.iter().all(|&crossing| {
                let (line, beneath) = self.sides(rise.cluster, crossing);
                self.lead_over(line, beneath).is_some()
            })
        })
    }

    /// A bundle over each of a crossing's clusters (`bundle`).
    fn bundles(&mut self, crossing: usize, replace: bool) -> Vec<Arcs> {
        self.clusters.of[crossing]
            .into_iter()
            .filter_map(|cluster| self.bundle(cluster, crossing, replace))
            .collect()
    }

    /// A hop on each line crossing a cluster at its unsettled crossings, all
    /// bulging the usual way, so they stand side by side as one bundle
    /// passing over: over the crossing and every other unsettled crossing of
    /// it whose crosser runs straight past its hop's feet, where there is such
    /// another. With `replace`, the hops the cluster's own line stands over
    /// it are taken down, and their crossings join the bundle, where every
    /// crosser of theirs has room; none where it stands over none of it.
    fn bundle(&mut self, cluster: usize, crossing: usize, replace: bool) -> Option<Arcs> {
        let replaces: Vec<usize> = (0..self.stood.len())
            .filter(|&index| replace && self.stood[index].cluster == cluster)
            .collect();
        if replace && replaces.is_empty() {
            return None;
        }
        let freed: Vec<usize> = replaces
            .iter()
            .flat_map(|&index| self.stood[index].crossings.iter().copied())
            .collect();
        let mut rises: Vec<(Rise, Curve)> = Vec::new();
        for &other in &self.cluster(cluster).crossings {
            let frees = freed.contains(&other);
            if self.settled[other] && !frees {
                continue;
            }
            match self.crossed(cluster, other) {
                Some(rise) => rises.push(rise),
                None if frees => return None,
                None => {}
            }
        }
        let holds = rises.iter().any(|(rise, _)| rise.crossings == [crossing]);
        (holds && rises.len() > 1).then(|| self.judged(rises, replaces))
    }

    /// The hop of the line crossing a cluster at one of its crossings,
    /// bulging the usual way, where that line runs straight past its feet.
    fn crossed(&self, cluster: usize, crossing: usize) -> Option<(Rise, Curve)> {
        let crosser = self.other_cluster(cluster, crossing);
        let run = &self.scene.runs[self.cluster(crosser).run];
        let point = self.crossings[crossing].point;
        hop_fits(&self.scene, run, run.axis.of(point), false).then(|| {
            let rise = Rise {
                cluster: crosser,
                crossings: vec![crossing],
            };
            (rise, self.hop_over(crosser, crossing, 1.0))
        })
    }

    /// A hop over one crossing standing with each hop it would face turned
    /// to bulge the other way, where its lines beneath stay straight under it.
    fn turned(&mut self, rise: &Rise, curve: &Curve) -> Vec<Arcs> {
        let run = &self.scene.runs[self.cluster(rise.cluster).run];
        facing_hops(&self.scene, run, curve)
            .into_iter()
            .filter_map(|index| {
                let turned = flipped(&self.scene.hops[index]);
                let standing = &self.stood[index];
                let crest = turned.segments[0].to();
                let bulge = match self.scene.hops[index].axis {
                    Axis::X => sign(turned.from.y - crest.y),
                    Axis::Y => sign(crest.x - turned.from.x),
                };
                if !standing.crossings.iter().all(|&crossing| {
                    let beneath = &self.scene.runs[self.sides(standing.cluster, crossing).1.drawer];
                    passes_beneath(
                        &self.scene.runs,
                        beneath,
                        self.crossings[crossing].point,
                        bulge,
                    )
                }) {
                    return None;
                }
                let rises = vec![(standing.clone(), turned), (rise.clone(), curve.clone())];
                Some(self.judged(rises, vec![index]))
            })
            .collect()
    }

    /// Arcs standing together in the place of some standing hops, by their
    /// index, with how near they come to what crowds them once those are
    /// down. Each is judged without the others: they are built to stand
    /// together, one bundle or one hop turned from another.
    fn judged(&mut self, rises: Vec<(Rise, Curve)>, replaces: Vec<usize>) -> Arcs {
        let [knot, crowded] = self.without(&replaces, |settling| {
            let nears: Vec<[f64; 2]> = rises
                .iter()
                .map(|(rise, curve)| settling.nearness(rise, curve))
                .collect();
            [0, 1].map(|which| min(nears.iter().map(|near| near[which])))
        });
        let looked = self.looks_allow(&rises);
        Arcs {
            rises,
            replaces,
            near: js_min(knot, crowded),
            knotted: knot <= 1.0,
            looked,
        }
    }

    /// What a look at the drawing finds with some standing hops, by their
    /// index, taken down.
    fn without<T>(&mut self, hops: &[usize], look: impl FnOnce(&Self) -> T) -> T {
        if hops.is_empty() {
            return look(self);
        }
        let standing = self.scene.hops.clone();
        self.scene.hops = standing
            .iter()
            .enumerate()
            .filter(|(index, _)| !hops.contains(index))
            .map(|(_, hop)| hop.clone())
            .collect();
        let found = look(self);
        self.scene.hops = standing;
        found
    }

    /// A hop over one crossing, on a cluster's line.
    fn hop_over(&self, cluster: usize, crossing: usize, bulge: Bulge) -> Curve {
        let run = &self.scene.runs[self.cluster(cluster).run];
        let place = at_on(run, &self.crossings[crossing]);
        hump(run, place, place, bulge)
    }

    /// How near an arc over a rise comes, as a share of the clear space it
    /// keeps from them, to a hop it would read as one knot with, the usual
    /// hop of a crossing still unsettled that would face it, or a junction
    /// mark it bulges into; and to other ink or its own line's arrowhead.
    fn nearness(&self, rise: &Rise, curve: &Curve) -> [f64; 2] {
        let runs = &self.scene.runs;
        let run = &runs[self.cluster(rise.cluster).run];
        let beneath: Vec<&Run> = rise
            .crossings
            .iter()
            .map(|&crossing| &runs[self.sides(rise.cluster, crossing).1.drawer])
            .collect();
        // Only a crossing within a hop's reach of the arc's own could face it.
        let reach = inflate(
            curve_bounds(curve),
            BRIDGE_RADIUS + CROSSWISE_CLEARANCE * 2.0,
        );
        let unsettled = (0..self.crossings.len())
            .filter(|&other| !self.settled[other] && !rise.crossings.contains(&other))
            .filter(|&other| {
                let point = self.crossings[other].point;
                point.x >= reach.x
                    && point.x <= reach.x + reach.width
                    && point.y >= reach.y
                    && point.y <= reach.y + reach.height
            })
            .flat_map(|other| self.clusters.of[other].map(|cluster| (cluster, other)))
            .filter(|&(cluster, _)| runs[self.cluster(cluster).run].axis == run.axis)
            .filter_map(|(cluster, other)| {
                let hop = Hop::new(self.hop_over(cluster, other, 1.0), run.axis);
                facing_crowding(run, curve, &hop)
            });
        let knot = min([
            knot_crowding(&self.scene, run, curve),
            mark_crowding(&self.scene, run, curve),
        ]
        .into_iter()
        .chain(unsettled));
        let crowded = min([
            forced_crowding(&self.scene, run, &beneath, curve),
            own_head_crowding(&self.scene, run, curve),
        ]);
        [knot, crowded]
    }

    /// The crests the hops beside a crossing on a cluster's line grow into
    /// over it too: with a hop's room past each foot, then with none, then
    /// with no flat past the outer crossings; each bulging the usual way, then
    /// the other. None where no hop stands beside it, or where the crest would
    /// span a crossing another line rose over.
    fn grown(&mut self, cluster: usize, crossing: usize) -> Vec<Arcs> {
        let run = self.scene.runs[self.cluster(cluster).run].clone();
        let Some((over, replaces)) = self.beside(&run, cluster, crossing) else {
            return Vec::new();
        };
        let places = self.places(&run, &over);
        let [first, last] = [min(places.iter().copied()), max(places.iter().copied())];
        let rise = Rise {
            cluster,
            crossings: over,
        };
        let tight = self.without(&replaces, |settling| {
            [first, last].into_iter().all(|place| {
                let coordinate = run.axis.of(on_run(&run, place, 0.0));
                hop_fits(&settling.scene, &run, coordinate, false)
            })
        });
        let mut curves = Vec::new();
        for bulge in [1.0, -1.0] {
            curves.extend(
                [LEAST_ROOM, 0.0]
                    .into_iter()
                    .filter_map(|room| crest_along(&self.scene.runs, &run, &places, room, bulge)),
            );
            curves.extend(tight.then(|| hump(&run, first, last, bulge)));
        }
        curves
            .into_iter()
            .map(|curve| self.judged(vec![(rise.clone(), curve)], replaces.clone()))
            .collect()
    }

    /// The crossings a crest grown from the hops beside a crossing on a
    /// cluster's line would span, and those hops: every hop on it within a
    /// hop's clear space of the crest, and every crossing under the crest.
    /// None where no hop stands beside it, or another line rose over a
    /// crossing under it.
    fn beside(
        &self,
        run: &Run,
        cluster: usize,
        crossing: usize,
    ) -> Option<(Vec<usize>, Vec<usize>)> {
        let mut over = vec![crossing];
        let mut replaces: Vec<usize> = Vec::new();
        loop {
            let places = self.places(run, &over);
            let margin = crest_margin(places.len());
            let low = min(places.iter().copied()) - margin - BRIDGE_RADIUS;
            let high = max(places.iter().copied()) + margin + BRIDGE_RADIUS;
            let near = (0..self.stood.len()).find(|&index| {
                if replaces.contains(&index) || self.stood[index].cluster != cluster {
                    return false;
                }
                let curve = &self.scene.hops[index].curve;
                let ends = [curve.from, segment_start(curve, curve.segments.len())]
                    .map(|point| along(run, run.axis.of(point)));
                min(ends) < high + BESIDE && max(ends) > low - BESIDE
            });
            if let Some(index) = near {
                replaces.push(index);
                over.extend(self.stood[index].crossings.iter().copied());
                continue;
            }
            let under = self
                .cluster(cluster)
                .crossings
                .iter()
                .copied()
                .find(|&other| {
                    let place = at_on(run, &self.crossings[other]);
                    !over.contains(&other) && place > low && place < high
                });
            match under {
                Some(other) if self.settled[other] => return None,
                Some(other) => over.push(other),
                None => break,
            }
        }
        (!replaces.is_empty()).then_some((over, replaces))
    }

    /// Take standing hops down, by their index, so a crest grown from them
    /// stands in their place.
    fn unstand(&mut self, hops: &[usize]) {
        let mut stood: Vec<Rise> = Vec::new();
        let mut standing: Vec<Hop> = Vec::new();
        let pairs = std::mem::take(&mut self.stood)
            .into_iter()
            .zip(std::mem::take(&mut self.scene.hops));
        for (index, (rise, hop)) in pairs.enumerate() {
            if !hops.contains(&index) {
                stood.push(rise);
                standing.push(hop);
            }
        }
        self.stood = stood;
        self.scene.hops = standing;
    }

    /// Where crossings lie along a run.
    fn places(&self, run: &Run, crossings: &[usize]) -> Vec<f64> {
        crossings
            .iter()
            .map(|&crossing| at_on(run, &self.crossings[crossing]))
            .collect()
    }
}
