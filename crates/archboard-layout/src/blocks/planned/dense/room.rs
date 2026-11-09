//! Room that a placement's lines ask for on its grids. A line that the router refuses, or sends
//! a long way round, asks for a lane of room on its direct way: between the rows and between the
//! columns of its two parts, or between its part and the frame's wall that faces its door or its
//! tab. A way straight along a column or a row past another part asks for the room beside that
//! part instead. The placement then stands its cards again with that room.

use std::ops::Range;

use crate::{blocks::assembly::Placed, geometry::Rect};

use super::{Grids, grid::Grid};

/// The room one lane takes, which a line asks for each time.
const LANE_ROOM: f64 = 72.0;

/// The room a frame's grid holds past its gaps, where lines asked for it. Room `0` of the rows
/// lies under the tab, room `i` between rows `i - 1` and `i`, and the last under the last row.
/// The columns' room counts the same way from the left wall.
#[derive(Clone, Debug, Default)]
pub(in crate::blocks::planned) struct Room {
    rows: Vec<f64>,
    columns: Vec<f64>,
}

impl Room {
    pub(super) fn row(&self, at: usize) -> f64 {
        self.rows.get(at).copied().unwrap_or(0.0)
    }

    pub(super) fn column(&self, at: usize) -> f64 {
        self.columns.get(at).copied().unwrap_or(0.0)
    }

    /// A lane of room in each row room and each column room of some ranges, and whether that
    /// is any room at all.
    fn add(&mut self, grid: &Grid, (rows, columns): (Range<usize>, Range<usize>)) -> bool {
        self.rows.resize(grid.rows() + 1, 0.0);
        self.columns.resize(grid.columns + 1, 0.0);
        let asks = !rows.is_empty() || !columns.is_empty();
        for at in rows {
            self.rows[at] += LANE_ROOM;
        }
        for at in columns {
            self.columns[at] += LANE_ROOM;
        }
        asks
    }
}

/// Where one end of a line stands.
enum End {
    /// A part, by its frame and its column and row there.
    Part(usize, (usize, usize)),
    /// A frame's tab.
    Tab(usize),
    /// A card outside every frame, by its box.
    Outside(Rect),
}

/// The row rooms and the column rooms on the direct way from a part of a frame, at some column
/// and row of its grid, to a line's other end, when that end stands in the frame, on its tab or
/// outside it. A way that runs straight along a column past another part passes it in the
/// column room beside it, and one that runs along a row passes in the row room beside it.
fn way(
    grid: &Grid,
    (frame, wall): (usize, Option<Rect>),
    (column, row): (usize, usize),
    other: &End,
) -> Option<(Range<usize>, Range<usize>)> {
    let (rows, columns) = direct(grid, (frame, wall), (column, row), other)?;
    let held = |column: usize, row: usize| grid.cells.contains(&(row * grid.columns + column));
    // A way through some rooms passes every row or column between them.
    let passed = |rooms: &Range<usize>| rooms.start..rooms.end.saturating_sub(1);
    if columns.is_empty() && passed(&rows).any(|at| held(column, at)) {
        let at = toward_middle(column, grid.columns);
        return Some((0..0, at..at + 1));
    }
    if rows.is_empty() && passed(&columns).any(|at| held(at, row)) {
        let at = toward_middle(row, grid.rows());
        return Some((at..at + 1, 0..0));
    }
    Some((rows, columns))
}

/// The room beside a column, or a row, of some count, on the side that faces the frame's middle.
fn toward_middle(at: usize, count: usize) -> usize {
    if 2 * at + 1 < count { at + 1 } else { at }
}

/// The row rooms and the column rooms between a part and a line's other end: between the rows
/// and between the columns of two parts, or between the part and the wall of the frame that
/// faces a tab or a card outside.
fn direct(
    grid: &Grid,
    (frame, wall): (usize, Option<Rect>),
    (column, row): (usize, usize),
    other: &End,
) -> Option<(Range<usize>, Range<usize>)> {
    Some(match *other {
        End::Part(at, (other_column, other_row)) if at == frame => (
            row.min(other_row) + 1..row.max(other_row) + 1,
            column.min(other_column) + 1..column.max(other_column) + 1,
        ),
        End::Tab(at) if at == frame => (0..row + 1, 0..0),
        End::Outside(door) => to_wall(grid, (column, row), wall?, door),
        _ => return None,
    })
}

/// The row rooms or the column rooms between a part and the wall of its frame that faces a
/// card outside.
fn to_wall(
    grid: &Grid,
    (column, row): (usize, usize),
    wall: Rect,
    door: Rect,
) -> (Range<usize>, Range<usize>) {
    let none = 0..0;
    if door.y + door.height <= wall.y {
        (0..row + 1, none)
    } else if door.y >= wall.y + wall.height {
        (row + 1..grid.rows() + 1, none)
    } else if door.x + door.width <= wall.x {
        (none, 0..column + 1)
    } else {
        (none, column + 1..grid.columns + 1)
    }
}

