//! Crossings belong to the final drawing: route and paint order are settled
//! here.
//!
//! Where two lines cross, one of them hops over the other (`hops` says where a
//! hop may stand), and every hop bulges the same way, so two never face each
//! other. The more emphasised line rises; between equals, the line with more
//! straight room, then the later-painted. A dashed or dotted line never rises
//! over a solid one. Crossings along one run closer than a crest's reach are a
//! cluster (`clusters`): its crossers hop it one each where every one may and
//! every hop fits, else its line rises over all of it under one crest, else
//! over single crossings of it where it is the upper line at the rest. A
//! cluster whose crossers are the strands of one cable is hopped as one ribbon:
//! its line rises over all of it under one crest. A
//! crossing no plan settles still hops where a hop fits, and else gets the
//! least crowded arc that stands wherever a line runs straight past both of a
//! hop's feet (`forced`): its own hop, the hops beside it grown into one
//! crest, the lines crossing its cluster hopping it as one bundle, or its hop
//! with a hop it would face turned. So every crossing has an arc, and arcs do
//! not stand side by side on one line, face each other or bulge into a
//! junction mark wherever another arc avoids it (TASK-570). Beside a join,
//! the line that does not join rises.

use std::collections::BTreeMap;

use archboard_scene::drawing::{ArchitectureDrawing, Bridged, DrawingBridge, EdgeFacts, NodeFacts};
use archboard_scene::geometry::Curve;
use archboard_scene::request::Dash;

use crate::constants::BEND_RADIUS;
use crate::ecma::{js_min, max, min, round, sign, sorted_by};

use super::clusters::{Cluster, Clusters, at_on, clusters_of, sides_of};
use super::crowding::{crowded, crowding, mark_crowding, near_own_head, own_head_crowding};
use super::drawn_lines::{
    Axis, DrawnCrossing, Edges, Line, Run, drawn_crossings, join_near, piece_of, straight_runs,
    straightness, weight,
};
use super::folded::unfold_crossings;
use super::hops::{
    Bulge, HOP_MARGIN, Hop, HopScene, carried, crest_along, flipped, look_of, passes_beneath,
    replace_runs,
};
use super::{BRIDGE_RADIUS, LineLook};

mod forced;

/// The straight line a rising line keeps past each foot: a bend's room, so a
/// bend a few points past a hop never draws one squiggle with it.
const FULL_ROOM: f64 = HOP_MARGIN + BEND_RADIUS;

/// The least a rising line keeps past each foot, where no line has a bend's room.
pub(super) const LEAST_ROOM: f64 = HOP_MARGIN;

/// Straight line on a crossing's shorter side past which a line has all the
/// room a hop could want.
const ROOM_CAP: f64 = BRIDGE_RADIUS + FULL_ROOM;

/// How much straighter one line must run through a crossing to count as the straighter.
const STRAIGHTER: f64 = 0.5;

/// How near a join a crossing must be for the joining line to stay whole: within a hop's radius.
const JOIN_REACH: f64 = BRIDGE_RADIUS;

/// One run rising over some crossings of one of its clusters, under one hop or crest.
#[derive(Clone, Debug)]
pub(super) struct Rise {
    cluster: usize,
    crossings: Vec<usize>,
}

/// Rises that stand together or not at all.
#[derive(Clone, Debug)]
struct Plan {
    rises: Vec<Rise>,
    /// The straight line each rising line keeps past its feet.
    room: f64,
    /// Where it comes in the order plans are tried, lower first.
    key: [f64; 4],
}

/// Everything settling the crossings reads and records.
struct Settling<'a> {
    scene: HopScene<'a>,
    /// How each line is drawn, by relationship id.
    lines: &'a BTreeMap<String, LineLook>,
    /// Each strand that rides another line's route, by id.
    riders: &'a BTreeMap<String, String>,
    crossings: Vec<DrawnCrossing>,
    clusters: Clusters,
    /// The rise each standing hop stands for, beside its hop in the scene's.
    stood: Vec<Rise>,
    /// The lines cut beneath a joining line with no hop.
    cuts: Vec<DrawingBridge>,
    settled: Vec<bool>,
    /// The cluster whose line rose over each crossing, where one did.
    risen: Vec<Option<usize>>,
}

