//! Side ports, in a Lanes drawing. A line whose end leaves a card's face only to turn in the
//! channel and run on past the card's side lands on that side instead: it leaves or enters the
//! side face straight, turns once, and runs on as it ran, one bend fewer. Each such end is tried
//! in turn: the block is routed again with it, and the ends kept before it, off the faces they
//! leave, so the ends left there stand centred again. The end is kept only where the block then
//! bends less and crosses no more lines, its side is still clear, and no line crosses it within
//! an arrowhead's length of the card. A side is chosen by what the reader sees, never by a
//! shorter line, and a line in a bus between two cards lands with the bus.
//!
//! The ends on one side face stand as one group a lane apart, centred on the face; the lines
//! that come in from above stand over those that leave downward, the farther out a line turns
//! the further from the other group, so no two of them cross beside the card.

use archboard_scene::geometry::{Point, Rect};

use crate::constants::{APPROACH_STRAIGHT, BEND_RADIUS, CARD_RADIUS};
use crate::ecma::{abs, js_max, js_min};
use crate::lanes::buses::Buses;
use crate::lanes::chains::{Kind, LANE, Router};
use crate::lanes::channels::{End, NetId};
use crate::lanes::knots::{knots_in, knotted_lines};
use crate::lanes::ports::gathered;
use crate::lanes::route::{Routed, SceneLine, route_once};
use crate::lanes::scene::{ItemId, Map, Placement, Set};
use crate::lanes::score::crossing_places;
use crate::lanes::side_runs::{
    CLEAR, Run, at_face, bends, meets, met, runs_of, through, turns, worse,
};
use crate::lanes::spacing::Rim;

/// The ends of lines that land on a card's side: each line's key, and the end of its route, top
/// to bottom, that does.
pub(crate) type Sided = Set<(String, End)>;

/// The shortest run off a side face: room for the bend and a straight arrow approach.
const STUB: f64 = APPROACH_STRAIGHT + BEND_RADIUS;
/// How far the ends on a side face keep from its corners.
const SIDE_MARGIN: f64 = CARD_RADIUS;
/// How many candidate ends a block tries on their sides, each with a routing of its own.
const TRIED: usize = 16;

/// A routed block: each line's points, the ends that could land on a side, the side ends that
/// could not, and how many lines cross and bend.
pub(crate) struct Routing {
    pub routes: Map<String, Vec<Point>>,
    pub candidates: Sided,
    pub refused: Sided,
    pub crossings: usize,
    pub bends: usize,
    /// Every bus the routing found, gathered or not.
    pub buses: Buses,
}

/// Where one end lands on a side face: the face's x, the end's height, and the x its line runs on.
#[derive(Clone, Copy, Debug)]
struct Landing {
    face: f64,
    y: f64,
    lane: f64,
}

/// One end bound for a side face: its line, which end, the face's x and the x its line runs on.
struct SideEnd {
    id: String,
    end: End,
    face: f64,
    lane: f64,
}

/// The side ends of a block, by card and face.
type Faces = Map<(ItemId, u64), Vec<SideEnd>>;

