//! Frame side doors, in a Lanes drawing. A line that crosses a container's top or bottom to a
//! card inside that stands nearest one of the container's walls on its row can come in through
//! that wall instead: its run outside turns down (or up) beside the wall, a lane out, and enters
//! the card's side straight through the wall. Each such line is kept only where it then bends
//! less, runs no longer, crosses no more lines and none at its arrowhead, overlaps none, and
//! passes no box; a line that runs with its bus keeps to the bus. One such line lands on a card
//! face, and a face another line already ends on takes none. The lines through one wall stand a
//! lane apart outside it, the line whose run comes from further away innermost.

use archboard_scene::geometry::{Point, Rect};

use crate::ecma::abs;
use crate::lanes::chains::LANE;
use crate::lanes::side_runs::{
    OVERLAP, Run, at_face, bends, length, meets, met, runs_of, through, worse,
};

/// What the pass reads of a laid-out picture: every card's box, every frame's box with its depth,
/// and every line's points, which it rewrites.
pub(crate) struct Picture<'p> {
    pub cards: &'p [Rect],
    pub frames: &'p [(Rect, usize)],
    pub lines: &'p mut [Vec<Point>],
}

/// Whether a point stands inside a box.
fn inside(point: Point, bx: &Rect) -> bool {
    point.x > bx.x && point.x < bx.x + bx.width && point.y > bx.y && point.y < bx.y + bx.height
}

/// A line that could come in through a wall: its index, whether it is drawn from the card
/// (leaving), the card's box, the wall's x, the run's height outside, and its points up to that
/// run, outside end first.
struct Door {
    line: usize,
    leaving: bool,
    card: Rect,
    frame: Rect,
    wall: f64,
    run: f64,
    outside: Vec<Point>,
}

/// A line's points, outside end first.
fn outside_first(placed: &Picture<'_>, line: usize, leaving: bool) -> Vec<Point> {
    let mut points = placed.lines[line].clone();
    if leaving {
        points.reverse();
    }
    points
}

/// The card a point stands on the top or bottom face of.
fn card_under(placed: &Picture<'_>, end: Point) -> Option<Rect> {
    placed.cards.iter().copied().find(|bx| {
        (abs(end.y - bx.y) < 0.5 || abs(end.y - bx.y - bx.height) < 0.5)
            && end.x > bx.x
            && end.x < bx.x + bx.width
    })
}

/// The line ends that touch cards or frames in the assembled picture.
fn ends_of(placed: &Picture<'_>) -> impl Iterator<Item = Point> {
    placed
        .lines
        .iter()
        .filter_map(|points| Some([*points.first()?, *points.last()?]))
        .flatten()
}

/// A wall move removes a port after routing. Only a lone port can leave its face centred.
fn lone_on_face(placed: &Picture<'_>, card: &Rect, y: f64) -> bool {
    ends_of(placed)
        .filter(|end| abs(end.y - y) < 0.5 && end.x > card.x && end.x < card.x + card.width)
        .take(2)
        .count()
        == 1
}

/// The innermost frame round a card.
fn frame_round(placed: &Picture<'_>, card: &Rect) -> Option<Rect> {
    let corner = Point {
        x: card.x + 1.0,
        y: card.y + 1.0,
    };
    let frame = (placed
        .frames
        .iter()
        .filter(|frame| inside(corner, &frame.0)))
    .max_by_key(|frame| frame.1)?;
    Some(frame.0)
}

/// The wall of a frame nearer a card, when nothing stands on the card's row between them.
fn wall_toward(placed: &Picture<'_>, frame: &Rect, card: &Rect) -> Option<f64> {
    let walls = [
        (frame.x, card.x),
        (frame.x + frame.width, card.x + card.width),
    ];
    let (wall, face) = walls
        .into_iter()
        .min_by(|one, other| abs(one.0 - one.1).total_cmp(&abs(other.0 - other.1)))?;
    let mid = card.y + card.height / 2.0;
    let row = (Point { x: wall, y: mid }, Point { x: face, y: mid });
    let boxes = placed.cards.iter().copied();
    let frames = placed
        .frames
        .iter()
        .map(|one| one.0)
        .filter(|bx| bx != frame);
    let between = boxes
        .chain(frames)
        .filter(|bx| bx != card && !inside(row.0, bx))
        .any(|bx| through(row, &bx));
    (!between).then_some(wall)
}

/// The way in through a wall for one end of a line, when there is one.
fn door_of(placed: &Picture<'_>, line: usize, leaving: bool) -> Option<Door> {
    let points = outside_first(placed, line, leaving);
    let end = *points.last()?;
    let card = card_under(placed, end)?;
    let frame = frame_round(placed, &card)?;
    if inside(points[0], &frame) || !lone_on_face(placed, &card, end.y) {
        return None;
    }
    let crossed = (0..points.len() - 1)
        .rev()
        .find(|&at| !inside(points[at], &frame))?;
    if crossed == 0 || abs(points[crossed - 1].y - points[crossed].y) > 0.5 {
        return None;
    }
    Some(Door {
        line,
        leaving,
        card,
        frame,
        wall: wall_toward(placed, &frame, &card)?,
        run: points[crossed].y,
        outside: points[..crossed].to_vec(),
    })
}

