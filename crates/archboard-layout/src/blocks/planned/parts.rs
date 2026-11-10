//! A dense reading's solve in parts that the host's workers solve side by side (ADR 0078). Each
//! placement searches in a part of its own. Its drawings at each room route their first try in a
//! part, and the further tries of one drawing run in a part. The core asks for the parts (`Split`)
//! and makes the choice between the tries that one solve makes, in its order, from what the parts
//! answer (`Replay`), so the answer is the answer of one solve.

use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

use super::{
    ASKS, CROWDED_TRIES, Here, PLACEMENT_REFINEMENT_LIMIT, Tries, Try, dense, dense_rooms, densest,
    reads, relationships, words,
};
use crate::{blocks::assembly::Placed, graph::Node};

/// One way a reading searches a placement: how many columns its grid starts with, and whether
/// its frames stack.
type Way = (usize, bool);

/// How far a part searches one placement: to the end and priced, as a scout of a crowded reading,
/// or on from where a scout left it and priced.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub(in crate::blocks::planned) enum Searching {
    Whole,
    Scout,
    On(Vec<GridCells>),
}

/// What one placement's search found: its cost, as its bits, and each frame's grid.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub(in crate::blocks::planned) struct Found {
    pub cost: u64,
    pub grids: Vec<GridCells>,
}

/// One frame's grid: its columns, its rows, and the cell of each part.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub(in crate::blocks::planned) struct GridCells {
    pub columns: usize,
    pub rows: usize,
    pub cells: Vec<usize>,
}

/// One part of a split solve, for one placement of the reading.
#[derive(Clone, Debug, Serialize, Deserialize)]
struct Part {
    /// Whether the part draws the graph with its trunks' words. A solve draws it without them
    /// first (`words`), and with them only when that drawing cannot wear them.
    plain: bool,
    way: Way,
    ask: Ask,
}

/// What a part asks of a placement.
#[derive(Clone, Debug, Serialize, Deserialize)]
enum Ask {
    /// Its search.
    Search(Searching),
    /// Its drawings at a room, each routed once.
    Drawings { found: Found, room: f64 },
    /// The further tries of its drawing on one page at a room, from the lines that the first try
    /// left wanting room.
    Tries {
        found: Found,
        room: f64,
        page: [u64; 2],
        wanting: Vec<[String; 2]>,
    },
}

/// One drawing of a placement at a room, as a part answers it: its page, whether it stands short,
/// its first try, whether that try's lines asked for room that the placement gave, and those lines.
#[derive(Debug, Serialize, Deserialize)]
struct Drawn {
    page: [u64; 2],
    short: bool,
    first: Tried,
    gives: bool,
    wanting: Vec<[String; 2]>,
}

/// One try, as a part answers it.
#[derive(Debug, Serialize, Deserialize)]
enum Tried {
    Over,
    Refused,
    Routed(Routed),
}

/// A routed try: how it ranks, with its cost as bits, and the drawing it answers.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub(in crate::blocks) struct Routed {
    order: (bool, usize, u64),
    /// The drawing as the solve answers it, or nothing when it cannot wear its trunks' words.
    pub told: Option<Told>,
}

/// A drawing as a solve answers it: its JSON, and its size as bits.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub(in crate::blocks) struct Told {
    pub placed: String,
    pub width: u64,
    pub height: u64,
}

impl<'a> From<&'a Tried> for Try<&'a Routed> {
    fn from(tried: &'a Tried) -> Self {
        match tried {
            Tried::Over => Try::Over,
            Tried::Refused => Try::Refused,
            Tried::Routed(routed) => {
                let (unreadable, long, cost) = routed.order;
                Try::Routed((unreadable, long, f64::from_bits(cost)), routed)
            }
        }
    }
}

/// The room a reading searches its placements at: the first of its rooms.
fn first_room(graph: &Node) -> f64 {
    dense_rooms(relationships(graph), dense::frames(graph))[0]
}

