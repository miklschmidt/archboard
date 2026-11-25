//! Cable ribbon settlement: the strands of one cable crossing the same perpendicular cluster(s)
//! are planned together as one parallel ribbon bulging the same way, so a cable never weaves
//! over and under a crossed line or cable.

use std::collections::BTreeMap;

use super::super::BRIDGE_RADIUS;
use super::super::clusters::at_on;
use super::super::drawn_lines::fixed_of;
use super::super::hops::{Bulge, crest_along};
use super::cables::connected_hops;
use super::{FULL_ROOM, LEAST_ROOM, Plan, Rise, Settling};
use crate::ecma::{max, min};

impl Settling<'_> {
    /// Whether a cluster's crossers ride one route and are hopped as one ribbon.
    pub(super) fn ribbon(&self, cluster: usize) -> bool {
        let mut lines = (self.cluster(cluster).crossings.iter()).map(|&crossing| {
            let crosser = self.sides(cluster, crossing).1;
            &self.edges()[self.scene.runs[crosser.drawer].edge_index]
                .edge
                .id
        });
        let Some(first) = lines.next() else {
            return false;
        };
        let leader = self.riders.get(first).unwrap_or(first);
        lines.clone().any(|id| id != first)
            && lines.all(|id| self.riders.get(id).unwrap_or(id) == leader)
    }

    /// Multi-strand crossing places of each cable: clusters on strands of one cable that share
    /// crossed clusters on perpendicular lines.
    pub(super) fn cable_cluster_places(&self) -> Vec<Vec<usize>> {
        let mut by_crossing = BTreeMap::new();
        let mut links = vec![Vec::new(); self.clusters.all.len()];
        for cluster in 0..self.clusters.all.len() {
            let Some(leader) = self.cable_of(cluster) else {
                continue;
            };
            for &crossing in &self.cluster(cluster).crossings {
                let other = self.other_cluster(cluster, crossing);
                let first = *by_crossing.entry((leader, other)).or_insert(cluster);
                if first != cluster {
                    links[first].push(cluster);
                    links[cluster].push(first);
                }
            }
        }
        connected_hops(&links)
    }

    /// Whether the strands of a cable place run on one axis far enough apart that parallel
    /// same-bulge crests never reach a sibling strand's baseline.
    fn ribbon_fits_apart(&self, place: &[usize]) -> bool {
        let runs = &self.scene.runs;
        let Some(&first) = place.first() else {
            return false;
        };
        let axis = runs[self.cluster(first).run].axis;
        for (index, &one) in place.iter().enumerate() {
            let a = &runs[self.cluster(one).run];
            if a.axis != axis {
                return false;
            }
            for &other in &place[index + 1..] {
                let b = &runs[self.cluster(other).run];
                if (fixed_of(a) - fixed_of(b)).abs() <= BRIDGE_RADIUS {
                    return false;
                }
            }
        }
        true
    }

    /// Whole-cable ribbon plans: every strand of a cable crossing a place rises together under
    /// parallel crests bulging the same way, tried after single-line plans and before single-strand
    /// fallbacks.
    pub(super) fn ribbon_plans(&self, cable_places: &[Vec<usize>]) -> Vec<Plan> {
        let mut plans = Vec::new();
        for place in cable_places {
            if !self.ribbon_fits_apart(place) {
                continue;
            }
            let rises: Vec<Rise> = place
                .iter()
                .map(|&cluster| self.whole_of(cluster))
                .collect();
            for (stage, room, bulge) in [
                (2.1, FULL_ROOM, 1.0),
                (2.2, FULL_ROOM, -1.0),
                (2.3, LEAST_ROOM, 1.0),
                (2.4, LEAST_ROOM, -1.0),
            ] {
                if !rises.iter().all(|rise| self.passable(rise, bulge)) {
                    continue;
                }
                if let Some(mut plan) = self.plan_of(stage, room, rises.clone()) {
                    plan.bulge = bulge;
                    plan.ribbon = true;
                    plans.push(plan);
                }
            }
        }
        plans
    }

    /// Settle remaining unsettled crossings of each cable place together as one ribbon where an
    /// earlier plan settled part of the cluster (such as another cable beside a single line).
    pub(super) fn settle_remaining_ribbons(&mut self, cable_places: &[Vec<usize>]) {
        for place in cable_places {
            self.settle_remaining_ribbon(place);
        }
    }

    /// Settle the remaining unsettled crossings of one cable place together as one ribbon.
    fn settle_remaining_ribbon(&mut self, place: &[usize]) {
        if !self.ribbon_fits_apart(place) {
            return;
        }
        let rises: Vec<Rise> = place
            .iter()
            .filter_map(|&cluster| {
                let crossings: Vec<usize> = self
                    .cluster(cluster)
                    .crossings
                    .iter()
                    .copied()
                    .filter(|&crossing| !self.settled[crossing])
                    .collect();
                (!crossings.is_empty()).then_some(Rise { cluster, crossings })
            })
            .collect();
        if rises.len() < 2 {
            return;
        }
        for (room, bulge) in [
            (FULL_ROOM, 1.0),
            (FULL_ROOM, -1.0),
            (LEAST_ROOM, 1.0),
            (LEAST_ROOM, -1.0),
        ] {
            if self.try_remaining_ribbon(&rises, room, bulge) {
                break;
            }
        }
    }

    /// Try standing a remaining-crossings ribbon plan at one room and bulge. True when it stood.
    fn try_remaining_ribbon(&mut self, rises: &[Rise], room: f64, bulge: Bulge) -> bool {
        if !rises.iter().all(|rise| self.passable(rise, bulge))
            || self.spans_settled(rises, room, bulge)
        {
            return false;
        }
        let Some(mut plan) = self.plan_of(0.0, room, rises.to_vec()) else {
            return false;
        };
        plan.bulge = bulge;
        plan.ribbon = true;
        let before = self.stood.len();
        self.attempt(&plan);
        self.stood.len() > before
    }

    /// Whether any rise's crest would span a crossing of its cluster that is not in the rise.
    fn spans_settled(&self, rises: &[Rise], room: f64, bulge: Bulge) -> bool {
        let runs = &self.scene.runs;
        rises.iter().any(|rise| {
            let cluster = self.cluster(rise.cluster);
            let run = &runs[cluster.run];
            let places: Vec<f64> = rise
                .crossings
                .iter()
                .map(|&crossing| at_on(run, &self.crossings[crossing]))
                .collect();
            let Some(curve) = crest_along(runs, run, &places, room, bulge) else {
                return true;
            };
            let feet = [curve.from, curve.end()].map(|point| run.axis.of(point));
            let (low, high) = (min(feet), max(feet));
            cluster.crossings.iter().any(|crossing| {
                let at = run.axis.of(self.crossings[*crossing].point);
                at > low && at < high && !rise.crossings.contains(crossing)
            })
        })
    }
}
