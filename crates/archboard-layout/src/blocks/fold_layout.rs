//! A folded block: its header and ports, its columns side by side, and the
//! lines between them. What continues from one column into a later one leaves
//! the bottom of its column, runs along the channel under the columns, rises
//! in the gutter left of the column it enters, and comes down into that column
//! from the channel above them: every such line keeps to the same corridors,
//! so the fold reads as one bus from the end of a column to the start of the
//! next. The block's own ports stand over or under what their lines reach.

use crate::ecma::{abs, js_max, js_min, max, min, number_of, sort_by};
use crate::geometry::{Point, Rect, Side};
use crate::track::chains::LANE;
use crate::track::channels::spread_ports;
use crate::track::scene::Map;
use crate::track::spacing::{TRACK_TOP, channel_height};
use crate::track::tracks::{Unit, stack_units, unit_across};

use super::fold::MIN_GUTTER;
use super::headers::{Header, Room, header_within};
use super::laid::{Insets, Laid, LaidMap, Size};
use super::leaves::{PORT, rim_of};
use super::tree::{BlockId, BlockTree, Line, header_of};

/// Room a gutter keeps either side of its lanes.
const GUTTER_MARGIN: f64 = 20.0;
/// How far apart two ends may be and still be one straight drop.
const STRAIGHT: f64 = 0.5;

/// How far down a laid-out column the first thing it shows stands: its first
/// card, or a container or region it draws around its first cards.
fn first_card_top(laid: &Laid) -> f64 {
    let card = laid
        .bands
        .iter()
        .find(|band| !band.items.is_empty())
        .map_or(0.0, |band| band.top);
    let frames = laid.frames.iter().flatten().map(|frame| frame.bx.y);
    let regions = laid.regions.iter().flatten().map(|region| region.bx.y);
    min(std::iter::once(card).chain(frames).chain(regions))
}

/// Where a line of the folded block runs.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Way {
    /// Down from the block's header or top port into a column.
    Down,
    /// Out of a column to its bottom port.
    Out,
    /// Over from one column to a later one through the gutter left of the later one.
    Over,
}

/// Where one line of the folded block runs.
struct Course {
    way: Way,
    line: Line,
    /// The column it leaves, if any.
    from: Option<usize>,
    /// The column it enters, if any.
    to: Option<usize>,
    /// Its lane in the gutter, for a line over.
    lane: f64,
}

/// A channel's stacked runs: each course's track, by course, and how many tracks.
struct Stacked {
    tracks: Map<usize, usize>,
    count: usize,
}

/// A folded block's own layout.
pub(crate) struct FoldLayout<'t> {
    tree: &'t BlockTree,
    laid: &'t LaidMap,
    block: BlockId,
    columns: Vec<BlockId>,
    insets: Insets,
    boxes: Map<String, Rect>,
    lines: Map<String, Vec<Point>>,
    /// Each own port's x.
    port_x: Map<String, f64>,
    /// Each column's x.
    column_x: Vec<f64>,
    /// The block's header as laid out: at its least size until the columns say how wide the block is.
    header: Option<Size>,
}

