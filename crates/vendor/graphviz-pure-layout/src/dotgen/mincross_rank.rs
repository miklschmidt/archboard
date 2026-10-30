//! archboard: not in C. What `reorder` reads of a rank's nodes, copied by the node's place
//! in the rank when the call starts, so its passes read one dense array instead of a large
//! `NodeInfo` per node. `reorder` exchanges places in a permutation of that array and
//! writes the rank back once, as `exchange` would have left it.

use super::Dot;
use super::types::{AdjMatrix, CLUSTER, G, N, VIRTUAL};

/// What `reorder` reads of the node at one place.
#[derive(Debug, Clone, Copy)]
pub(super) struct Place<'a> {
    pub(super) node: N,
    /// `ND_order`, which the place keeps.
    order: i32,
    /// `ND_mval`.
    pub(super) mval: f64,
    /// `ND_clust`.
    pub(super) clust: Option<G>,
    /// `ND_ranktype == CLUSTER && ND_node_type == VIRTUAL`.
    cluster_virtual: bool,
    /// `ND_low`, which indexes the rank's flat adjacency matrix.
    low: usize,
    /// The flat adjacency matrix of the node's rank.
    flat: Option<&'a AdjMatrix>,
}

/// A rank's nodes as `reorder` reads them, by their place when the copy was made.
#[derive(Debug)]
pub(super) struct RankCopy<'a> {
    pub(super) places: Vec<Place<'a>>,
    remincross: bool,
    flip: bool,
}

impl<'a> RankCopy<'a> {
    /// The nodes of rank `r` of `g`.
    pub(super) fn of(dot: &'a Dot<'_>, g: G, r: i32) -> Self {
        let places = (0..dot.rank_n(g, r))
            .map(|i| {
                let node = dot.rv(g, r, i).unwrap();
                let info = &dot.nodes[node];
                Place {
                    node,
                    order: info.order,
                    mval: info.mval,
                    clust: info.clust,
                    cluster_virtual: info.ranktype == CLUSTER && info.node_type == VIRTUAL,
                    low: info.low as usize,
                    flat: dot.rk(g, info.rank).flat.as_ref(),
                }
            })
            .collect();
        RankCopy {
            places,
            remincross: dot.remincross,
            flip: dot.graphs[g].flip(),
        }
    }

    /// `left2right(g, v, w)` of the nodes first at places `v` and `w`.
    pub(super) fn left2right(&self, v: usize, w: usize) -> bool {
        let (pv, pw) = (&self.places[v], &self.places[w]);
        if !self.remincross {
            if pv.clust != pw.clust && pv.clust.is_some() && pw.clust.is_some() {
                if pv.cluster_virtual {
                    return false;
                }
                if pw.cluster_virtual {
                    return false;
                }
                return true;
            }
        } else if pv.clust != pw.clust {
            return true;
        }
        let Some(m) = pv.flat else {
            return false;
        };
        let (a, b) = if self.flip { (pw, pv) } else { (pv, pw) };
        m.get(a.low, b.low)
    }

    /// `reorder`'s passes over the rank: they exchange places in `at` and answer whether
    /// any pass exchanged anything.
    pub(super) fn passes(&self, at: &mut [usize], reverse: bool, hasfixed: bool) -> bool {
        let mut changed = 0;
        let n = self.places.len() as i32;
        let mut ep = n as usize;
        let mut nelt = n - 1;
        while nelt >= 0 {
            // archboard: a pass that exchanges nothing leaves the rank as it was, and every
            // later pass compares the same pairs, or a prefix of them as `ep` falls, so it
            // exchanges nothing either. C runs them all; the port stops here.
            let changed_before = changed;
            let mut lp = 0;
            while lp < ep {
                while lp < ep && self.places[at[lp]].mval < 0.0 {
                    lp += 1;
                }
                if lp >= ep {
                    break;
                }
                let mut sawclust = false;
                let mut muststay = false;
                let lpn = at[lp];
                let mut rp = lp + 1;
                while rp < ep {
                    let rpn = at[rp];
                    if sawclust && self.places[rpn].clust.is_some() {
                        rp += 1;
                        continue;
                    }
                    if self.left2right(lpn, rpn) {
                        muststay = true;
                        break;
                    }
                    if self.places[rpn].mval >= 0.0 {
                        break;
                    }
                    if self.places[rpn].clust.is_some() {
                        sawclust = true;
                    }
                    rp += 1;
                }
                if rp >= ep {
                    break;
                }
                if !muststay {
                    let rpn = at[rp];
                    let p1 = self.places[lpn].mval;
                    let p2 = self.places[rpn].mval;
                    if p1 > p2 || (p1 >= p2 && reverse) {
                        at.swap(lp, rp);
                        changed += 1;
                    }
                }
                lp = rp;
            }
            if changed == changed_before {
                break;
            }
            if !hasfixed && !reverse {
                ep -= 1;
            }
            nelt -= 1;
        }
        changed != 0
    }

