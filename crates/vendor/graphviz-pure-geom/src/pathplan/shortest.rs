//! `lib/pathplan/shortest.c`: Euclidean shortest path between two points
//! inside a simple polygon (triangulate, find the triangle strip, run the
//! funnel algorithm).

use super::Ppoint;
use super::triang::{ISCCW, ISCW, ccw, isdiagonal};

const NONE: usize = usize::MAX;

#[derive(Clone, Copy)]
struct Tedge {
    pnl0: usize,
    pnl1: usize,
    right_index: usize,
}

#[derive(Clone, Copy)]
struct Triangle {
    mark: i32,
    e: [Tedge; 3],
}

/// Point-and-link nodes: indices `0..pn` are polygon points, `pn` and
/// `pn + 1` the two endpoints.
struct Pnl {
    pp: Vec<Ppoint>,
    /// Identity of the underlying polygon point (for shared-edge tests).
    id: Vec<usize>,
    link: Vec<usize>,
}

struct Deque {
    pnlps: Vec<usize>,
    fpnlpi: usize,
    lpnlpi: usize,
    apex: usize,
}

impl Deque {
    fn add_front(&mut self, pnl: &mut Pnl, p: usize) {
        if self.lpnlpi >= self.fpnlpi {
            pnl.link[p] = self.pnlps[self.fpnlpi];
        }
        self.fpnlpi -= 1;
        self.pnlps[self.fpnlpi] = p;
    }
    fn add_back(&mut self, pnl: &mut Pnl, p: usize) {
        if self.lpnlpi >= self.fpnlpi {
            pnl.link[p] = self.pnlps[self.lpnlpi];
        }
        self.lpnlpi = self.lpnlpi.wrapping_add(1);
        self.pnlps[self.lpnlpi] = p;
    }
}

fn pointintri(tris: &[Triangle], pnl: &Pnl, trii: usize, p: Ppoint) -> bool {
    let mut sum = 0;
    for ei in 0..3 {
        let e = tris[trii].e[ei];
        if ccw(pnl.pp[e.pnl0], pnl.pp[e.pnl1], p) != ISCW {
            sum += 1;
        }
    }
    sum == 3 || sum == 0
}

fn marktripath(tris: &mut [Triangle], trii: usize, trij: usize) -> bool {
    if tris[trii].mark != 0 {
        return false;
    }
    tris[trii].mark = 1;
    if trii == trij {
        return true;
    }
    for ei in 0..3 {
        let r = tris[trii].e[ei].right_index;
        if r != NONE && marktripath(tris, r, trij) {
            return true;
        }
    }
    tris[trii].mark = 0;
    false
}

fn finddqsplit(dq: &Deque, pnl: &Pnl, p: usize) -> usize {
    let mut index = dq.fpnlpi;
    while index < dq.apex {
        if ccw(
            pnl.pp[dq.pnlps[index + 1]],
            pnl.pp[dq.pnlps[index]],
            pnl.pp[p],
        ) == ISCCW
        {
            return index;
        }
        index += 1;
    }
    let mut index = dq.lpnlpi;
    while index > dq.apex {
        if ccw(
            pnl.pp[dq.pnlps[index - 1]],
            pnl.pp[dq.pnlps[index]],
            pnl.pp[p],
        ) == ISCW
        {
            return index;
        }
        index -= 1;
    }
    dq.apex
}

/// `prerror(msg)` of `shortest.c`, with the C line number it reports.
fn prerror(line: u32, msg: &str) {
    graphviz_pure_core::diag::fprintf_stderr(&format!("lib/pathplan/shortest.c:{line}: {msg}\n"));
}