/// Whether a line already ends on a card's face.
fn face_taken(placed: &Picture<'_>, card: &Rect, face: f64) -> bool {
    ends_of(placed).any(|end| {
        abs(end.x - face) < 0.5 && end.y > card.y - 0.5 && end.y < card.y + card.height + 0.5
    })
}

/// Whether runs outside, up to the one that comes in through the wall, pass a box: a card but
/// the one they reach, or a frame they cross into or out of.
fn blocked(placed: &Picture<'_>, runs: &[Run], card: &Rect) -> bool {
    runs.iter().any(|&run| {
        let cards = placed.cards.iter().copied().filter(|bx| bx != card);
        let frames = (placed.frames.iter().map(|frame| frame.0))
            .filter(|bx| !(inside(run.0, bx) && inside(run.1, bx)));
        cards.chain(frames).any(|bx| through(run, &bx))
    })
}

/// Whether an x stands among a picture's cards, not round the outside of them all.
fn among_cards(placed: &Picture<'_>, x: f64) -> bool {
    let mut cards = placed.cards.iter().copied();
    cards.clone().any(|bx| bx.x < x) && cards.any(|bx| bx.x + bx.width > x)
}

/// Whether a line through a wall reads better than the line it replaces, against the others.
fn reads_better(placed: &Picture<'_>, door: &Door, points: &[Point], others: &[Run]) -> bool {
    let old = outside_first(placed, door.line, door.leaving);
    let start = door.outside.len().saturating_sub(1);
    let outside = runs_of(&points[start..points.len() - 1]);
    let side = *points.last().expect("a point");
    let head = at_face(side.x, points[points.len() - 2].x, side.y);
    let old_meets = met(&runs_of(&old), others);
    let bused = old_meets / OVERLAP > 0;
    !bused
        && !blocked(placed, &outside, &door.card)
        && !others.iter().any(|&other| meets(head, other) > 0)
        && length(points) <= length(&old)
        && !worse(met(&runs_of(points), others), old_meets)
        && bends(points) < bends(&old)
}

/// The points of a line through a wall: its points up to its run outside, a turn a lane out
/// from the wall, and a level run through the wall onto the card's side at its middle.
fn through_wall(door: &Door, lane: f64, face: f64) -> Vec<Point> {
    let y = door.card.y + door.card.height / 2.0;
    let mut points = door.outside.clone();
    points.extend([
        Point {
            x: lane,
            y: door.run,
        },
        Point { x: lane, y },
        Point { x: face, y },
    ]);
    points
}

/// The runs of every line but one.
fn others_of(placed: &Picture<'_>, line: usize) -> Vec<Run> {
    (placed.lines.iter().enumerate())
        .filter(|&(at, _)| at != line)
        .flat_map(|(_, points)| runs_of(points))
        .collect()
}

#[cfg(test)]
#[test]
fn aligned_cards_can_both_receive_a_line_through_one_wall() {
    let card = |x, y| Rect {
        x,
        y,
        width: 60.0,
        height: 40.0,
    };
    let cards = [
        card(0.0, 0.0),
        card(120.0, 180.0),
        card(120.0, 400.0),
        card(0.0, 560.0),
    ];
    let frames = [(
        Rect {
            x: 100.0,
            y: 100.0,
            width: 300.0,
            height: 400.0,
        },
        0,
    )];
    let points = |pairs: [(f64, f64); 6]| pairs.into_iter().map(|(x, y)| Point { x, y }).collect();
    let mut lines = [
        points([
            (30.0, 40.0),
            (30.0, 60.0),
            (170.0, 60.0),
            (170.0, 140.0),
            (150.0, 140.0),
            (150.0, 180.0),
        ]),
        points([
            (30.0, 560.0),
            (30.0, 540.0),
            (170.0, 540.0),
            (170.0, 460.0),
            (150.0, 460.0),
            (150.0, 440.0),
        ]),
    ];
    enter_by_frame_sides(&mut Picture {
        cards: &cards,
        frames: &frames,
        lines: &mut lines,
    });
    assert_eq!(lines[0].last(), Some(&Point { x: 120.0, y: 200.0 }));
    assert_eq!(lines[1].last(), Some(&Point { x: 120.0, y: 420.0 }));
}

/// Bring one line in through its wall where that reads better, a lane out from the lines
/// already through it.
fn through_wall_if_better(
    placed: &mut Picture<'_>,
    door: &Door,
    taken: &[(Rect, f64)],
) -> Option<(Rect, f64)> {
    let toward = if door.wall <= door.card.x { -1.0 } else { 1.0 };
    // The card and wall stay fixed. A move at the other end can change the way in.
    let door = &door_of(placed, door.line, door.leaving)?;
    let face = door.card.x + if toward < 0.0 { 0.0 } else { door.card.width };
    let used = taken
        .iter()
        .filter(|&&(frame, wall)| frame == door.frame && wall == door.wall)
        .count();
    let lane = door.wall + toward * LANE * (used + 1) as f64;
    if face_taken(placed, &door.card, face) || !among_cards(placed, lane) {
        return None;
    }
    let mut points = through_wall(door, lane, face);
    if !reads_better(placed, door, &points, &others_of(placed, door.line)) {
        return None;
    }
    if door.leaving {
        points.reverse();
    }
    placed.lines[door.line] = points;
    Some((door.frame, door.wall))
}

