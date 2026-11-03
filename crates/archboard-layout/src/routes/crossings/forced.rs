//! A crossing no hop with a bend's room fits still gets an arc: a hop that
//! stands wherever a line runs straight past both of its feet (TASK-570).

use archboard_scene::geometry::Curve;

use super::super::hops::{Bulge, crowded, hop_fits, hump, near_own_head};
use super::{Rise, Settling, at_on};

impl Settling<'_> {
    /// Whether a cluster's line lies beneath another line at none of its
    /// crossings, so rising over one more keeps it above along all of them.
    fn above_along(&self, cluster: usize) -> bool {
        self.cluster(cluster)
            .crossings
            .iter()
            .all(|&crossing| self.risen[crossing].is_none_or(|risen| risen == cluster))
    }

    /// Stand a hop over a crossing the other stages left, on a line that runs
    /// straight past both of its feet. The lines a hop fits on are ranked: one
    /// its look lets rise over the other, then one not hopped along its
    /// cluster, then one whose hop keeps clear of an arrowhead's approach. The
    /// first hop that bulges to a side clear of other ink stands, else the
    /// first of them. True when a hop stands.
    pub(super) fn force(&mut self, crossing: usize) -> bool {
        let point = self.crossings[crossing].point;
        let mut ranked: Vec<([bool; 3], usize)> = Vec::new();
        for cluster in self.risers(crossing) {
            let (line, beneath) = self.sides(cluster, crossing);
            let may = self.lead_over(line, beneath).is_some();
            let above = self.above_along(cluster);
            let run = &self.scene.runs[self.cluster(cluster).run];
            for rooms in [true, false] {
                if hop_fits(&self.scene, run, run.axis.of(point), rooms) {
                    ranked.push(([may, above, rooms], cluster));
                }
            }
        }
        ranked.sort_by_key(|&(key, _)| std::cmp::Reverse(key));
        let clear = ranked.iter().find_map(|&(_, cluster)| {
            [1.0, -1.0]
                .into_iter()
                .map(|bulge| self.hop_over(cluster, crossing, bulge))
                .find(|curve| !self.crowds(cluster, crossing, curve))
                .map(|curve| (cluster, curve))
        });
        let Some((cluster, curve)) = clear.or_else(|| {
            ranked
                .first()
                .map(|&(_, cluster)| (cluster, self.hop_over(cluster, crossing, 1.0)))
        }) else {
            return false;
        };
        let rise = Rise {
            cluster,
            crossings: vec![crossing],
        };
        self.stand(&rise, curve);
        true
    }

    /// A hop over one crossing, on a cluster's line.
    fn hop_over(&self, cluster: usize, crossing: usize, bulge: Bulge) -> Curve {
        let run = &self.scene.runs[self.cluster(cluster).run];
        let place = at_on(run, &self.crossings[crossing]);
        hump(run, place, place, bulge)
    }

    /// Whether a hop over one crossing, on a cluster's line, comes too near
    /// other ink or its own line's arrowhead.
    fn crowds(&self, cluster: usize, crossing: usize, curve: &Curve) -> bool {
        let runs = &self.scene.runs;
        let run = &runs[self.cluster(cluster).run];
        let beneath = &runs[self.sides(cluster, crossing).1.drawer];
        crowded(&self.scene, run, &[beneath], curve, &[]) || near_own_head(&self.scene, run, curve)
    }
}