impl Settling<'_> {
    /// The routes.
    fn edges(&self) -> &Edges {
        &self.scene.drawing.edges
    }

    /// A cluster by its index.
    fn cluster(&self, index: usize) -> &Cluster {
        &self.clusters.all[index]
    }

    /// A crossing's two lines along a cluster: the cluster's, and the one crossing it.
    fn sides(&self, cluster: usize, crossing: usize) -> (&Line, &Line) {
        sides_of(self.cluster(cluster), &self.crossings[crossing])
    }

    /// A crossing's cluster along its other line than a given cluster's.
    fn other_cluster(&self, cluster: usize, crossing: usize) -> usize {
        self.clusters.of[crossing][1 - self.cluster(cluster).side]
    }

    /// Whether a rise may be tried: its crossings are unsettled, and, rising
    /// over part of a cluster, its line would be the upper one at the rest of
    /// it, so it is never above at one crossing of a cluster and beneath at
    /// the next.
    fn open(&self, rise: &Rise) -> bool {
        let cluster = self.cluster(rise.cluster);
        cluster.crossings.iter().all(|&crossing| {
            if rise.crossings.contains(&crossing) {
                !self.settled[crossing]
            } else {
                self.settled[crossing] || usize::from(!self.upper_of(crossing).1) == cluster.side
            }
        })
    }

    /// The crest a rise draws, when it may stand now beside the crests
    /// standing with it.
    fn crest_of(&self, rise: &Rise, room: f64, pending: &[Hop]) -> Option<Curve> {
        if !self.open(rise) {
            return None;
        }
        let runs = &self.scene.runs;
        let run = &runs[self.cluster(rise.cluster).run];
        let places: Vec<f64> = rise
            .crossings
            .iter()
            .map(|&crossing| at_on(run, &self.crossings[crossing]))
            .collect();
        let curve = crest_along(runs, run, &places, room, 1.0)?;
        let beneath: Vec<_> = rise
            .crossings
            .iter()
            .map(|&crossing| &runs[self.sides(rise.cluster, crossing).1.drawer])
            .collect();
        (!(crowded(&self.scene, run, &beneath, &curve, pending)
            || near_own_head(&self.scene, run, &curve)))
        .then_some(curve)
    }

    /// Stand every rise of a plan, or do nothing.
    fn attempt(&mut self, plan: &Plan) {
        let mut crests: Vec<Hop> = Vec::new();
        for rise in &plan.rises {
            let Some(curve) = self.crest_of(rise, plan.room, &crests) else {
                return;
            };
            let axis = self.scene.runs[self.cluster(rise.cluster).run].axis;
            crests.push(Hop::new(curve, axis));
        }
        for (rise, crest) in plan.rises.iter().zip(crests) {
            self.stand(rise, crest.curve);
        }
    }

    /// Record one standing hop over a rise's crossings.
    fn stand(&mut self, rise: &Rise, curve: Curve) {
        for &crossing in &rise.crossings {
            self.settled[crossing] = true;
            self.risen[crossing] = Some(rise.cluster);
        }
        let axis = self.scene.runs[self.cluster(rise.cluster).run].axis;
        self.stood.push(rise.clone());
        self.scene.hops.push(Hop::new(curve, axis));
    }

    /// The bridges the standing hops draw, then the cuts, and the hop each
    /// route's straight segments carry, by segment: the hop on every route of
    /// the rising trunk, which `crest_along` found each to hold all of.
    fn finish(self) -> (Vec<DrawingBridge>, Vec<BTreeMap<usize, Vec<Curve>>>) {
        let mut replacements: Vec<BTreeMap<usize, Vec<Curve>>> =
            vec![BTreeMap::new(); self.edges().len()];
        let mut bridges = Vec::new();
        for (rise, hop) in self.stood.iter().zip(&self.scene.hops) {
            let run = &self.scene.runs[self.cluster(rise.cluster).run];
            let mut under = Vec::new();
            let mut members = Vec::new();
            for &crossing in &rise.crossings {
                let (line, beneath) = self.sides(rise.cluster, crossing);
                under.extend(self.ids_of(beneath));
                members.extend(line.members.iter().copied());
            }
            for member in unique(members) {
                let member = &self.scene.runs[member];
                replacements[member.edge_index]
                    .entry(member.segment_index)
                    .or_default()
                    .push(carried(&hop.curve, run, member));
            }
            bridges.push(DrawingBridge {
                edge_id: self.edges()[run.edge_index].edge.id.clone(),
                under: unique(under),
                curve: hop.curve.clone(),
                join: None,
            });
        }
        bridges.extend(self.cuts);
        (bridges, replacements)
    }

    /// The ids of the routes a drawn line holds, each once.
    fn ids_of(&self, line: &Line) -> Vec<String> {
        unique(
            line.members
                .iter()
                .map(|&member| {
                    self.edges()[self.scene.runs[member].edge_index]
                        .edge
                        .id
                        .clone()
                })
                .collect(),
        )
    }

    /// How a line stands when choosing which rises: its emphasis, then whether
    /// it is drawn as one solid line.
    fn standing_of(&self, line: &Line) -> [f64; 2] {
        let edge = &self.edges()[self.scene.runs[line.drawer].edge_index].edge;
        let look = look_of(self.lines, &edge.id);
        let solid = look.dash == Dash::Solid;
        [weight(edge.emphasis), if solid { 1.0 } else { 0.0 }]
    }

    /// How far one line stands ahead of another it would rise over, in weight
    /// and in solidity; or nothing where it may not rise over it at all: a
    /// dashed or dotted line over a solid one.
    fn lead_over(&self, upper: &Line, lower: &Line) -> Option<[f64; 2]> {
        let [weight, solid] = self.standing_of(upper);
        let [under, solid_under] = self.standing_of(lower);
        (solid >= solid_under).then_some([weight - under, solid - solid_under])
    }

    /// How much straight room a rise's line has at its crossings, up to all a
    /// hop could want.
    fn room_of(&self, rise: &Rise) -> f64 {
        let runs = &self.scene.runs;
        let run = &runs[self.cluster(rise.cluster).run];
        min(rise.crossings.iter().map(|&crossing| {
            let point = self.crossings[crossing].point;
            js_min(ROOM_CAP, straightness(runs, run, run.axis.of(point), true))
        }))
    }

    /// A plan with its place in the order plans are tried: the plans whose
    /// rising lines outweigh the lines beneath them, then those between
    /// equals, then those whose rising lines are lighter; within each, by
    /// stage; then the roomier; then the later-painted. Nothing where a line
    /// in it may not stand over the one beneath it.
    fn plan_of(&self, stage: f64, room: f64, rises: Vec<Rise>) -> Option<Plan> {
        let mut leads = Vec::new();
        for rise in &rises {
            for &crossing in &rise.crossings {
                let (upper, lower) = self.sides(rise.cluster, crossing);
                leads.push(self.lead_over(upper, lower));
            }
        }
        let leads: Vec<[f64; 2]> = leads.into_iter().collect::<Option<_>>()?;
        let weight = min(leads.iter().map(|lead| lead[0]));
        let roomy =
            min(std::iter::once(ROOM_CAP).chain(rises.iter().map(|rise| self.room_of(rise))));
        let painted = max(std::iter::once(-1.0).chain(
            rises
                .iter()
                .map(|rise| self.scene.runs[self.cluster(rise.cluster).run].edge_index as f64),
        ));
        // Round the room so a hair of floating noise never outranks paint order.
        let key = [-sign(weight), stage, -round(roomy / STRAIGHTER), -painted];
        Some(Plan { rises, room, key })
    }

    /// Whether the lines beneath a rise pass beneath it at every crossing of it.
    fn passable(&self, rise: &Rise) -> bool {
        let runs = &self.scene.runs;
        rise.crossings.iter().all(|&crossing| {
            let beneath = &runs[self.sides(rise.cluster, crossing).1.drawer];
            passes_beneath(runs, beneath, self.crossings[crossing].point, 1.0)
        })
    }

    /// The whole of a cluster rising.
    fn whole_of(&self, cluster: usize) -> Rise {
        Rise {
            cluster,
            crossings: self.cluster(cluster).crossings.clone(),
        }
    }

    /// The plan of a cluster's crossers hopping it one each. Nothing where a
    /// crosser may not rise over the cluster's line, such as a dashed crosser
    /// of a solid line: the cluster's line rises over it instead, since a
    /// crossing left plain has no arc to say which line passes over
    /// (TASK-570).
    fn one_each(&self, cluster: usize) -> Option<Plan> {
        let mut rises: Vec<Rise> = Vec::new();
        for &crossing in &self.cluster(cluster).crossings {
            let rise = self.whole_of(self.other_cluster(cluster, crossing));
            if !rises.iter().any(|one| one.cluster == rise.cluster) {
                rises.push(rise);
            }
        }
        self.plan_of(0.0, FULL_ROOM, rises)
    }

    /// Whether a cluster's crossers ride one route and are hopped as one ribbon.
    fn ribbon(&self, cluster: usize) -> bool {
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

    /// The plans one cluster offers, by stage: its crossers hopping it one
    /// each with a bend's room, or, for a lone crossing no other line crosses
    /// among others, its line hopping it; then its line rising over all of it
    /// with a bend's room, and then with less; last, its line rising over any
    /// single crossing of it with less room. A lone crossing another line
    /// crosses among others waits for that line's cluster to be settled.
    fn plans_of(&self, cluster: usize) -> Vec<Plan> {
        let crossings = &self.cluster(cluster).crossings;
        let several = crossings.len() > 1;
        let alone = !several
            && self
                .cluster(self.other_cluster(cluster, crossings[0]))
                .crossings
                .len()
                == 1;
        let mut plans = Vec::new();
        if several && !self.ribbon(cluster) {
            plans.extend(self.one_each(cluster));
        }
        if alone {
            plans.extend(self.plan_of(0.0, FULL_ROOM, vec![self.whole_of(cluster)]));
        }
        if several {
            plans.extend(self.plan_of(1.0, FULL_ROOM, vec![self.whole_of(cluster)]));
            plans.extend(self.plan_of(2.0, LEAST_ROOM, vec![self.whole_of(cluster)]));
        }
        for &crossing in crossings {
            let single = Rise {
                cluster,
                crossings: vec![crossing],
            };
            plans.extend(self.plan_of(3.0, LEAST_ROOM, vec![single]));
        }
        plans.retain(|plan| plan.rises.iter().all(|rise| self.passable(rise)));
        plans
    }

    /// The lines that may rise over a crossing alone, by their clusters, the
    /// one to try first first: the line that would stay whole, then the
    /// other. Beside a join only the line that does not join rises, since an
    /// arc on the joining line would part the join from its mark.
    fn risers(&self, crossing: usize) -> Vec<usize> {
        let [first, second] = self.clusters.of[crossing];
        match self.upper_of(crossing) {
            (true, true) => vec![second],
            (true, false) => vec![first],
            (false, true) => vec![first, second],
            (false, false) => vec![second, first],
        }
    }

    /// Hop a crossing no plan settled: each line that may rise over it alone,
    /// in order, with the least room; bulging the usual way first, then, where
    /// only the other side is clear of a bend, the other way. True when a hop
    /// stands.
    fn hop_alone(&mut self, crossing: usize) -> bool {
        let order = self.risers(crossing);
        [1.0, -1.0].into_iter().any(|bulge| {
            order
                .iter()
                .any(|&cluster| self.rise_alone(cluster, crossing, bulge))
        })
    }

    /// Stand one line's hop over a single crossing, where the line has the
    /// least room a hop needs, the line beneath runs straight under it, and
    /// nothing crowds it. True when it stands.
    fn rise_alone(&mut self, cluster: usize, crossing: usize, bulge: Bulge) -> bool {
        let runs = &self.scene.runs;
        let run = &runs[self.cluster(cluster).run];
        let beneath = &runs[self.sides(cluster, crossing).1.drawer];
        let point = self.crossings[crossing].point;
        if !passes_beneath(runs, beneath, point, bulge) {
            return false;
        }
        let place = at_on(run, &self.crossings[crossing]);
        let Some(curve) = crest_along(runs, run, &[place], LEAST_ROOM, bulge) else {
            return false;
        };
        if crowded(&self.scene, run, &[beneath], &curve, &[])
            || near_own_head(&self.scene, run, &curve)
        {
            return false;
        }
        let rise = Rise {
            cluster,
            crossings: vec![crossing],
        };
        self.stand(&rise, curve);
        true
    }

    /// Settle a crossing that no hop stands over, where neither line has the
    /// least straight room a hop needs. The two lines cross plainly and both
    /// stay whole, since a gap with no arc over it reads as a break in the
    /// line (TASK-408). Only beside a join is a line cut: the line that joins
    /// stays whole, and the other is cut beneath it clear of the join's mark,
    /// so the crossing does not read as a four-way join.
    fn cross(&mut self, crossing: usize) {
        self.settled[crossing] = true;
        let (joined, one_joins) = self.upper_of(crossing);
        if !joined {
            return;
        }
        let [one, other] = &self.crossings[crossing].lines;
        let (upper, lower) = if one_joins {
            (one, other)
        } else {
            (other, one)
        };
        let drawer = &self.scene.runs[upper.drawer];
        let bridge = DrawingBridge {
            edge_id: self.edges()[drawer.edge_index].edge.id.clone(),
            under: self.ids_of(lower),
            curve: piece_of(
                drawer,
                at_on(drawer, &self.crossings[crossing]),
                BRIDGE_RADIUS,
            ),
            join: Some(true),
        };
        self.cuts.push(bridge);
    }

    /// Settle every crossing: the cluster plans in their order, then a hop
    /// over each crossing they left, then a hop with less room over each crossing
    /// still left, and last a plain crossing where no hop fits at all.
    fn settle(&mut self) {
        let plans: Vec<Plan> = (0..self.clusters.all.len())
            .flat_map(|cluster| self.plans_of(cluster))
            .collect();
        for plan in sorted_by(&plans, by_key) {
            self.attempt(&plan);
        }
        for crossing in 0..self.crossings.len() {
            if !self.settled[crossing] {
                self.hop_alone(crossing);
            }
        }
        for crossing in 0..self.crossings.len() {
            if !self.settled[crossing] && !self.force(crossing) {
                self.cross(crossing);
            }
        }
    }

    /// Which line a hop stands on is a cable's strand, by the cable's leading line, if it is one.
    fn cable_of(&self, hop: usize) -> Option<&String> {
        let run = &self.scene.runs[self.cluster(self.stood[hop].cluster).run];
        let id = &self.edges()[run.edge_index].edge.id;
        self.riders.get(id).or_else(|| {
            self.riders
                .values()
                .any(|leader| leader == id)
                .then_some(id)
        })
    }

    /// Make the hops of a cable's strands over one place all bulge the same way, so they read
    /// as one ribbon passing over, never as a tube with its outer strand turned out. The place
    /// turns to a way where no turned hop is crowded, the way most of them bulge first (the
    /// usual way between equals); else each line its hops pass over rises over the ribbon
    /// instead; else it turns to the way that crowds least, as a lone hop with no clear way does
    /// (`force`). A hop turns only where the lines beneath still pass under it, and its own
    /// cable's strands never crowd it.
    fn align_cables(&mut self) {
        let mut places = self.cable_places();
        places.reverse();
        while let Some(place) = places.pop() {
            if self.align(&place) {
                self.unstand(&place);
                for index in places.iter_mut().flatten() {
                    *index -= place.iter().filter(|&&removed| removed < *index).count();
                }
            }
        }
    }

    /// Cable hops sharing a crossing cluster on the line beneath them. A crest can
    /// connect several such clusters when it spans several lines.
    fn cable_places(&self) -> Vec<Vec<usize>> {
        let mut by_crossing = BTreeMap::new();
        let mut links = vec![Vec::new(); self.stood.len()];
        for (index, rise) in self.stood.iter().enumerate() {
            let Some(leader) = self.cable_of(index) else {
                continue;
            };
            for &crossing in &rise.crossings {
                let other = self.other_cluster(rise.cluster, crossing);
                let first = *by_crossing.entry((leader, other)).or_insert(index);
                if first != index {
                    links[first].push(index);
                    links[index].push(first);
                }
            }
        }

        connected_hops(&links)
    }

    /// Make the hops of one place of a cable bulge one way (`align_cables`). True where the
    /// lines they pass over rose over the ribbon instead, so the place's hops are to come down.
    fn align(&mut self, place: &[usize]) -> bool {
        let sides: Vec<Bulge> = place
            .iter()
            .map(|&index| bulge_of(&self.scene.hops[index]))
            .collect();
        if sides.iter().all(|side| *side == sides[0]) {
            return false;
        }
        let turnings = self.turnings(place, &sides);
        if let Some((turned, _)) = turnings.iter().find(|(_, nearest)| *nearest > 1.0) {
            self.turn(turned);
            return false;
        }
        if self.over_ribbon(place) {
            return true;
        }
        let least = (turnings.iter()).reduce(|best, one| if one.1 > best.1 { one } else { best });
        if let Some((turned, _)) = least {
            self.turn(turned);
        }
        false
    }

    /// The ways the hops of one place of a cable could all bulge one way (`align_cables`), the
    /// way most of them bulge first: the hops to turn, each with its turned curve, and how near
    /// the most crowded of them comes to what crowds it. Leave out a way where a turned hop
    /// would not pass over its lines.
    fn turnings(&mut self, place: &[usize], sides: &[Bulge]) -> Vec<(Vec<(usize, Curve)>, f64)> {
        let up = sides.iter().filter(|&&one| one > 0.0).count();
        let first = if 2 * up >= sides.len() { 1.0 } else { -1.0 };
        let runs: Vec<usize> = (place.iter())
            .map(|&index| self.cluster(self.stood[index].cluster).run)
            .collect();
        let flips: Vec<Curve> = (place.iter())
            .map(|&index| flipped(&self.scene.hops[index]))
            .collect();
        self.without(place, |settling| {
            [first, -first]
                .into_iter()
                .filter_map(|bulge| {
                    let mut nearest = f64::INFINITY;
                    let turned = (place.iter().zip(sides).zip(&flips))
                        .filter(|&((_, &now), _)| now != bulge)
                        .map(|((&index, _), curve)| {
                            let curve = curve.clone();
                            let near = settling.turned_nearness(index, &curve, bulge, &runs)?;
                            nearest = nearest.min(near);
                            Some((index, curve))
                        })
                        .collect::<Option<Vec<_>>>()?;
                    Some((turned, nearest))
                })
                .collect()
        })
    }

    /// Stand turned hops in place of theirs.
    fn turn(&mut self, turned: &[(usize, Curve)]) {
        for (index, curve) in turned {
            let axis = self.scene.hops[*index].axis;
            self.scene.hops[*index] = Hop::new(curve.clone(), axis);
        }
    }

    /// Where the hops of one place of a cable cannot all bulge one way, each line they pass over
    /// rises over the whole ribbon instead, under one crest, the usual way or else the other.
    /// True when every such crest stands; the place's hops are then to come down.
    fn over_ribbon(&mut self, place: &[usize]) -> bool {
        let rises: Vec<Rise> = place
            .iter()
            .map(|&index| self.stood[index].clone())
            .collect();
        // The crossings each line beneath the ribbon passes, by that line's cluster.
        let mut lines: BTreeMap<usize, Vec<(usize, usize)>> = BTreeMap::new();
        for rise in &rises {
            for &crossing in &rise.crossings {
                lines
                    .entry(self.other_cluster(rise.cluster, crossing))
                    .or_default()
                    .push((crossing, self.cluster(rise.cluster).run));
            }
        }
        let crests = self.without(place, |settling| {
            let runs = &settling.scene.runs;
            let mut crests: Vec<(Rise, Curve)> = Vec::new();
            for (&other, crossed) in &lines {
                let cluster = settling.cluster(other);
                let run = &runs[cluster.run];
                let may_rise = crossed.iter().all(|&(crossing, _)| {
                    let (upper, lower) = settling.sides(other, crossing);
                    settling.risers(crossing).contains(&other)
                        && settling.lead_over(upper, lower).is_some()
                });
                if !may_rise {
                    return None;
                }
                let places: Vec<f64> = (crossed.iter())
                    .map(|&(crossing, _)| at_on(run, &settling.crossings[crossing]))
                    .collect();
                let strands: Vec<&Run> = crossed.iter().map(|&(_, strand)| &runs[strand]).collect();
                let pending: Vec<Hop> = (crests.iter())
                    .map(|(_, curve)| Hop::new(curve.clone(), run.axis))
                    .collect();
                let curve = [1.0, -1.0].into_iter().find_map(|bulge| {
                    let beneath = (crossed.iter()).all(|&(crossing, strand)| {
                        let point = settling.crossings[crossing].point;
                        passes_beneath(runs, &runs[strand], point, bulge)
                    });
                    beneath.then_some(())?;
                    [FULL_ROOM, LEAST_ROOM]
                        .into_iter()
                        .filter_map(|room| crest_along(runs, run, &places, room, bulge))
                        .find(|curve| {
                            let feet = [curve.from, curve.end()].map(|point| run.axis.of(point));
                            let low = min(feet);
                            let high = max(feet);
                            let spans_other = cluster.crossings.iter().any(|&crossing| {
                                let at = run.axis.of(settling.crossings[crossing].point);
                                at > low
                                    && at < high
                                    && !crossed.iter().any(|&(covered, _)| covered == crossing)
                            });
                            !spans_other
                                && !crowded(&settling.scene, run, &strands, curve, &pending)
                                && !near_own_head(&settling.scene, run, curve)
                                && mark_crowding(&settling.scene, run, curve) > 1.0
                        })
                })?;
                let crossings = crossed.iter().map(|&(crossing, _)| crossing).collect();
                crests.push((
                    Rise {
                        cluster: other,
                        crossings,
                    },
                    curve,
                ));
            }
            Some(crests)
        });
        let Some(crests) = crests else {
            return false;
        };
        for (rise, curve) in crests {
            self.stand(&rise, curve);
        }
        true
    }

    /// How near a hop turned to bulge one way comes to what crowds it, as a share of the clear
    /// space it keeps, its cable's other strands at the place aside; None where it would not
    /// pass over its lines.
    fn turned_nearness(
        &self,
        index: usize,
        curve: &Curve,
        bulge: Bulge,
        siblings: &[usize],
    ) -> Option<f64> {
        let rise = &self.stood[index];
        let runs = &self.scene.runs;
        let run = &runs[self.cluster(rise.cluster).run];
        let mut beneath: Vec<&Run> = Vec::new();
        for &crossing in &rise.crossings {
            let under = &runs[self.sides(rise.cluster, crossing).1.drawer];
            if !passes_beneath(runs, under, self.crossings[crossing].point, bulge) {
                return None;
            }
            beneath.push(under);
        }
        beneath.extend(siblings.iter().map(|&sibling| &runs[sibling]));
        Some(min([
            crowding(&self.scene, run, &beneath, curve, &[]),
            own_head_crowding(&self.scene, run, curve),
            mark_crowding(&self.scene, run, curve),
        ]))
    }

    /// Which of a crossing's two lines would stay whole: a line that joins or
    /// parts there, since cutting it would sever the join from its mark; else
    /// the weightier, the solid, the one that runs straighter through the
    /// crossing, the later-painted. Whether the one staying whole joins there,
    /// and whether it is the first line.
    fn upper_of(&self, crossing: usize) -> (bool, bool) {
        let runs = &self.scene.runs;
        let DrawnCrossing { point, lines } = &self.crossings[crossing];
        let joins = lines.each_ref().map(|line| {
            let drawer = &runs[line.drawer];
            join_near(runs, drawer, drawer.axis.of(*point), JOIN_REACH)
        });
        if joins[0] != joins[1] {
            return (true, joins[0]);
        }
        let [one, other] = lines.each_ref().map(|line| {
            let drawer = &runs[line.drawer];
            let [weight, solid] = self.standing_of(line);
            [
                weight,
                solid,
                straightness(runs, drawer, drawer.axis.of(*point), true) / STRAIGHTER,
                drawer.edge_index as f64,
            ]
        });
        let first = one
            .iter()
            .zip(other)
            .find(|&(value, other)| (value - other).abs() >= 1.0);
        (false, first.is_some_and(|(value, other)| *value > other))
    }
}