/// `Pshortestpath(polyp, eps, &output)`: `Err` when an endpoint is outside
/// the polygon or triangulation fails.
pub fn pshortestpath(
    poly: &[Ppoint],
    eps: [Ppoint; 2],
) -> Result<Vec<Ppoint>, super::PathplanError> {
    let pn = poly.len();
    // Load points in CCW order, dropping repeated points.
    let mut minpi = NONE;
    let mut minx = f64::INFINITY;
    for (i, p) in poly.iter().enumerate() {
        if minx > p.x {
            minx = p.x;
            minpi = i;
        }
    }
    let p2 = poly[minpi];
    let p1 = poly[if minpi == 0 { pn - 1 } else { minpi - 1 }];
    let p3 = poly[(minpi + 1) % pn];
    let mut order: Vec<usize> = Vec::with_capacity(pn);
    if (p1.x == p2.x && p2.x == p3.x && p3.y > p2.y) || ccw(p1, p2, p3) != ISCCW {
        for pi in (0..pn).rev() {
            if pi < pn - 1 && poly[pi].x == poly[pi + 1].x && poly[pi].y == poly[pi + 1].y {
                continue;
            }
            order.push(pi);
        }
    } else {
        for pi in 0..pn {
            if pi > 0 && poly[pi].x == poly[pi - 1].x && poly[pi].y == poly[pi - 1].y {
                continue;
            }
            order.push(pi);
        }
    }
    let pnll = order.len();
    let mut pnl = Pnl {
        pp: Vec::with_capacity(pnll + 2),
        id: Vec::with_capacity(pnll + 2),
        link: Vec::new(),
    };
    for &pi in &order {
        pnl.pp.push(poly[pi]);
        pnl.id.push(pi);
    }
    pnl.pp.push(eps[0]);
    pnl.id.push(NONE - 1);
    pnl.pp.push(eps[1]);
    pnl.id.push(NONE - 2);
    // pnls[k].link = &pnls[k % pn] initially.
    pnl.link = (0..pnll + 2)
        .map(|k| if k < pnll { k % pn } else { NONE })
        .collect();

    // Triangulate.
    let mut tris: Vec<Triangle> = Vec::new();
    let mut pts: Vec<usize> = (0..pnll).collect();
    loop {
        let n = pts.len();
        if n > 3 {
            let coords: Vec<Ppoint> = pts.iter().map(|&k| pnl.pp[k]).collect();
            let mut found = false;
            for i in 0..n {
                let ip1 = (i + 1) % n;
                let ip2 = (i + 2) % n;
                if isdiagonal(i, ip2, &coords) {
                    tris.push(make_tri(pts[i], pts[ip1], pts[ip2]));
                    pts.remove(ip1);
                    found = true;
                    break;
                }
            }
            if !found {
                // C keeps the triangles found so far.
                prerror(333, "triangulation failed");
                break;
            }
        } else {
            if n == 3 {
                tris.push(make_tri(pts[0], pts[1], pts[2]));
            }
            break;
        }
    }
    // Connect triangles sharing an edge.
    // archboard: C compares every edge of every triangle with every edge of each later
    // one, and each match sets both edges' `right_index` to the other triangle, the later
    // match over the earlier. The last match an edge sees is with the highest-numbered other
    // triangle that holds its two points, so each edge gets that one, found by sorting
    // the edges by their points.
    let mut ends: Vec<(usize, usize, usize, usize)> = Vec::with_capacity(tris.len() * 3);
    for (trii, tri) in tris.iter().enumerate() {
        for (ei, e) in tri.e.iter().enumerate() {
            let (a, b) = (pnl.id[e.pnl0], pnl.id[e.pnl1]);
            ends.push((a.min(b), a.max(b), trii, ei));
        }
    }
    ends.sort_unstable();
    for shared in ends.chunk_by(|x, y| (x.0, x.1) == (y.0, y.1)) {
        let last = shared[shared.len() - 1].2;
        let before = shared.iter().rev().map(|x| x.2).find(|&t| t != last);
        for &(_, _, trii, ei) in shared {
            let other = if trii == last { before } else { Some(last) };
            if let Some(other) = other {
                tris[trii].e[ei].right_index = other;
            }
        }
    }
    let Some(ftrii) = (0..tris.len()).find(|&t| pointintri(&tris, &pnl, t, eps[0])) else {
        prerror(182, "source point not in any triangle");
        return Err(super::PathplanError);
    };
    let Some(ltrii) = (0..tris.len()).find(|&t| pointintri(&tris, &pnl, t, eps[1])) else {
        prerror(193, "destination point not in any triangle");
        return Err(super::PathplanError);
    };
    if !marktripath(&mut tris, ftrii, ltrii) {
        // a straight line is better than failing
        prerror(203, "cannot find triangle path");
        return Ok(vec![eps[0], eps[1]]);
    }
    if ftrii == ltrii {
        return Ok(vec![eps[0], eps[1]]);
    }
    let e0 = pnll;
    let e1 = pnll + 1;
    let dqn = pn * 2;
    let mut dq = Deque {
        pnlps: vec![0; dqn],
        fpnlpi: dqn / 2,
        lpnlpi: dqn / 2 - 1,
        apex: 0,
    };
    dq.add_front(&mut pnl, e0);
    dq.apex = dq.fpnlpi;
    let mut trii = ftrii;
    while trii != NONE {
        tris[trii].mark = 2;
        let trip = tris[trii];
        let ei = (0..3)
            .find(|&ei| trip.e[ei].right_index != NONE && tris[trip.e[ei].right_index].mark == 1);
        let (lpnlp, rpnlp) = match ei {
            None => {
                if ccw(
                    eps[1],
                    pnl.pp[dq.pnlps[dq.fpnlpi]],
                    pnl.pp[dq.pnlps[dq.lpnlpi]],
                ) == ISCCW
                {
                    (dq.pnlps[dq.lpnlpi], e1)
                } else {
                    (e1, dq.pnlps[dq.lpnlpi])
                }
            }
            Some(ei) => {
                let pnlp = trip.e[(ei + 1) % 3].pnl1;
                if ccw(
                    pnl.pp[trip.e[ei].pnl0],
                    pnl.pp[pnlp],
                    pnl.pp[trip.e[ei].pnl1],
                ) == ISCCW
                {
                    (trip.e[ei].pnl1, trip.e[ei].pnl0)
                } else {
                    (trip.e[ei].pnl0, trip.e[ei].pnl1)
                }
            }
        };
        if trii == ftrii {
            dq.add_back(&mut pnl, lpnlp);
            dq.add_front(&mut pnl, rpnlp);
        } else if dq.pnlps[dq.fpnlpi] != rpnlp && dq.pnlps[dq.lpnlpi] != rpnlp {
            let split = finddqsplit(&dq, &pnl, rpnlp);
            dq.fpnlpi = split;
            dq.add_front(&mut pnl, rpnlp);
            if split > dq.apex {
                dq.apex = split;
            }
        } else {
            let split = finddqsplit(&dq, &pnl, lpnlp);
            dq.lpnlpi = split;
            dq.add_back(&mut pnl, lpnlp);
            if split < dq.apex {
                dq.apex = split;
            }
        }
        trii = NONE;
        for ei in 0..3 {
            let r = trip.e[ei].right_index;
            if r != NONE && tris[r].mark == 1 {
                trii = r;
                break;
            }
        }
    }
    let mut out = Vec::new();
    let mut p = e1;
    loop {
        out.push(pnl.pp[p]);
        if p == e0 {
            break;
        }
        let l = pnl.link[p];
        if l == NONE {
            break;
        }
        p = l;
    }
    out.reverse();
    Ok(out)
}

fn make_tri(a: usize, b: usize, c: usize) -> Triangle {
    Triangle {
        mark: 0,
        e: [
            Tedge {
                pnl0: a,
                pnl1: b,
                right_index: NONE,
            },
            Tedge {
                pnl0: b,
                pnl1: c,
                right_index: NONE,
            },
            Tedge {
                pnl0: c,
                pnl1: a,
                right_index: NONE,
            },
        ],
    }
}