#[cfg(test)]
#[test]
fn a_line_can_enter_two_frame_walls_without_undoing_its_first_end() {
    let card = |x, y| Rect {
        x,
        y,
        width: 60.0,
        height: 40.0,
    };
    let frame = |x, y| Rect {
        x,
        y,
        width: 300.0,
        height: 200.0,
    };
    let cards = [card(120.0, 180.0), card(110.0, 600.0), card(0.0, 900.0)];
    let frames = [(frame(100.0, 100.0), 0), (frame(90.0, 500.0), 0)];
    let mut lines = [[
        (150.0, 220.0),
        (150.0, 260.0),
        (180.0, 260.0),
        (180.0, 340.0),
        (30.0, 340.0),
        (30.0, 460.0),
        (180.0, 460.0),
        (180.0, 540.0),
        (140.0, 540.0),
        (140.0, 600.0),
    ]
    .into_iter()
    .map(|(x, y)| Point { x, y })
    .collect()];
    enter_by_frame_sides(&mut Picture {
        cards: &cards,
        frames: &frames,
        lines: &mut lines,
    });
    assert_eq!(lines[0].first(), Some(&Point { x: 120.0, y: 200.0 }));
    assert_eq!(lines[0].last(), Some(&Point { x: 110.0, y: 620.0 }));
}

/// Bring the lines that read better through a container's wall in through it.
pub(crate) fn enter_by_frame_sides(placed: &mut Picture<'_>) {
    let mut doors: Vec<Door> = (0..placed.lines.len())
        .flat_map(|line| [door_of(placed, line, false), door_of(placed, line, true)])
        .flatten()
        .collect();
    let reach = |door: &Door| abs(door.outside.last().map_or(0.0, |point| point.x) - door.wall);
    doors.sort_by(|one, other| reach(other).total_cmp(&reach(one)));
    let mut taken = Vec::new();
    for door in doors {
        if let Some(wall) = through_wall_if_better(placed, &door, &taken) {
            taken.push(wall);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn points(pairs: &[(f64, f64)]) -> Vec<Point> {
        pairs.iter().map(|&(x, y)| Point { x, y }).collect()
    }

    fn rect(x: f64, y: f64, width: f64, height: f64) -> Rect {
        Rect {
            x,
            y,
            width,
            height,
        }
    }

    fn at(x: f64, y: f64) -> Point {
        Point { x, y }
    }

    fn card(x: f64, y: f64) -> Rect {
        rect(x, y, 100.0, 60.0)
    }

    #[test]
    fn a_wall_entry_keeps_clear_of_a_crossing_at_a_straight_waypoint() {
        let cards = [rect(0.0, 0.0, 60.0, 40.0), rect(120.0, 180.0, 60.0, 40.0)];
        let frames = [(rect(100.0, 100.0, 300.0, 200.0), 0)];
        let top_entry = points(&[
            (30.0, 40.0),
            (30.0, 60.0),
            (170.0, 60.0),
            (170.0, 140.0),
            (150.0, 140.0),
            (150.0, 180.0),
        ]);
        let mut clear = [top_entry.clone()];
        enter_by_frame_sides(&mut Picture {
            cards: &cards,
            frames: &frames,
            lines: &mut clear,
        });
        assert_eq!(clear[0].last(), Some(&Point { x: 120.0, y: 200.0 }));

        let mut crossed = [
            top_entry.clone(),
            points(&[(64.0, 120.0), (84.0, 120.0), (96.0, 120.0)]),
        ];
        enter_by_frame_sides(&mut Picture {
            cards: &cards,
            frames: &frames,
            lines: &mut crossed,
        });
        assert_eq!(crossed[0], top_entry);
    }

    #[test]
    fn a_wall_door_keeps_the_ends_on_the_card_face_centred() {
        let cards = [card(0.0, -28.0), card(120.0, 170.0)];
        let frames = [(
            Rect {
                x: 100.0,
                y: 100.0,
                width: 200.0,
                height: 220.0,
            },
            0,
        )];
        let approach = |x| {
            vec![
                at(30.0, 32.0),
                at(30.0, 70.0),
                at(190.0, 70.0),
                at(190.0, 140.0),
                at(x, 140.0),
                at(x, 170.0),
            ]
        };
        let mut alone = [approach(170.0)];
        enter_by_frame_sides(&mut Picture {
            cards: &cards,
            frames: &frames,
            lines: &mut alone,
        });
        assert_eq!(alone[0].last(), Some(&at(120.0, 200.0)));

        let mut bus = [approach(162.0), vec![at(178.0, 120.0), at(178.0, 170.0)]];
        let before = bus.clone();
        enter_by_frame_sides(&mut Picture {
            cards: &cards,
            frames: &frames,
            lines: &mut bus,
        });
        assert_eq!(bus, before);
    }
}