impl<'t> FoldLayout<'t> {
    /// Start the layout of a folded block.
    pub(crate) fn new(
        tree: &'t BlockTree,
        laid: &'t LaidMap,
        block: BlockId,
        columns: Vec<BlockId>,
        insets: Insets,
    ) -> FoldLayout<'t> {
        let header = tree.get(block).header.as_ref().map(Header::size);
        FoldLayout {
            tree,
            laid,
            block,
            columns,
            insets,
            boxes: Map::default(),
            lines: Map::default(),
            port_x: Map::default(),
            column_x: Vec::new(),
            header,
        }
    }

    /// The block's own ports on one side.
    fn ports_on(&self, side: Side) -> Vec<String> {
        self.tree
            .get(self.block)
            .ports
            .iter()
            .filter(|&(_, &at)| at == side)
            .map(|(port, _)| port.clone())
            .collect()
    }

    /// The column a pin stands on, or nothing when the end is the block's own.
    fn column_of(&self, end: &str) -> Option<usize> {
        let pin = self.tree.pins.get(end)?;
        self.columns.iter().position(|&column| column == pin.block)
    }

    /// Where one line of the block runs.
    fn course_of(&self, line: &Line) -> Course {
        let (from, to) = (self.column_of(&line.tail), self.column_of(&line.head));
        let way = if from.is_none() {
            Way::Down
        } else if to.is_none() {
            Way::Out
        } else {
            Way::Over
        };
        Course {
            way,
            line: line.clone(),
            from,
            to,
            lane: 0.0,
        }
    }

    /// The x of a line end: a pin's port, an own port, or the header's middle.
    fn end_x(&self, end: &str) -> f64 {
        if let Some(pin) = self.tree.pins.get(end) {
            let at = self.laid[self.tree.get(pin.block).id.as_str()].boxes[pin.port.as_str()];
            let column = self
                .columns
                .iter()
                .position(|&column| column == pin.block)
                .expect("a pin on a column");
            return self.column_x[column] + at.x + at.width / 2.0;
        }
        self.port_x.get(end).copied().unwrap_or_else(|| {
            let header = self.boxes[end];
            header.x + header.width / 2.0
        })
    }

    /// Every gutter's width, left of each column: room for the lanes that rise in it.
    fn gutters(&self, courses: &[Course]) -> Vec<f64> {
        (0..self.columns.len())
            .map(|index| {
                let lanes = courses
                    .iter()
                    .filter(|course| course.way == Way::Over && course.to == Some(index))
                    .count();
                if index == 0 {
                    return 0.0;
                }
                js_max(
                    MIN_GUTTER,
                    2.0 * GUTTER_MARGIN + lanes.saturating_sub(1) as f64 * LANE,
                )
            })
            .collect()
    }

    /// Give every line over a gutter its lane: the line leaving furthest right
    /// rises nearest its source column, so the runs under the columns nest.
    fn lanes(&self, courses: &mut [Course], gutters: &[f64]) {
        for (index, &width) in gutters.iter().enumerate() {
            let mut over: Vec<usize> = (0..courses.len())
                .filter(|&at| courses[at].way == Way::Over && courses[at].to == Some(index))
                .collect();
            sort_by(&mut over, |&one, &other| {
                self.end_x(&courses[other].line.tail) - self.end_x(&courses[one].line.tail)
            });
            let room = width - 2.0 * GUTTER_MARGIN;
            let gaps = over.len().saturating_sub(1) as f64;
            let step = if over.len() > 1 {
                js_min(LANE, room / gaps)
            } else {
                0.0
            };
            let start = self.column_x[index] - width + GUTTER_MARGIN + (room - step * gaps) / 2.0;
            for (lane, &course) in over.iter().enumerate() {
                courses[course].lane = start + lane as f64 * step;
            }
        }
    }

    /// The mean x of what some lines reach.
    fn mean(reached: &[f64]) -> f64 {
        reached.iter().fold(0.0, |sum, x| sum + x) / js_max(1.0, reached.len() as f64)
    }

    /// Where the block's own ports stand: over or under the pins their lines
    /// reach, clear of the header, a lane apart.
    fn place_ports(&mut self, courses: &[Course], side: Side, right: f64) {
        let ports = self.ports_on(side);
        let top = side == Side::Top;
        let mut wanted: Vec<(String, f64)> = ports
            .iter()
            .map(|port| {
                let reached: Vec<f64> = courses
                    .iter()
                    .filter(|course| {
                        if top {
                            course.line.tail == *port
                        } else {
                            course.line.head == *port
                        }
                    })
                    .map(|course| {
                        self.end_x(if top {
                            &course.line.head
                        } else {
                            &course.line.tail
                        })
                    })
                    .collect();
                (port.clone(), Self::mean(&reached))
            })
            .collect();
        sort_by(&mut wanted, |one, other| one.1 - other.1);
        let clear = self.insets.side
            + self
                .header
                .as_ref()
                .map_or(0.0, |header| header.width + LANE);
        let low = if top { clear } else { self.insets.side };
        let high = js_max(right, low + LANE * (ports.len() + 1) as f64);
        let xs = spread_ports(
            &Rect {
                x: low,
                y: 0.0,
                width: high - low,
                height: 0.0,
            },
            &wanted.iter().map(|(_, x)| *x).collect::<Vec<_>>(),
        );
        for ((port, _), x) in wanted.into_iter().zip(xs) {
            self.port_x.insert(port, x);
        }
    }

    /// The run one course makes in one channel, if it turns there.
    fn unit_of(&self, course: &Course, channel: Side) -> Option<Unit> {
        let order = number_of(course.line.edge.option("archboard.order").unwrap_or("0"));
        let tail = self.end_x(&course.line.tail);
        let head = self.end_x(&course.line.head);
        if course.way != Way::Over {
            let own = (course.way == Way::Down) == (channel == Side::Top);
            return (own && abs(tail - head) > STRAIGHT)
                .then(|| unit_across(vec![tail], vec![head], order));
        }
        Some(if channel == Side::Top {
            unit_across(Vec::new(), vec![course.lane, head], order)
        } else {
            unit_across(vec![tail, course.lane], Vec::new(), order)
        })
    }

    /// Stack the runs of one channel.
    fn stack(&self, courses: &[Course], channel: Side) -> Stacked {
        let mut owners = Vec::new();
        let mut units = Vec::new();
        for (index, course) in courses.iter().enumerate() {
            if let Some(unit) = self.unit_of(course, channel) {
                owners.push(index);
                units.push(unit);
            }
        }
        let stacked = stack_units(&units);
        let count = stacked
            .iter()
            .map(|&(_, track)| track + 1)
            .max()
            .unwrap_or(0);
        Stacked {
            tracks: stacked
                .into_iter()
                .map(|(unit, track)| (owners[unit], track))
                .collect(),
            count,
        }
    }

    /// Place the columns side by side. Answers where the last column ends.
    fn place_columns(&mut self, gutters: &[f64]) -> f64 {
        let mut x = self.insets.side;
        for (index, &column) in self.columns.iter().enumerate() {
            x += gutters[index];
            self.column_x.push(x);
            x += self.laid[self.tree.get(column).id.as_str()].width;
        }
        x
    }

    /// Place the header in the block's top-left corner, at the widest size it
    /// has room for once the columns stand: no wider than the columns, and left
    /// of where each top port wants to stand.
    fn place_header(&mut self, courses: &[Course], right: f64) {
        let block = self.tree.get(self.block);
        let Some(least) = &block.header else {
            return;
        };
        let Insets { side, top, .. } = self.insets;
        let beside: Vec<f64> = self
            .ports_on(Side::Top)
            .iter()
            .map(|port| {
                let reached: Vec<f64> = courses
                    .iter()
                    .filter(|course| course.line.tail == *port)
                    .map(|course| self.end_x(&course.line.head))
                    .collect();
                Self::mean(&reached) - LANE - side
            })
            .collect();
        let taken = header_within(
            least,
            &Room {
                frame: right + side,
                content: right - side,
                beside: &beside,
            },
        );
        self.boxes.insert(
            header_of(block),
            Rect {
                x: side,
                y: top,
                width: taken.width,
                height: taken.height,
            },
        );
        self.header = Some(taken);
    }

    /// The room above the columns: the channel its runs need, or where no line
    /// turns under the header, the block's own inset.
    fn head_room(&self, top: &Stacked) -> f64 {
        let rim = if top.count == 0 {
            rim_of(self.tree.get(self.block), self.insets)
        } else {
            None
        };
        rim.map_or_else(
            || channel_height(top.count, 0.0, false, false),
            |rim| rim.head,
        )
    }

    /// Put every column, own port and channel at its height. Answers the tops of both channels.
    fn stack_rows(&mut self, top: &Stacked, bottom: &Stacked) -> (f64, f64) {
        let tops = self.ports_on(Side::Top);
        let row = js_max(
            self.header.as_ref().map_or(0.0, |header| header.height),
            if tops.is_empty() { 0.0 } else { PORT },
        );
        let channel_top = self.insets.top + row;
        let columns_top = channel_top + self.head_room(top);
        // Every column's first card stands on one line, as newspaper columns do.
        let heads: Vec<f64> = self
            .columns
            .iter()
            .map(|&column| first_card_top(&self.laid[self.tree.get(column).id.as_str()]))
            .collect();
        let lowest = max(heads.iter().copied());
        for (index, &column) in self.columns.iter().enumerate() {
            let id = &self.tree.get(column).id;
            let inner = &self.laid[id.as_str()];
            let y = columns_top + lowest - heads[index];
            self.boxes.insert(
                id.clone(),
                Rect {
                    x: self.column_x[index],
                    y,
                    width: inner.width,
                    height: inner.height,
                },
            );
        }
        let channel_bottom = max(self.columns.iter().map(|&column| {
            let at = self.boxes[self.tree.get(column).id.as_str()];
            at.y + at.height
        }));
        for port in tops {
            let at = self.port_box(&port, self.insets.top + row / 2.0);
            self.boxes.insert(port, at);
        }
        let ports = self.ports_on(Side::Bottom);
        let needed = bottom.count > 0 || !ports.is_empty();
        let ports_top = channel_bottom
            + if needed {
                channel_height(bottom.count, 0.0, false, false)
            } else {
                0.0
            };
        for port in ports {
            let at = self.port_box(&port, ports_top);
            self.boxes.insert(port, at);
        }
        (channel_top, channel_bottom)
    }

    /// An own port's box.
    fn port_box(&self, port: &str, y: f64) -> Rect {
        Rect {
            x: self.port_x[port] - PORT / 2.0,
            y,
            width: PORT,
            height: PORT,
        }
    }

    /// The box a line end stands on: its own box, or its column's.
    fn stand_on(&self, end: &str, column: Option<usize>) -> Rect {
        self.boxes.get(end).copied().unwrap_or_else(|| {
            let column = column.expect("a line end in a column");
            self.boxes[self.tree.get(self.columns[column]).id.as_str()]
        })
    }

    /// The height of a course's track in one channel, if it turns there.
    fn track_of(course: usize, stacked: &Stacked, top: f64) -> Option<f64> {
        stacked
            .tracks
            .get(&course)
            .map(|&track| top + TRACK_TOP + track as f64 * LANE)
    }

    /// Draw one line of the folded block, from its source-side end.
    fn draw(
        &mut self,
        courses: &[Course],
        index: usize,
        top: &Stacked,
        bottom: &Stacked,
        rows: (f64, f64),
    ) {
        let course = &courses[index];
        let line = &course.line;
        let upper = self.stand_on(&line.tail, course.from);
        let leaves = Point {
            x: self.end_x(&line.tail),
            y: upper.y + upper.height,
        };
        let enters = Point {
            x: self.end_x(&line.head),
            y: self.stand_on(&line.head, course.to).y,
        };
        let high = Self::track_of(index, top, rows.0);
        let low = Self::track_of(index, bottom, rows.1);
        let mut points = match course.way {
            Way::Over => {
                let (low, high) = (
                    low.expect("a track under the columns"),
                    high.expect("a track above them"),
                );
                vec![
                    leaves,
                    Point {
                        x: leaves.x,
                        y: low,
                    },
                    Point {
                        x: course.lane,
                        y: low,
                    },
                    Point {
                        x: course.lane,
                        y: high,
                    },
                    Point {
                        x: enters.x,
                        y: high,
                    },
                    enters,
                ]
            }
            way => match if way == Way::Down { high } else { low } {
                None => vec![leaves, enters],
                Some(track) => vec![
                    leaves,
                    Point {
                        x: leaves.x,
                        y: track,
                    },
                    Point {
                        x: enters.x,
                        y: track,
                    },
                    enters,
                ],
            },
        };
        if line.from != line.tail {
            points.reverse();
        }
        self.lines.insert(line.key.clone(), points);
    }

    /// Lay the folded block out.
    pub(crate) fn lay(mut self) -> Laid {
        let block = self.tree.get(self.block);
        let mut courses: Vec<Course> = block
            .lines
            .values()
            .map(|line| self.course_of(line))
            .collect();
        let gutters = self.gutters(&courses);
        let right = self.place_columns(&gutters);
        self.lanes(&mut courses, &gutters);
        self.place_header(&courses, right);
        self.place_ports(&courses, Side::Top, right);
        self.place_ports(&courses, Side::Bottom, right);
        let top = self.stack(&courses, Side::Top);
        let bottom = self.stack(&courses, Side::Bottom);
        let rows = self.stack_rows(&top, &bottom);
        for index in 0..courses.len() {
            self.draw(&courses, index, &top, &bottom, rows);
        }
        let header = self.header.as_ref().map_or(0.0, |header| header.width);
        let ended = !self.ports_on(Side::Bottom).is_empty();
        let width =
            max(std::iter::once(header).chain(self.boxes.values().map(|one| one.x + one.width)))
                + self.insets.side;
        let height = max(self.boxes.values().map(|one| one.y + one.height))
            + if ended { 0.0 } else { self.insets.bottom };
        Laid {
            width,
            height,
            boxes: self.boxes,
            lines: self.lines,
            ..Laid::default()
        }
    }
}