/// Solve one part of a split solve of a graph, and answer it as JSON.
///
/// # Errors
///
/// A part that does not read, or that names a reading with no dense placement.
pub(in crate::blocks) fn solve_part(graph: &Node, part: &str) -> Result<String, String> {
    let part: Part = serde_json::from_str(part)
        .map_err(|error| format!("A part of a split solve is unreadable: {error}"))?;
    let quiet = if part.plain {
        None
    } else {
        Some(words::without_trunk_words(graph).ok_or("A part has no trunk words to take off")?)
    };
    let drawn = quiet.as_ref().unwrap_or(graph);
    let lost = || "A part of a split solve names no dense placement".to_owned();
    let dressed = |next: Placed| told(graph, quiet.is_some(), next);
    let written = match part.ask {
        Ask::Search(searching) => {
            let found = dense::Grids::search_one(drawn, first_room(drawn), part.way, &searching);
            serde_json::to_string(&found.ok_or_else(lost)?)
        }
        Ask::Drawings { found, room } => {
            let grids = dense::Grids::found(drawn, part.way, &found).ok_or_else(lost)?;
            serde_json::to_string(&drawings(&mut Here::new(drawn, &grids), room, &dressed))
        }
        Ask::Tries {
            found,
            room,
            page,
            wanting,
        } => {
            let grids = dense::Grids::found(drawn, part.way, &found).ok_or_else(lost)?;
            let mut here = Here::new(drawn, &grids);
            here.resume(room, grids.drawing(room, page), wanting);
            let mut tries = Vec::new();
            for attempt in 1..=ASKS {
                let Ok(next) = here.route(0, attempt);
                let over = match &next {
                    Try::Over => true,
                    Try::Routed(order, _) => reads(*order),
                    Try::Refused => false,
                };
                tries.push(tried(next, &dressed));
                if over {
                    break;
                }
            }
            serde_json::to_string(&tries)
        }
    };
    written.map_err(|error| error.to_string())
}

/// A placement's drawings at a room, each routed once, as a part answers them.
fn drawings(
    here: &mut Here<'_>,
    room: f64,
    dressed: &impl Fn(Placed) -> Option<Told>,
) -> Vec<Drawn> {
    let Ok(count) = here.drawings(room);
    (0..count)
        .map(|at| {
            let (candidate, drawing) = here.drawings[at]
                .as_ref()
                .expect("each drawing routes once");
            let (page, short) = (dense::Grids::page(*candidate), dense::Grids::short(drawing));
            let Ok(first) = here.route(at, 0);
            let more = !matches!(&first, Try::Routed(order, _) if reads(*order));
            let gives = more && here.gives();
            let wanting = if gives { here.wanting() } else { Vec::new() };
            Drawn {
                page,
                short,
                first: tried(first, dressed),
                gives,
                wanting,
            }
        })
        .collect()
}

/// A try as a part answers it.
fn tried(next: Try<Placed>, told: &impl Fn(Placed) -> Option<Told>) -> Tried {
    match next {
        Try::Over => Tried::Over,
        Try::Refused => Tried::Refused,
        Try::Routed((unreadable, long, cost), next) => Tried::Routed(Routed {
            order: (unreadable, long, cost.to_bits()),
            told: told(next),
        }),
    }
}

/// A routed drawing as the solve answers it: wearing its trunks' words when it was drawn without
/// them, or nothing when it cannot wear them.
fn told(graph: &Node, quiet: bool, next: Placed) -> Option<Told> {
    let drawing = if quiet {
        words::dress(graph, next).ok()?
    } else {
        next
    };
    Some(Told {
        placed: drawing.json().text(),
        width: drawing.width.to_bits(),
        height: drawing.height.to_bits(),
    })
}

/// A dense reading's solve in parts: what the parts answered so far, and which parts it asked for.
pub(in crate::blocks) struct Split {
    /// The graph that the parts draw: without its trunks' words, or with them when `plain`.
    drawn: Node,
    plain: bool,
    ways: Vec<Way>,
    rooms: &'static [f64],
    crowded: bool,
    scouts: BTreeMap<Way, Found>,
    searches: BTreeMap<Way, Found>,
    drawings: BTreeMap<(Way, u64), Vec<Drawn>>,
    tries: BTreeMap<(Way, u64, [u64; 2]), Vec<Tried>>,
    asked: BTreeSet<String>,
}

/// What a split solve does next.
pub(in crate::blocks) enum Step {
    /// Ask for these parts, each by what it names on the graph.
    Ask(Vec<String>),
    /// The parts answered the choice: the best drawing, if any drawing passes.
    Done(Option<Routed>),
}