/// The groups of standing hops linked by the crossed lines they share.
fn connected_hops(links: &[Vec<usize>]) -> Vec<Vec<usize>> {
    let mut places = Vec::new();
    let mut seen = vec![false; links.len()];
    for index in 0..links.len() {
        if seen[index] || links[index].is_empty() {
            continue;
        }
        let mut place = Vec::new();
        let mut pending = vec![index];
        seen[index] = true;
        while let Some(hop) = pending.pop() {
            place.push(hop);
            for &neighbour in &links[hop] {
                if !seen[neighbour] {
                    seen[neighbour] = true;
                    pending.push(neighbour);
                }
            }
        }
        places.push(place);
    }
    places
}

/// The values without repeats, each where it first stood.
fn unique<T: PartialEq>(values: Vec<T>) -> Vec<T> {
    let mut kept = Vec::new();
    for value in values {
        if !kept.contains(&value) {
            kept.push(value);
        }
    }
    kept
}

/// Which way a hop bulges: 1 up from a line across or right of a line down, -1 the other way.
fn bulge_of(hop: &Hop) -> Bulge {
    let crest = hop.curve.segments[0].to();
    match hop.axis {
        Axis::X => sign(hop.curve.from.y - crest.y),
        Axis::Y => sign(crest.x - hop.curve.from.x),
    }
}