    /// What `reorder`'s passes leave of a rank whose every node has a median
    /// (`ND_mval >= 0`), with `remincross` set and no flat edges, without running them all:
    /// whether a pass exchanged anything, with `at` left as the passes leave it. None for
    /// any other rank, which runs the passes.
    ///
    /// In such a rank `left2right` holds exactly between nodes of different clusters, so a
    /// pass compares each place with the next, exchanges them only within a cluster, and
    /// every place keeps the cluster it started with. The rank is a row of segments, places
    /// of one cluster each, that a pass sorts apart from each other.
    ///
    /// Without `reverse` a pass exchanges a strictly greater median with the next, so the
    /// passes are a bubble sort of each segment: they leave it sorted stably by median, as
    /// an insertion sort does. `ep` falling never cuts a segment short, because it falls by
    /// one a pass while a segment's sorted tail grows by one.
    ///
    /// With `reverse` a pass exchanges equal medians too, and runs while it exchanges
    /// something, up to one pass per node. The passes run here until every segment is
    /// sorted. From then on a pass moves the first node of each run of equal medians to the
    /// end of that run, so the passes left rotate each run by their number.
    pub(super) fn sorted_by_segments(&self, at: &mut [usize], reverse: bool) -> Option<bool> {
        let places = &self.places;
        if !self.remincross || places.iter().any(|p| p.mval < 0.0 || p.flat.is_some()) {
            return None;
        }
        let n = places.len();
        // Whether the place after each place is of the same cluster: a pass compares them.
        let joined: Vec<bool> = (0..n.saturating_sub(1))
            .map(|i| places[i].clust == places[i + 1].clust)
            .collect();
        let mval = |at: &[usize], i: usize| places[at[i]].mval;
        let sorted =
            |at: &[usize]| (0..joined.len()).all(|i| !joined[i] || mval(at, i) <= mval(at, i + 1));
        if !reverse {
            if sorted(at) {
                return Some(false);
            }
            for i in 1..n {
                let mut j = i;
                while j > 0 && joined[j - 1] && mval(at, j - 1) > mval(at, j) {
                    at.swap(j - 1, j);
                    j -= 1;
                }
            }
            return Some(true);
        }
        let mut changed = false;
        let mut passes = 0;
        while !sorted(at) {
            if passes == n {
                return Some(changed);
            }
            for i in 0..joined.len() {
                if joined[i] && mval(at, i) >= mval(at, i + 1) {
                    at.swap(i, i + 1);
                    changed = true;
                }
            }
            passes += 1;
        }
        let left = n - passes;
        if left == 0 {
            return Some(changed);
        }
        let mut start = 0;
        while start < n {
            let mut end = start + 1;
            while end < n && joined[end - 1] && mval(at, end - 1) == mval(at, end) {
                end += 1;
            }
            let run = end - start;
            if run > 1 {
                at[start..end].rotate_left(left % run);
                changed = true;
            }
            start = end;
        }
        Some(changed)
    }

    /// The node and the `ND_order` of each place, once the copy's borrow of the graph
    /// must end.
    pub(super) fn into_places(self) -> Vec<(N, i32)> {
        self.places.iter().map(|p| (p.node, p.order)).collect()
    }
}

impl Dot<'_> {
    /// Writes rank `r` of `g` back with the node first at place `at[i]` now at place `i`,
    /// each with the `ND_order` of its new place, as `exchange` leaves them.
    pub(super) fn write_rank(&mut self, g: G, r: i32, places: &[(N, i32)], at: &[usize]) {
        for (i, &from) in at.iter().enumerate() {
            if from != i {
                let n = places[from].0;
                self.nodes[n].order = places[i].1;
                self.set_rv(g, r, i as i32, Some(n));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{Place, RankCopy};

    /// A small xorshift generator, so the ranks are the same on every run.
    struct Rng(u64);

    impl Rng {
        fn below(&mut self, n: u64) -> u64 {
            self.0 ^= self.0 << 13;
            self.0 ^= self.0 >> 7;
            self.0 ^= self.0 << 17;
            self.0 % n
        }
    }

    /// archboard: the sorted segments leave every rank they take as the passes leave it,
    /// on ranks of up to 40 nodes, few medians (so many ties) and up to three clusters.
    #[test]
    fn sorted_segments_leave_what_the_passes_leave() {
        let mut rng = Rng(0x9e37_79b9_7f4a_7c15);
        for _ in 0..20_000 {
            let n = rng.below(41) as usize;
            let medians = 1 + rng.below(8);
            let clusters = rng.below(4);
            let places: Vec<Place<'_>> = (0..n)
                .map(|i| Place {
                    node: i,
                    order: i as i32,
                    mval: (rng.below(medians) * 256) as f64,
                    clust: match rng.below(clusters + 1) {
                        0 => None,
                        c => Some(c as usize),
                    },
                    cluster_virtual: false,
                    low: i,
                    flat: None,
                })
                .collect();
            let rank = RankCopy {
                places,
                remincross: true,
                flip: false,
            };
            for reverse in [false, true] {
                for hasfixed in [false, true] {
                    let mut passed: Vec<usize> = (0..n).collect();
                    let changed = rank.passes(&mut passed, reverse, hasfixed);
                    let mut sorted: Vec<usize> = (0..n).collect();
                    let answer = rank.sorted_by_segments(&mut sorted, reverse);
                    assert_eq!(answer, Some(changed));
                    assert_eq!(sorted, passed);
                }
            }
        }
    }
}
