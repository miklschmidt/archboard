//! The plate a route's words take, and the room its ends keep clear of bends and marks.

use super::own::Own;
use crate::{
    blocks::planned::model::Model,
    constants::{BEND_RADIUS, STRAIGHT_RUN, apron},
    geometry::{Point, Rect},
};

/// How far a line's words stand at least from each end of the run they stand on, where the
/// line bends.
const BEND_ROOM: f64 = 16.0;
/// How far a cable's words stand at least past the corner of its inner strand.
const CORNER_CLEAR: f64 = 4.0;

/// The space the words take, and what their ends keep clear of bends and marks.
#[derive(Clone, Copy)]
pub(super) struct Plate {
    pub(super) size: Rect,
    bend_room: f64,
    mark_room: f64,
}

impl Plate {
    /// The plate of a route's words, or their narrow plate where they wrap narrower.
    pub(super) fn of(model: &Model<'_>, own: Own<'_>, narrow: bool) -> Option<Self> {
        let size = size(model, own.edge, narrow)?;
        let (half, reach) = model.ink(own.edge);
        // A cable's inner strand bends as much nearer its words than its middle does as the run
        // beyond the bend stands its strands out, at most half its fan, and its corner ends a
        // bend's radius further on. At its cards a cable that bends steps its strands out over the
        // apron, and a strand's jog rounds a bend beyond it; a straight one only keeps its marks
        // clear.
        let mark_room = match (reach > 0.0, own.path.len()) {
            (false, _) => 0.0,
            (true, 2) => STRAIGHT_RUN,
            (true, _) => apron(half, reach) + BEND_RADIUS,
        };
        Some(Self {
            size,
            bend_room: BEND_ROOM.max(BEND_RADIUS + reach + CORNER_CLEAR),
            mark_room,
        })
    }

    /// How far the words stand clear of `point`, an end of the run they stand on.
    pub(super) fn room_at(self, point: Point, own: Own<'_>) -> f64 {
        if self.mark_room > self.bend_room
            && (own.path.first() == Some(&point) || own.path.last() == Some(&point))
        {
            self.mark_room
        } else {
            self.bend_room
        }
    }
}

/// The size of a label's plate, or of its narrow plate where its words wrap narrower.
fn size(model: &Model<'_>, edge: usize, narrow: bool) -> Option<Rect> {
    let label = model.edges[edge].label()?;
    let (width, height) = if narrow {
        let plate = label.narrow?;
        (plate.width, plate.height)
    } else {
        (label.width.unwrap_or(0.0), label.height.unwrap_or(0.0))
    };
    Some(Rect {
        x: 0.0,
        y: 0.0,
        width,
        height,
    })
}