/// Compare two plans' places in the order: below zero when `a` goes first.
fn by_key(a: &Plan, b: &Plan) -> f64 {
    a.key
        .iter()
        .zip(b.key)
        .find(|&(value, other)| *value != other)
        .map_or(0.0, |(value, other)| value - other)
}

/// Raises one line over each crossing, and lets the two lines cross plainly
/// only where neither runs straight past a hop's feet, on routes whose folded crossings
/// have already moved onto straight runs (`bridgeUnfolded`) or whose planner
/// fixed them. No placement moves, and painters and interaction geometry
/// share the resulting curves.
pub(crate) fn bridge_unfolded(
    drawing: &ArchitectureDrawing<NodeFacts, EdgeFacts>,
    lines: &BTreeMap<String, LineLook>,
    riders: &BTreeMap<String, String>,
) -> Bridged<EdgeFacts> {
    let edges = &drawing.edges;
    let runs = straight_runs(edges);
    let crossings = drawn_crossings(edges, &runs);
    if crossings.is_empty() {
        return Bridged {
            edges: edges.clone(),
            bridges: Vec::new(),
        };
    }
    let clusters = clusters_of(&runs, &crossings);
    let mut state = Settling {
        scene: HopScene::new(drawing, runs, lines),
        lines,
        riders,
        settled: vec![false; crossings.len()],
        risen: vec![None; crossings.len()],
        crossings,
        clusters,
        stood: Vec::new(),
        cuts: Vec::new(),
    };
    state.settle();
    state.align_cables();
    let (bridges, replacements) = state.finish();
    Bridged {
        edges: edges
            .iter()
            .zip(&replacements)
            .map(|(edge, replacements)| replace_runs(edge, replacements))
            .collect(),
        bridges,
    }
}

/// Settles a drawing's crossings (`bridgeCrossings`): a crossing folded into
/// two corners first moves onto straight runs, taking a label on a moved lane
/// along ([`unfold_crossings`]), and then each crossing is hopped or crossed
/// plainly ([`bridge_unfolded`]).
pub(crate) fn bridge_crossings(
    settled: &ArchitectureDrawing<NodeFacts, EdgeFacts>,
    lines: &BTreeMap<String, LineLook>,
    riders: &BTreeMap<String, String>,
) -> Bridged<EdgeFacts> {
    bridge_unfolded(&unfold_crossings(settled), lines, riders)
}