/// Route lines through a banded scene, each on tracks of its own, and space
/// the bands for the tracks each channel holds. `margin` is how far every x
/// moves, `top` where the first band starts, and `rim` the room the block
/// keeps at its edge rows where no line turns. Answers each line's points,
/// from its source to its target. With `reserve`, a crowded card stops the
/// routing before anything settles, and the answer is the widths it needs. With `bus`, the ends
/// on each face gather into one group a lane apart, as Lanes draws them.
pub(crate) fn route_scene(
    scene: &mut Placement,
    lines: &[SceneLine<'_>],
    spacing: (f64, f64),
    rim: Option<Rim>,
    (reserve, bus): (bool, bool),
) -> Result<Map<String, Vec<Point>>, Map<ItemId, f64>> {
    if bus {
        return route_with_sides(scene, lines, spacing, rim, reserve);
    }
    let choice = Choice::default();
    route_once(scene, lines, spacing, rim, (reserve, bus), &choice).map(|routing| routing.routes)
}

/// What a routing of a Lanes block lands on sides and gathers into buses.
#[derive(Clone, Default)]
pub(crate) struct Choice {
    pub sided: Sided,
    pub buses: Buses,
    /// The lines that run on their own, in no trunk.
    pub loose: Set<String>,
}

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
    let fresh = scene.clone();
    let kept = Choice::default();
    let best = route_once(scene, lines, spacing, rim, (reserve, true), &kept)?;
    let drawn = scene.clone();
    let mut search = Search {
        scene,
        fresh,
        lines,
        spacing,
        rim,
        reserve,
        kept,
        best,
        drawn,
    };
    for bus in search.best.buses.clone() {
        search.try_with(
            |choice| choice.buses.insert(bus),
            |again, best| again.crossings <= best.crossings && again.bends <= best.bends,
        );
    }
    // A line whose turn ties a knot runs on its own where that unties more knots than it ties.
    for line in knotted_lines(&search.best.routes).into_iter().take(TRIED) {
        search.try_with(
            |choice| choice.loose.insert(line),
            |again, best| {
                knots_in(&again.routes) < knots_in(&best.routes)
                    && again.crossings <= best.crossings
            },
        );
    }
    for candidate in search.best.candidates.clone().into_iter().take(TRIED) {
        search.try_with(
            |choice| choice.sided.insert(candidate),
            |again, best| {
                again.refused.is_empty()
                    && again.crossings <= best.crossings
                    && again.bends < best.bends
            },
        );
    }
    *search.scene = search.drawn;
    Ok(search.best.routes)
}

/// A search over a Lanes block's routings: the choice kept so far, its routing and its scene.
struct Search<'s, 'l, 'e> {
    scene: &'s mut Placement,
    fresh: Placement,
    lines: &'l [SceneLine<'e>],
    spacing: (f64, f64),
    rim: Option<Rim>,
    reserve: bool,
    kept: Choice,
    best: Routing,
    drawn: Placement,
}

impl Search<'_, '_, '_> {
    /// Route the block again with one change to the kept choice, and keep the change where the
    /// new routing reads `better` than the best so far. A change whose routing needs a card made
    /// wider is not kept: the widths it asks for belong to a choice the block does not take.
    fn try_with(
        &mut self,
        change: impl FnOnce(&mut Choice) -> bool,
        better: impl FnOnce(&Routing, &Routing) -> bool,
    ) {
        let mut trying = self.kept.clone();
        change(&mut trying);
        *self.scene = self.fresh.clone();
        let Ok(again) = route_once(
            self.scene,
            self.lines,
            self.spacing,
            self.rim,
            (self.reserve, true),
            &trying,
        ) else {
            return;
        };
        if better(&again, &self.best) {
            self.kept = trying;
            self.best = again;
            self.drawn = self.scene.clone();
        }
    }
}

/// The net of a route at one of its ends, top to bottom.
fn end_net(route: &Routed, end: End) -> NetId {
    match end {
        End::Top => route.nets[0],
        End::Bottom => *route.nets.last().expect("a net"),
    }
}

/// Whether an item's name is a plain card's, not a block's port, pin, stub or header.
fn plain(name: &str) -> bool {
    !["cluster:", "pin:", "port:", "stub:", "header:"]
        .iter()
        .any(|prefix| name.starts_with(prefix))
}

/// The x of a card's side that faces an x outside it, when the x stands a stub beyond it.
fn side_toward(bx: &Rect, x: f64) -> Option<f64> {
    if x <= bx.x - STUB {
        Some(bx.x)
    } else if x >= bx.x + bx.width + STUB {
        Some(bx.x + bx.width)
    } else {
        None
    }
}

/// The side a line runs on from, nearer to its lane.
fn face_toward(bx: &Rect, lane: f64) -> f64 {
    if lane < bx.x + bx.width / 2.0 {
        bx.x
    } else {
        bx.x + bx.width
    }
}

/// The order the ends on one side face stand in, top to bottom: lines in from above over lines
/// out below, the farther out a line runs the further from the other group.
fn rank(one: &SideEnd) -> f64 {
    let out = abs(one.lane - one.face);
    match one.end {
        End::Bottom => out,
        End::Top => 1e9 - out,
    }
}

