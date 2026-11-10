//! Route legacy Blocks placements through owned fans and guarded channels.

// A bounded readability search keeps dense solves within their render budget.
const REFINEMENT_LIMIT: usize = 32;
// Medium views also need placement alternatives; large pictures keep one routed candidate.
const PLACEMENT_REFINEMENT_LIMIT: usize = 64;

mod channel;
mod choices;
mod clearance;
mod compact;
mod corridors;
mod dense;
mod endpoint_choices;
mod fallback;
mod geometry;
mod hierarchy;
mod junctions;
mod label_space;
mod lanes;
mod model;
mod port_spacing;
mod portals;
mod ports;
mod reading;
mod room;
mod runs;
mod shape;
mod swaps;
mod topology;
mod words;

fn relationships(graph: &crate::graph::Node) -> usize {
    graph.edges.as_deref().unwrap_or_default().len()
}

/// How many guarded drawings a view compares before it keeps the best.
fn comparison(graph: &crate::graph::Node) -> usize {
    let count = relationships(graph);
    if count <= REFINEMENT_LIMIT {
        usize::MAX
    } else if count <= PLACEMENT_REFINEMENT_LIMIT {
        2
    } else {
        1
    }
}

/// Whether the wider placement search can run. A view beyond the readability
/// limit keeps its first hierarchy once that draws, because the wider search
/// costs more than its render budget. A refused view still needs it.
pub(super) fn widens(graph: &crate::graph::Node, drawn: bool, complete_repair: bool) -> bool {
    if drawn {
        relationships(graph) <= REFINEMENT_LIMIT
    } else {
        complete_repair || relationships(graph) <= PLACEMENT_REFINEMENT_LIMIT
    }
}

#[derive(Debug)]
pub(super) struct Refused {
    pub message: String,
    /// Endpoint pairs, with the latest refused relationship first.
    pub blocked: Vec<[String; 2]>,
}
impl From<String> for Refused {
    fn from(message: String) -> Self {
        Self {
            message,
            blocked: Vec::new(),
        }
    }
}
impl From<&str> for Refused {
    fn from(message: &str) -> Self {
        message.to_owned().into()
    }
}

pub(super) use parts::{Routed, Split, Step, solve_part};
pub(super) use words::{dress, without_trunk_words};

mod fixed;
/// Rank guarded candidates against one fixed reference, so an intermediate
/// winner cannot tighten the area budget of the remaining candidates.
pub(super) fn route_candidates(
    graph: &crate::graph::Node,
    mut candidates: crate::blocks::legacy::Candidates<'_>,
) -> Result<Result<crate::blocks::assembly::Placed, Refused>, String> {
    let mut failure = Refused::from("No guarded Blocks drawing");
    let mut reference = None;
    let mut best = None;
    let mut score = (usize::MAX, u64::MAX);
    let mut drawn = 0;
    while let Some(drawing) = candidates.next(reference.is_some())? {
        // The other route orders rescue a view that has no drawing yet.
        let orders = if reference.is_some() {
            &selection::ORDERS[..1]
        } else {
            &selection::ORDERS[..]
        };
        match fixed::route(graph, drawing, orders) {
            Ok(next) => {
                let next_score = reading::drawn_rank(&next);
                let first = reference.get_or_insert_with(|| next.clone());
                if next_score < score && reading::worth_placing(&next, first, graph) {
                    score = next_score;
                    best = Some(next);
                }
                drawn += 1;
                if drawn == comparison(graph) {
                    break;
                }
            }
            Err(mut error) => {
                // A placement repair must address every failed candidate.
                error.blocked.extend(failure.blocked);
                failure = error;
            }
        }
    }
    Ok(best.ok_or(failure))
}

/// Past this many lines a reading starts with more room between its cells.
const AMPLE_LINES: usize = 40;

/// The room a dense placement of some lines adds to its gaps, tightest first: a crowded
/// reading starts wider. Lines between frames all cross the band between them, so several
/// frames need more.
fn dense_rooms(lines: usize, frames: usize) -> &'static [f64] {
    match (lines, frames) {
        (0..=15, 0..=1) => &[0.0, 48.0],
        (16..=AMPLE_LINES, 0..=1) => &[72.0, 120.0],
        (0..=AMPLE_LINES, _) => &[72.0, 120.0, 288.0],
        (41..=64, 0..=1) => &[96.0],
        (41..=64, _) => &[96.0, 288.0, 480.0],
        (_, 0..=1) => &[288.0],
        _ => &[480.0, 640.0],
    }
}

