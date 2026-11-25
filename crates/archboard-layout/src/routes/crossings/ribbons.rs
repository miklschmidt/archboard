//! Cable ribbon settlement: the strands of one cable crossing the same perpendicular cluster(s)
//! are planned together as one parallel ribbon bulging the same way, so a cable never weaves
//! over and under a crossed line or cable.

use std::collections::BTreeMap;

use archboard_scene::geometry::Curve;

use super::super::BRIDGE_RADIUS;
use super::super::drawn_lines::fixed_of;
use super::cables::connected_hops;
use super::{FULL_ROOM, LEAST_ROOM, Plan, Rise, Settling, by_key};
use crate::ecma::{max, min, sort_by};

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
    fn cable_cluster_places(&self) -> Vec<Vec<usize>> {
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

    /// Try whole ribbons and ordinary plans before plans that settle only a
    /// strand. Emphasis still orders plans within each group.
    pub(super) fn settle_plans(&mut self) {
        let cable_places: Vec<_> = self
            .cable_cluster_places()
            .into_iter()
            .filter(|place| self.ribbon_fits_apart(place))
            .collect();
        let mut in_ribbon = vec![false; self.clusters.all.len()];
        for &cluster in cable_places.iter().flatten() {
            in_ribbon[cluster] = true;
        }
        let (fallback, mut plans): (Vec<_>, Vec<_>) = (0..self.clusters.all.len())
            .flat_map(|cluster| self.plans_of(cluster, in_ribbon[cluster]))
            .partition(|plan| plan.rises.iter().any(|rise| in_ribbon[rise.cluster]));
        plans.extend(self.ribbon_plans(&cable_places, false));
        self.attempt_plans(plans);
        // A partial ribbon may leave another cable place ready to rise over
        // its remaining crossings. Refresh before giving individual strands a turn.
        loop {
            let before = self.stood.len();
            let remaining = self.ribbon_plans(&cable_places, true);
            self.attempt_plans(remaining);
            if self.stood.len() == before {
                break;
            }
        }
        self.attempt_plans(fallback);
    }

    /// Try the plans in their shared priority order.
    fn attempt_plans(&mut self, mut plans: Vec<Plan>) {
        sort_by(&mut plans, by_key);
        for plan in &plans {
            self.attempt(plan);
        }
    }

    /// Plans for every cable place, or just the places partially settled
    /// by earlier plans. Each ribbon bulges the same way along all its rises.
    fn ribbon_plans(&self, cable_places: &[Vec<usize>], partial: bool) -> Vec<Plan> {
        cable_places
            .iter()
            .filter_map(|place| self.ribbon_rises(place, partial))
            .flat_map(|rises| self.plans_for_ribbon(&rises))
            .collect()
    }

    /// The rises of the whole ribbon, or the rises still open after part of
    /// the place has settled, provided at least two strands can still rise.
    fn ribbon_rises(&self, place: &[usize], partial: bool) -> Option<Vec<Rise>> {
        let mut rises: Vec<_> = place
            .iter()
            .map(|&cluster| self.whole_of(cluster))
            .collect();
        if !partial {
            return Some(rises);
        }
        if !rises
            .iter()
            .flat_map(|rise| &rise.crossings)
            .any(|&index| self.settled[index])
        {
            return None;
        }
        for rise in &mut rises {
            rise.crossings.retain(|&crossing| !self.settled[crossing]);
        }
        rises.retain(|rise| !rise.crossings.is_empty());
        (rises.len() >= 2).then_some(rises)
    }

    /// The room and bulge choices for the same set of rises.
    fn plans_for_ribbon(&self, rises: &[Rise]) -> Vec<Plan> {
        [
            (2.1, FULL_ROOM, 1.0),
            (2.2, FULL_ROOM, -1.0),
            (2.3, LEAST_ROOM, 1.0),
            (2.4, LEAST_ROOM, -1.0),
        ]
        .into_iter()
        .filter(|&(_, _, bulge)| rises.iter().all(|rise| self.passable(rise, bulge)))
        .filter_map(|(stage, room, bulge)| {
            let mut plan = self.plan_of(stage, room, rises.to_vec())?;
            plan.bulge = bulge;
            plan.ribbon = true;
            Some(plan)
        })
        .collect()
    }

    /// Whether a crest stays clear of the other crossings on its cluster.
    pub(super) fn crest_covers_only(&self, rise: &Rise, curve: &Curve) -> bool {
        let cluster = self.cluster(rise.cluster);
        let axis = self.scene.runs[cluster.run].axis;
        let feet = [curve.from, curve.end()].map(|point| axis.of(point));
        let (low, high) = (min(feet), max(feet));
        cluster.crossings.iter().all(|crossing| {
            let at = axis.of(self.crossings[*crossing].point);
            at <= low || at >= high || rise.crossings.contains(crossing)
        })
    }
}