/// How many ends a side face holds a lane apart between two heights.
#[expect(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    reason = "a whole count of lanes, never negative"
)]
fn fits(low: f64, high: f64) -> usize {
    1 + js_max(0.0, (high - low) / LANE).floor() as usize
}

/// The side ends some line crosses within an arrowhead's length of their face.
fn crossed_near(landed: &Map<(String, End), Landing>, routes: &Map<String, Vec<Point>>) -> Sided {
    landed
        .iter()
        .filter(|((id, _), landing)| {
            let near = at_face(landing.face, landing.lane, landing.y);
            (routes.iter().filter(|(other, _)| *other != id))
                .flat_map(|(_, points)| runs_of(points))
                .any(|run| meets(near, run) > 0)
        })
        .map(|(key, _)| key.clone())
        .collect()
}

impl Router<'_> {
    /// Mark the nets of the lines a routing runs on their own, in no trunk.
    pub(crate) fn mark_loose(&mut self, loose: &Set<String>, routed: &Map<String, Routed>) {
        for id in loose {
            if let Some(route) = routed.get(id) {
                self.loose.extend(route.nets.iter().copied());
            }
        }
    }

    /// Mark the net ends a routing lands on sides.
    pub(crate) fn mark_sided(&mut self, sided: &Sided, routed: &Map<String, Routed>) {
        for (id, end) in sided {
            if let Some(route) = routed.get(id) {
                self.sided.insert((end_net(route, *end), *end));
            }
        }
    }

    /// Stand every end on a side over or under its net's other end, so the net drops straight.
    pub(crate) fn follow_sided(&mut self) {
        for (net, end) in self.sided.clone() {
            let x = self.net(net).x_at(end.other());
            self.net_mut(net).set_x_at(end, x);
        }
    }

    /// The card a net end stands on.
    fn card_at(&self, net: NetId, end: End) -> ItemId {
        self.station(self.net(net).at(end)).item.expect("a card")
    }

    /// The card a net end stands on, when it is a plain card's.
    fn plain_card(&self, net: NetId, end: End) -> Option<ItemId> {
        let station = self.station(self.net(net).at(end));
        let item = station.item.filter(|_| station.kind == Kind::Card)?;
        let named = self.scene.cards.iter().find(|&(_, &one)| one == item)?.0;
        (plain(named) && self.scene.item(item).inset.is_none()).then_some(item)
    }

    /// The items a line's route runs between.
    fn pair_of(&self, route: &Routed) -> (Option<ItemId>, Option<ItemId>) {
        let top = self.station(self.net(end_net(route, End::Top)).top).item;
        let bottom = self
            .station(self.net(end_net(route, End::Bottom)).bottom)
            .item;
        (top, bottom)
    }

    /// Whether one end of a route could land on a side: on a plain card's face, its port its
    /// own, its net turning in the channel to run on beyond the card's side, with nothing on the
    /// card's band between the side and where the line runs on.
    fn could_side(&self, route: &Routed, end: End, lanes: &[Vec<f64>]) -> bool {
        let net = end_net(route, end);
        if self.net(net).wall.is_some() || self.shared_at(net, end).is_some() {
            return false;
        }
        let Some(item) = self.plain_card(net, end) else {
            return false;
        };
        let one = *self.scene.item(item);
        let lane = self.net(net).x_at(end.other());
        let Some(face) = side_toward(&one.bx, lane) else {
            return false;
        };
        let (low, high) = (js_min(face, lane) - CLEAR, js_max(face, lane) + CLEAR);
        let boxed = (self.scene.cards.values().chain(self.scene.labels.values()))
            .filter(|&&other| other != item && self.scene.item(other).band == one.band)
            .map(|&other| self.scene.item(other).bx)
            .any(|bx| bx.x + bx.width > low && bx.x < high);
        !boxed && !lanes[one.band].iter().any(|&x| x > low && x < high)
    }

    /// The ends of a routing's lines that could land on a side, but for a line in a bus between
    /// two cards, which lands with the bus, and a cable, whose ribbon and marks need the room a
    /// face's port keeps.
    fn side_candidates(&self, routed: &Map<String, Routed>) -> Sided {
        let nets: Vec<NetId> = routed
            .values()
            .flat_map(|route| route.nets.clone())
            .collect();
        let lanes = self.lanes_by_band(&nets);
        let mut pairs: Map<(Option<ItemId>, Option<ItemId>), usize> = Map::default();
        for route in routed.values() {
            *pairs.entry(self.pair_of(route)).or_default() += 1;
        }
        let mut candidates = Sided::default();
        for (id, route) in routed
            .iter()
            .filter(|(_, route)| pairs[&self.pair_of(route)] == 1)
            .filter(|(_, route)| {
                route
                    .nets
                    .iter()
                    .all(|&net| self.net(net).half_width() == 0.0)
            })
        {
            for end in [End::Top, End::Bottom] {
                if self.could_side(route, end, &lanes) {
                    candidates.insert((id.clone(), end));
                }
            }
        }
        candidates
    }

    /// The ends a routing lands on sides, by card and face.
    fn side_faces(&self, routed: &Map<String, Routed>, left: f64) -> Faces {
        let mut faces = Faces::default();
        for (id, route) in routed {
            for end in [End::Top, End::Bottom] {
                let net = end_net(route, end);
                if !self.sided.contains(&(net, end)) {
                    continue;
                }
                let item = self.card_at(net, end);
                let lane = self.net(net).x_at(end) + left;
                let face = face_toward(&self.scene.moved_id(item, left), lane);
                let one = SideEnd {
                    id: id.clone(),
                    end,
                    face,
                    lane,
                };
                faces.entry((item, face.to_bits())).or_default().push(one);
            }
        }
        faces
    }

    /// Where every side end lands, by its line and end, and the ends whose face holds no room.
    fn landings(
        &self,
        routed: &Map<String, Routed>,
        left: f64,
    ) -> (Map<(String, End), Landing>, Sided) {
        let mut landed = Map::default();
        let mut refused = Sided::default();
        for ((item, _), mut ends) in self.side_faces(routed, left) {
            ends.sort_by(|one, other| rank(one).total_cmp(&rank(other)));
            let bx = self.scene.moved_id(item, left);
            let top = bx.y + self.scene.item(item).face_top;
            let (low, high) = (top + SIDE_MARGIN, bx.y + bx.height - SIDE_MARGIN);
            for one in ends.iter().skip(fits(low, high)) {
                refused.insert((one.id.clone(), one.end));
            }
            ends.truncate(fits(low, high));
            let ys = gathered((low, js_max(low, high)), ends.len());
            for (one, y) in ends.into_iter().zip(ys) {
                let landing = Landing {
                    face: one.face,
                    y,
                    lane: one.lane,
                };
                landed.insert((one.id, one.end), landing);
            }
        }
        (landed, refused)
    }

    /// Whether a side end's runs stand clear: its stub long enough, and nothing it passes.
    fn clear_landing(&self, item: ItemId, landing: &Landing, end: End, left: f64) -> bool {
        let bx = self.scene.moved_id(item, left);
        let face_y = match end {
            End::Top => bx.y + bx.height,
            End::Bottom => bx.y + self.scene.item(item).face_top,
        };
        let turn = Point {
            x: landing.lane,
            y: landing.y,
        };
        let stub = (
            Point {
                x: landing.face,
                y: landing.y,
            },
            turn,
        );
        let drop = (
            turn,
            Point {
                x: landing.lane,
                y: face_y,
            },
        );
        let toward = if landing.face <= bx.x { -1.0 } else { 1.0 };
        (landing.lane - landing.face) * toward >= STUB
            && (self.scene.cards.values().chain(self.scene.labels.values()))
                .filter(|&&other| other != item)
                .map(|&other| self.scene.moved_id(other, left))
                .all(|other| !through(stub, &other) && !through(drop, &other))
    }

    /// A route's points with one end on its card's side at a height, and the runs that end
    /// replaces and takes, when the route turns there.
    fn on_side(
        &self,
        route: &Routed,
        end: End,
        left: f64,
    ) -> Option<(Vec<Point>, Vec<Run>, Vec<Run>)> {
        let item = self.card_at(end_net(route, end), end);
        let bx = self.scene.moved_id(item, left);
        let y = f64::midpoint(bx.y + self.scene.item(item).face_top, bx.y + bx.height);
        let mut points = self.points_of(&route.nets, left);
        let n = points.len();
        if n < 3 {
            return None;
        }
        let (cut, far) = match end {
            End::Top => (0..2, 2),
            End::Bottom => (n - 2..n, n - 3),
        };
        let lane = points[far].x;
        let face = if lane < bx.x { bx.x } else { bx.x + bx.width };
        let replaced = match end {
            End::Top => runs_of(&points[..3]),
            End::Bottom => runs_of(&points[n - 3..]),
        };
        let (side, turn) = (Point { x: face, y }, Point { x: lane, y });
        let taken = vec![(side, turn), (turn, points[far])];
        let landed = match end {
            End::Top => [side, turn],
            End::Bottom => [turn, side],
        };
        points.splice(cut, landed);
        Some((points, replaced, taken))
    }

    /// Of some candidate ends, in order, those whose runs onto their side cross no more lines
    /// than the runs they replace, with the ends kept before them on their sides.
    fn uncrossed(&self, candidates: Sided, routed: &Map<String, Routed>, left: f64) -> Sided {
        let mut runs: Map<String, Vec<Run>> = routed
            .iter()
            .map(|(id, route)| (id.clone(), runs_of(&self.points_of(&route.nets, left))))
            .collect();
        let mut kept = Sided::default();
        for (id, end) in candidates {
            let Some((points, replaced, taken)) = self.on_side(&routed[&id], end, left) else {
                continue;
            };
            let others: Vec<Run> = (runs.iter().filter(|(other, _)| **other != id))
                .flat_map(|(_, one)| one.iter().copied())
                .collect();
            if !worse(met(&taken, &others), met(&replaced, &others)) {
                runs.insert(id.clone(), runs_of(&points));
                kept.insert((id, end));
            }
        }
        kept
    }

    /// A route's points, from its upper end to its lower end, with its side ends landed; an end
    /// whose side is not clear is refused.
    fn landed_points(
        &self,
        (id, route): (&String, &Routed),
        landed: &Map<(String, End), Landing>,
        left: f64,
        refused: &mut Sided,
    ) -> Vec<Point> {
        let mut points = self.points_of(&route.nets, left);
        for end in [End::Top, End::Bottom] {
            let Some(landing) = landed.get(&(id.clone(), end)) else {
                continue;
            };
            if !self.clear_landing(self.card_at(end_net(route, end), end), landing, end, left) {
                refused.insert((id.clone(), end));
            }
            let side = Point {
                x: landing.face,
                y: landing.y,
            };
            let turn = Point {
                x: landing.lane,
                y: landing.y,
            };
            match end {
                End::Top => {
                    points[0] = turn;
                    points.insert(0, side);
                }
                End::Bottom => {
                    *points.last_mut().expect("a point") = turn;
                    points.push(side);
                }
            }
        }
        points
    }

    /// Every line's points, from its source to its target, with its side ends landed, and what
    /// the next routing needs to know.
    pub(crate) fn drawn(&self, routed: &Map<String, Routed>, left: f64) -> Routing {
        let (landed, mut refused) = self.landings(routed, left);
        let mut routes = Map::default();
        for line in routed {
            let mut points = self.landed_points(line, &landed, left, &mut refused);
            if line.1.upward {
                points.reverse();
            }
            routes.insert(line.0.clone(), points);
        }
        refused.extend(crossed_near(&landed, &routes));
        let candidates = if self.bus && self.sided.is_empty() {
            self.uncrossed(self.side_candidates(routed), routed, left)
        } else {
            Sided::default()
        };
        let (crossings, bends) = if self.bus {
            let lines: Vec<_> = routes.values().map(|points| turns(points)).collect();
            (
                crossing_places(lines.iter().map(Vec::as_slice)).len(),
                routes.values().map(|one| bends(one)).sum(),
            )
        } else {
            (0, 0)
        };
        Routing {
            routes,
            candidates,
            refused,
            crossings,
            bends,
            buses: Buses::default(),
        }
    }
}