/// The rooms a reading goes on to while its own rooms draw nothing.
const WIDER_ROOMS: [f64; 7] = [144.0, 192.0, 288.0, 384.0, 480.0, 640.0, 800.0];

/// The best dense drawing of a reading, if one passes every guard. The search weighs a
/// placement on a sketch of its lines, which misses the detours and labels that routing finds,
/// so every placement at every room of the reading is routed, the cheapest first. A wider room
/// runs only while no drawing passes, because even a drawing with more room than it needs
/// reads far better than a Graphviz placement.
pub(super) fn dense_drawing(graph: &crate::graph::Node) -> Option<crate::blocks::assembly::Placed> {
    let rooms = dense_rooms(relationships(graph), dense::frames(graph));
    let crowded = (relationships(graph) > PLACEMENT_REFINEMENT_LIMIT).then_some(CROWDED_TRIES);
    let grids = dense::Grids::of(graph, rooms[0], crowded)?;
    let Ok(best) = densest(graph, &mut Here::new(graph, &grids));
    best
}

/// The best of the tries of a dense reading, routed here or elsewhere: the rooms of the reading,
/// then wider rooms while no drawing passes.
fn densest<T: Tries>(
    graph: &crate::graph::Node,
    tries: &mut T,
) -> Result<Option<T::Drawing>, T::Lack> {
    let rooms = dense_rooms(relationships(graph), dense::frames(graph));
    let mut best = None;
    for &room in rooms {
        dense_room(graph, tries, room, &mut best)?;
    }
    let widest = rooms.last().copied().unwrap_or_default();
    for &room in WIDER_ROOMS.iter().filter(|&&room| room > widest) {
        if best.is_some() {
            break;
        }
        dense_room(graph, tries, room, &mut best)?;
    }
    Ok(best.map(|(_, drawing)| drawing))
}

/// How many placements a reading past the placement refinement limit searches to the end, and
/// routes at each room.
const CROWDED_TRIES: usize = 2;

/// Route the placements of a reading at one room, the cheapest first, and keep the best drawing
/// so far. A reading past the placement refinement limit keeps the first that routes, as its
/// legacy placements do, because its routes cost more than its render budget.
fn dense_room<T: Tries>(
    graph: &crate::graph::Node,
    tries: &mut T,
    room: f64,
    best: &mut Option<(reading::Order, T::Drawing)>,
) -> Result<(), T::Lack> {
    let crowded = relationships(graph) > PLACEMENT_REFINEMENT_LIMIT;
    for at in 0..tries.drawings(room)? {
        if dense_asks(tries, at, best)? && crowded {
            return Ok(());
        }
    }
    Ok(())
}

/// How many times a placement tries again with the room its lines asked for.
const ASKS: usize = 2;

/// Route a dense placement, keep its drawing if it is the best so far, and tell whether any
/// drawing of it routed. A line that the router refuses, or that runs a long way round, asks the
/// placement for room on its direct way, and the placement tries again with that room, twice at
/// most. No line asks once the reading has a drawing that reads and runs no long way round,
/// because more room could then only lower a cost that the drawing already ranks by.
fn dense_asks<T: Tries>(
    tries: &mut T,
    at: usize,
    best: &mut Option<(reading::Order, T::Drawing)>,
) -> Result<bool, T::Lack> {
    let mut routed = false;
    for tried in 0..=ASKS {
        match tries.route(at, tried)? {
            Try::Over => break,
            Try::Refused => {}
            Try::Routed(order, next) => {
                routed = true;
                if best.as_ref().is_none_or(|one| order < one.0) {
                    *best = Some((order, next));
                }
            }
        }
        if (best.as_ref()).is_some_and(|(order, _)| reads(*order)) || tried == ASKS {
            break;
        }
    }
    Ok(routed)
}

/// Whether a drawing of some order reads and runs no long way round: no line asks for room then.
fn reads((unreadable, long, _): reading::Order) -> bool {
    !unreadable && long == 0
}

/// One try of a dense placement at a room.
enum Try<D> {
    /// The try before it asked for no room that the placement could give, so it is not made.
    Over,
    /// The router refused it.
    Refused,
    /// The router drew it, and this is how it ranks.
    Routed(reading::Order, D),
}

/// The tries of a dense reading: routed here, one after another (`Here`), or answered by the
/// parts of a split solve (`parts`). The choice between them is the same either way.
trait Tries {
    /// A routed drawing.
    type Drawing;
    /// What the tries still lack to answer.
    type Lack;
    /// How many placements one room routes, the cheapest first: the tries that follow are theirs.
    fn drawings(&mut self, room: f64) -> Result<usize, Self::Lack>;
    /// One try of a placement of the room: the first, or one with the room its lines asked for.
    fn route(&mut self, at: usize, tried: usize) -> Result<Try<Self::Drawing>, Self::Lack>;
}