impl Grids<'_> {
    /// Where a card stands in a drawing of one searched placement.
    fn end(&self, index: usize, drawn: &Placed, id: &str) -> Option<End> {
        let grids = self.placement(index).1;
        let blocks = &self.reading.blocks;
        if let Some(frame) = blocks
            .iter()
            .position(|block| block.framed && block.frame.id == id)
        {
            return Some(End::Tab(frame));
        }
        let part = (blocks.iter().enumerate()).find_map(|(frame, block)| {
            let item = block.items.iter().position(|item| item.node.id == id)?;
            Some((frame, item))
        });
        if let Some((frame, item)) = part {
            let grid = &grids[frame];
            return Some(End::Part(frame, grid.at(grid.cells[item])));
        }
        let card = drawn.cards.iter().find(|card| card.id == id)?;
        Some(End::Outside(card.bx))
    }

    /// Ask one searched placement's grids, as a drawing stood them, for room on the direct way
    /// of a line between two cards, and tell whether they gave any.
    pub(super) fn ask(
        &self,
        index: usize,
        drawn: &Placed,
        rooms: &mut Vec<Room>,
        ends: [&str; 2],
    ) -> bool {
        let (Some(one), Some(other)) = (
            self.end(index, drawn, ends[0]),
            self.end(index, drawn, ends[1]),
        ) else {
            return false;
        };
        let ((End::Part(frame, cell), other) | (other, End::Part(frame, cell))) = (one, other)
        else {
            return false;
        };
        let block = &self.reading.blocks[frame];
        let wall = (drawn.frames.iter())
            .find(|placed| block.framed && placed.id == block.frame.id)
            .map(|placed| placed.bx);
        let grid = &self.placement(index).1[frame];
        let Some(asked) = way(grid, (frame, wall), cell, &other) else {
            return false;
        };
        rooms.resize(self.reading.blocks.len(), Room::default());
        rooms[frame].add(grid, asked)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const WALL: Rect = Rect {
        x: 0.0,
        y: 0.0,
        width: 500.0,
        height: 500.0,
    };

    /// A door outside the frame's wall, at some corner.
    fn door(x: f64, y: f64) -> End {
        End::Outside(Rect {
            x,
            y,
            width: 100.0,
            height: 40.0,
        })
    }

    /// The row rooms and the column rooms that a line from a part at some cell of a grid of two
    /// columns and three rows, holding parts in some cells, asks for.
    fn rooms(
        held: &[usize],
        cell: (usize, usize),
        other: &End,
    ) -> Option<(Vec<usize>, Vec<usize>)> {
        let grid = Grid {
            columns: 2,
            rows: 3,
            cells: held.to_vec(),
        };
        way(&grid, (0, Some(WALL)), cell, other)
            .map(|(rows, columns)| (rows.collect(), columns.collect()))
    }

    /// A line asks for room only between its ends: between the rows of two parts in one
    /// column, and between a part and the wall that faces the door it joins.
    #[test]
    fn a_line_asks_for_room_between_its_ends() {
        let none: Vec<usize> = Vec::new();
        // No other part stands in the way.
        let ends: [usize; 0] = [];
        assert_eq!(
            rooms(&ends, (0, 0), &End::Part(0, (0, 2))),
            Some((vec![1, 2], none.clone()))
        );
        assert_eq!(
            rooms(&ends, (0, 1), &door(700.0, 200.0)),
            Some((none.clone(), vec![1, 2]))
        );
        assert_eq!(
            rooms(&ends, (0, 1), &door(200.0, 700.0)),
            Some((vec![2, 3], none))
        );
        assert_eq!(rooms(&ends, (0, 1), &End::Part(1, (0, 0))), None);
    }

    /// A line straight along a column or a row past another part asks for the room beside that
    /// part, on the side that faces the frame's middle. Room between the rows it passes would
    /// not let it by.
    #[test]
    fn a_line_past_a_part_asks_for_room_beside_it() {
        let none: Vec<usize> = Vec::new();
        // Parts down the left column, and one in the middle of the right.
        let held = [0, 2, 4, 3];
        assert_eq!(
            rooms(&held, (0, 0), &End::Part(0, (0, 2))),
            Some((none.clone(), vec![1]))
        );
        assert_eq!(
            rooms(&held, (0, 0), &door(200.0, 700.0)),
            Some((none.clone(), vec![1]))
        );
        assert_eq!(
            rooms(&held, (0, 1), &door(700.0, 200.0)),
            Some((vec![1], none))
        );
    }
}