impl Split {
    /// The split solve of a graph drawn with or without its trunks' words, if it takes a dense
    /// placement.
    pub(in crate::blocks) fn of(drawn: Node, plain: bool) -> Option<Split> {
        let ways = dense::Grids::ways(&drawn)?;
        Some(Split {
            crowded: relationships(&drawn) > PLACEMENT_REFINEMENT_LIMIT,
            rooms: dense_rooms(relationships(&drawn), dense::frames(&drawn)),
            drawn,
            plain,
            ways,
            scouts: BTreeMap::new(),
            searches: BTreeMap::new(),
            drawings: BTreeMap::new(),
            tries: BTreeMap::new(),
            asked: BTreeSet::new(),
        })
    }

    /// Whether the split draws the graph with its trunks' words.
    pub(in crate::blocks) fn plain(&self) -> bool {
        self.plain
    }

    /// Make the choice from what the parts answered so far, or name the parts it still lacks. It
    /// also asks ahead for what the choice will likely read: each placement's drawings at every
    /// room of the reading once its search answers, and the further tries of each drawing whose
    /// first try did not read before the first one that did.
    pub(in crate::blocks) fn step(&mut self) -> Step {
        let parts = match self.lacking() {
            Ok(best) => return Step::Done(best),
            Err(parts) => parts,
        };
        Step::Ask(
            parts
                .into_iter()
                .filter(|part| self.asked.insert(part.clone()))
                .collect(),
        )
    }

    /// The choice, or the parts it lacks and those it asks for ahead, each by what it names.
    fn lacking(&self) -> Result<Option<Routed>, Vec<String>> {
        let lack = match densest(&self.drawn, &mut Replay::new(self, false)) {
            Ok(best) => return Ok(best.cloned()),
            Err(lack) => lack,
        };
        let mut hopeful = Replay::new(self, true);
        let later = densest(&self.drawn, &mut hopeful).err().unwrap_or_default();
        let ahead = (self.searches.iter()).flat_map(|(&way, found)| {
            let rooms = self.rooms.iter();
            rooms
                .filter(move |room| !self.drawings.contains_key(&(way, room.to_bits())))
                .map(move |&room| {
                    let found = found.clone();
                    self.part(way, Ask::Drawings { found, room })
                })
        });
        let parts = (lack
            .into_iter()
            .chain(hopeful.lacking)
            .chain(later)
            .chain(ahead))
        .map(|part| serde_json::to_string(&part).expect("a part writes as JSON"));
        Err(parts.collect())
    }

    /// Keep what a part answered.
    ///
    /// # Errors
    ///
    /// A part or an answer that does not read.
    pub(in crate::blocks) fn take(&mut self, part: &str, answer: &str) -> Result<(), String> {
        let unreadable =
            |error: serde_json::Error| format!("A part's answer is unreadable: {error}");
        let part: Part = serde_json::from_str(part).map_err(unreadable)?;
        // A part asked for the drawing that the split chose before is no longer read.
        if part.plain != self.plain {
            return Ok(());
        }
        match part.ask {
            Ask::Search(searching) => {
                let found = serde_json::from_str(answer).map_err(unreadable)?;
                if matches!(searching, Searching::Scout) {
                    self.scouts.insert(part.way, found);
                } else {
                    self.searches.insert(part.way, found);
                }
            }
            Ask::Drawings { room, .. } => {
                let drawn = serde_json::from_str(answer).map_err(unreadable)?;
                self.drawings.insert((part.way, room.to_bits()), drawn);
            }
            Ask::Tries { room, page, .. } => {
                let tries = serde_json::from_str(answer).map_err(unreadable)?;
                self.tries.insert((part.way, room.to_bits(), page), tries);
            }
        }
        Ok(())
    }

    fn part(&self, way: Way, ask: Ask) -> Part {
        Part {
            plain: self.plain,
            way,
            ask,
        }
    }