/// The tries of a dense reading, routed here, one after another.
struct Here<'g> {
    graph: &'g crate::graph::Node,
    grids: &'g dense::Grids<'g>,
    room: f64,
    drawings: Vec<Option<(dense::Candidate, crate::blocks::assembly::Placed)>>,
    /// The placement whose tries are under way.
    chain: Option<Chain>,
}

/// A placement whose tries are under way: the room its lines asked for, its latest drawing, and
/// the ends of the lines in its latest try that want room.
struct Chain {
    candidate: dense::Candidate,
    asked: Vec<dense::Room>,
    drawn: crate::blocks::assembly::Placed,
    wanting: Vec<[String; 2]>,
}

impl<'g> Here<'g> {
    fn new(graph: &'g crate::graph::Node, grids: &'g dense::Grids<'g>) -> Self {
        Here {
            graph,
            grids,
            room: 0.0,
            drawings: Vec::new(),
            chain: None,
        }
    }

    /// Start the tries of a placement of the room, its lines wanting some room.
    fn start(&mut self, at: usize, wanting: Vec<[String; 2]>) {
        let (candidate, drawn) = self.drawings[at]
            .take()
            .expect("each placement starts once");
        self.chain = Some(Chain {
            candidate,
            asked: Vec::new(),
            drawn,
            wanting,
        });
    }

    /// Resume the tries of a placement drawn at a room, from the lines that its first try left
    /// wanting room.
    fn resume(
        &mut self,
        room: f64,
        drawn: (dense::Candidate, crate::blocks::assembly::Placed),
        wanting: Vec<[String; 2]>,
    ) {
        self.room = room;
        self.drawings = vec![Some(drawn)];
        self.start(0, wanting);
    }

    /// The ends of the lines that want room in the latest try of the placement under way.
    fn wanting(&self) -> Vec<[String; 2]> {
        self.chain
            .as_ref()
            .map_or_else(Vec::new, |chain| chain.wanting.clone())
    }

    /// Ask the placement under way for the room its wanting lines need, and tell whether it gave any.
    fn gives(&mut self) -> bool {
        let chain = self.chain.as_mut().expect("a placement is under way");
        (chain.wanting.iter()).fold(false, |given, [from, to]| {
            dense::ask(
                self.grids,
                (chain.candidate, &chain.drawn),
                &mut chain.asked,
                [from, to],
            ) || given
        })
    }
}

impl Tries for Here<'_> {
    type Drawing = crate::blocks::assembly::Placed;
    type Lack = std::convert::Infallible;

    fn drawings(&mut self, room: f64) -> Result<usize, Self::Lack> {
        self.room = room;
        self.drawings = dense::drawings(self.grids, room)
            .into_iter()
            .map(Some)
            .collect();
        Ok(self.drawings.len())
    }

    fn route(&mut self, at: usize, tried: usize) -> Result<Try<Self::Drawing>, Self::Lack> {
        if tried == 0 {
            self.start(at, Vec::new());
        } else {
            if !self.gives() {
                return Ok(Try::Over);
            }
            let chain = self.chain.as_mut().expect("a placement is under way");
            chain.drawn = dense::redraw(self.grids, chain.candidate, self.room, &chain.asked);
        }
        let chain = self.chain.as_mut().expect("a placement is under way");
        Ok(
            match fixed::route(self.graph, chain.drawn.clone(), &selection::ORDERS[..1]) {
                Ok(next) => {
                    chain.wanting = ends_of(self.graph, &reading::long_lines(&next));
                    Try::Routed(reading::order(&next), next)
                }
                Err(refused) => {
                    chain.wanting = refused.blocked;
                    Try::Refused
                }
            },
        )
    }
}

/// The two ends of each of some lines of a graph.
fn ends_of(graph: &crate::graph::Node, lines: &[&str]) -> Vec<[String; 2]> {
    (graph.edges.iter().flatten())
        .filter(|edge| lines.contains(&edge.id.as_str()))
        .map(|edge| [edge.source().to_owned(), edge.target().to_owned()])
        .collect()
}

mod direct;
mod parts;

mod trunks;
pub(super) fn route_trunks(scene: &archboard_router::Scene) -> Vec<archboard_router::Route> {
    trunks::route(scene)
}

mod route_labels;

mod repair;
mod selection;
