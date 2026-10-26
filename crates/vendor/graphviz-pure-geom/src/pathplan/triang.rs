//! `lib/pathplan/triang.c`: orientation tests and ear-clipping triangulation.

use super::Ppoint;

pub const ISCCW: i32 = 1;
pub const ISCW: i32 = 2;
pub const ISON: i32 = 3;

/// `ccw(p1, p2, p3)`.
pub fn ccw(p1: Ppoint, p2: Ppoint, p3: Ppoint) -> i32 {
    let (a, b) = (p1.y - p2.y, p3.x - p2.x);
    let r = -((p3.y - p2.y) * (p1.x - p2.x));
    // archboard: only the sign of the fused `a * b + r` is read, and a correctly rounded
    // result has the sign of the exact one. The rounded product `p` is within
    // |p| * 2^-53 of the exact one, so where `p + r` (whose rounding keeps its sign) is
    // further from zero than |p| * 2^-52, it has the exact sign, and the fused
    // multiply-add, a software routine in WebAssembly, is not needed. NaNs and
    // infinities fail the test and take the fused path, as before. A zero factor makes the
    // product exact, and the sum then has the sign of the fused one too.
    let p = a * b;
    let sum = p + r;
    let d = if sum.abs() > p.abs() * f64::EPSILON || ((a == 0.0 || b == 0.0) && p == 0.0) {
        sum
    } else {
        a.mul_add(b, r)
    };
    if d > 0.0 {
        ISCW
    } else if d < 0.0 {
        ISCCW
    } else {
        ISON
    }
}

fn between(pa: Ppoint, pb: Ppoint, pc: Ppoint) -> bool {
    let pba = Ppoint::new(pb.x - pa.x, pb.y - pa.y);
    let pca = Ppoint::new(pc.x - pa.x, pc.y - pa.y);
    if ccw(pa, pb, pc) != ISON {
        return false;
    }
    pca.x.mul_add(pba.x, pca.y * pba.y) >= 0.0
        && pca.x.mul_add(pca.x, pca.y * pca.y) <= pba.x.mul_add(pba.x, pba.y * pba.y)
}

fn intersects(pa: Ppoint, pb: Ppoint, pc: Ppoint, pd: Ppoint) -> bool {
    if ccw(pa, pb, pc) == ISON
        || ccw(pa, pb, pd) == ISON
        || ccw(pc, pd, pa) == ISON
        || ccw(pc, pd, pb) == ISON
    {
        between(pa, pb, pc) || between(pa, pb, pd) || between(pc, pd, pa) || between(pc, pd, pb)
    } else {
        let c1 = ccw(pa, pb, pc) == ISCCW;
        let c2 = ccw(pa, pb, pd) == ISCCW;
        let c3 = ccw(pc, pd, pa) == ISCCW;
        let c4 = ccw(pc, pd, pb) == ISCCW;
        (c1 ^ c2) && (c3 ^ c4)
    }
}

/// `isdiagonal(i, ip2, points, n, indexer)`: is `(i, ip2)` a diagonal?
pub fn isdiagonal(i: usize, ip2: usize, pts: &[Ppoint]) -> bool {
    let n = pts.len();
    let ip1 = (i + 1) % n;
    let im1 = (i + n - 1) % n;
    let res = if ccw(pts[im1], pts[i], pts[ip1]) == ISCCW {
        ccw(pts[i], pts[ip2], pts[im1]) == ISCCW && ccw(pts[ip2], pts[i], pts[ip1]) == ISCCW
    } else {
        ccw(pts[i], pts[ip2], pts[ip1]) == ISCW
    };
    if !res {
        return false;
    }
    for j in 0..n {
        let jp1 = (j + 1) % n;
        if !(j == i || jp1 == i || j == ip2 || jp1 == ip2)
            && intersects(pts[i], pts[ip2], pts[j], pts[jp1])
        {
            return false;
        }
    }
    true
}

/// `Ptriangulate(polygon, fn, vc)`: calls `f` with each triangle; `Err` if
/// no diagonal exists.
pub fn ptriangulate(
    polygon: &[Ppoint],
    f: &mut dyn FnMut(&[Ppoint; 3]),
) -> Result<(), super::PathplanError> {
    let mut pts: Vec<Ppoint> = polygon.to_vec();
    loop {
        let n = pts.len();
        if n > 3 {
            let mut found = false;
            for i in 0..n {
                let ip1 = (i + 1) % n;
                let ip2 = (i + 2) % n;
                if isdiagonal(i, ip2, &pts) {
                    f(&[pts[i], pts[ip1], pts[ip2]]);
                    pts.remove(ip1);
                    found = true;
                    break;
                }
            }
            if !found {
                return Err(super::PathplanError);
            }
        } else {
            f(&[pts[0], pts[1], pts[2]]);
            return Ok(());
        }
    }
}