    /// The placements that the reading routes, the cheapest first, as one solve orders them: a
    /// crowded reading goes on with only its cheapest scouts.
    fn order(&self) -> Result<Vec<(Way, &Found)>, Vec<Part>> {
        if !self.crowded {
            return (self.gathered(&self.ways, &self.searches, |_| Searching::Whole)).map(cheapest);
        }
        let mut scouted = cheapest(self.gathered(&self.ways, &self.scouts, |_| Searching::Scout)?);
        scouted.truncate(CROWDED_TRIES);
        let ways: Vec<Way> = scouted.iter().map(|(way, _)| *way).collect();
        let on = |way: Way| Searching::On(self.scouts[&way].grids.clone());
        self.gathered(&ways, &self.searches, on).map(cheapest)
    }

    /// What the searches of some ways found, or the searches that some of them still lack.
    fn gathered<'s>(
        &'s self,
        ways: &[Way],
        found: &'s BTreeMap<Way, Found>,
        searching: impl Fn(Way) -> Searching,
    ) -> Result<Vec<(Way, &'s Found)>, Vec<Part>> {
        let lack: Vec<Part> = (ways.iter())
            .filter(|way| !found.contains_key(way))
            .map(|&way| self.part(way, Ask::Search(searching(way))))
            .collect();
        if !lack.is_empty() {
            return Err(lack);
        }
        Ok(ways.iter().map(|way| (*way, &found[way])).collect())
    }
}

/// Some placements, the cheapest first, as one solve sorts them.
fn cheapest(mut found: Vec<(Way, &Found)>) -> Vec<(Way, &Found)> {
    found.sort_by(|a, b| f64::from_bits(a.1.cost).total_cmp(&f64::from_bits(b.1.cost)));
    found
}

/// The choice of one solve, made again from what the parts answered. A hopeful replay goes on
/// past a drawing whose further tries have not answered, as if it had none, to find what else to
/// ask for ahead.
struct Replay<'s> {
    split: &'s Split,
    hopeful: bool,
    lacking: Vec<Part>,
    room: f64,
    /// The drawings of the room, in the order they are routed: each one's placement, and the
    /// drawing as its part answered it.
    chains: Vec<(Way, &'s Found, &'s Drawn)>,
}

impl<'s> Replay<'s> {
    fn new(split: &'s Split, hopeful: bool) -> Self {
        Replay {
            split,
            hopeful,
            lacking: Vec::new(),
            room: 0.0,
            chains: Vec::new(),
        }
    }
}

impl<'s> Tries for Replay<'s> {
    type Drawing = &'s Routed;
    type Lack = Vec<Part>;

    fn drawings(&mut self, room: f64) -> Result<usize, Self::Lack> {
        let split = self.split;
        let order = split.order()?;
        let key = |way: Way| (way, room.to_bits());
        let lack: Vec<Part> = (order.iter())
            .filter(|(way, _)| !split.drawings.contains_key(&key(*way)))
            .map(|&(way, found)| {
                let found = found.clone();
                split.part(way, Ask::Drawings { found, room })
            })
            .collect();
        if !lack.is_empty() {
            return Err(lack);
        }
        self.room = room;
        self.chains = (order.into_iter())
            .flat_map(|(way, found)| {
                split.drawings[&key(way)]
                    .iter()
                    .map(move |drawn| (way, found, drawn))
            })
            .collect();
        // One frame keeps only its short drawings, when it has any, as one solve's drawings do.
        let short = |(_, _, drawn): &(Way, &Found, &Drawn)| drawn.short;
        if dense::frames(&split.drawn) == 1 && self.chains.iter().any(short) {
            self.chains.retain(short);
        }
        Ok(self.chains.len())
    }

    fn route(&mut self, at: usize, tried: usize) -> Result<Try<Self::Drawing>, Self::Lack> {
        let (way, found, drawn) = self.chains[at];
        if tried == 0 {
            return Ok((&drawn.first).into());
        }
        if !drawn.gives {
            return Ok(Try::Over);
        }
        if let Some(tries) = (self.split.tries).get(&(way, self.room.to_bits(), drawn.page)) {
            return Ok(tries.get(tried - 1).map_or(Try::Over, Into::into));
        }
        let part = self.split.part(
            way,
            Ask::Tries {
                found: found.clone(),
                room: self.room,
                page: drawn.page,
                wanting: drawn.wanting.clone(),
            },
        );
        if self.hopeful {
            self.lacking.push(part);
            return Ok(Try::Over);
        }
        Err(vec![part])
    }
}
