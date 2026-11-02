//! A container that arrives with nothing to carry it.
//!
//! A container is a well cut into the board, and a well does not fade in: it opens.
//! One front leaves the middle of the picture ahead of the wave of cards, as a square
//! that grows. Each container shows where the front has passed, so a card lands on a
//! floor, wherever it stands and however wide the board is. A thin edge runs with the
//! front and cools as the container lands. The drawing keeps its place and its
//! corners, so the walls of a well stand still as the front passes them.

use std::collections::HashMap;

use archboard_scene::geometry::{Point, Rect};
use archboard_scene::scene::{Group, Item, Purpose, Shape, Stroke, Token, Transform, Viewport};

use super::ease::{carried, ease_out, phase};
use super::found::Found;
use crate::timing::Curve;

/// The curve of the front: it leaves the wave of cards behind early and settles
/// slowly, so that nothing is seen to stop.
pub(super) const OPENS: Curve = Curve(0.3, 0.0, 0.1, 1.0);

/// How far past its box a container's drawing can reach.
const ROOM: f64 = 3.0;

/// How far through its opening a container shows in full.
const SHOWN_BY: f64 = 0.3;

/// Where the edge starts to cool, as a share of the opening.
const COOLS_FROM: f64 = 0.45;

/// The layers of the edge: how wide each is, and how solid at its brightest.
const EDGE: [(f64, f64); 2] = [(6.0, 0.06), (1.2, 0.4)];

/// The corners of the edge.
const EDGE_CORNER: f64 = 6.0;

/// The square that opens the containers of a picture.
#[derive(Clone, Copy, Debug, PartialEq)]
struct Front {
    middle: Point,
    /// How far from the middle it ends.
    reach: f64,
    start: f64,
    end: f64,
}

impl Front {
    /// How far from the middle the front stands at a moment of the move.
    fn at(&self, progress: f64) -> f64 {
        self.reach * OPENS.at(phase(progress, self.start, self.end))
    }

    /// The square at a distance from the middle.
    fn square(&self, reach: f64) -> Rect {
        Rect {
            x: self.middle.x - reach,
            y: self.middle.y - reach,
            width: reach * 2.0,
            height: reach * 2.0,
        }
    }
}

/// How one container opens.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct Way {
    /// All that the container draws.
    pub(super) whole: Rect,
    /// The well, where the edge lands: the tab stands above it.
    well: Rect,
    front: Front,
    /// How far the front goes before it reaches the container.
    near: f64,
    /// How far the front goes before it has passed all of the container.
    far: f64,
}

impl Way {
    /// Where the front finishes.
    pub(super) fn end(&self) -> f64 {
        self.front.end
    }
}

/// The two boxes in one.
fn union(a: Rect, b: Rect) -> Rect {
    let (x, y) = (a.x.min(b.x), a.y.min(b.y));
    Rect {
        x,
        y,
        width: (a.x + a.width).max(b.x + b.width) - x,
        height: (a.y + a.height).max(b.y + b.height) - y,
    }
}

/// What two boxes share. A box of no size has nothing to share.
fn meeting(a: Rect, b: Rect) -> Option<Rect> {
    let (x, y) = (a.x.max(b.x), a.y.max(b.y));
    let width = (a.x + a.width).min(b.x + b.width) - x;
    let height = (a.y + a.height).min(b.y + b.height) - y;
    (width > 0.0 && height > 0.0).then_some(Rect {
        x,
        y,
        width,
        height,
    })
}

/// How far a square about a point goes before it reaches a box, and before it has
/// passed all of it.
fn distances(rect: Rect, middle: Point) -> (f64, f64) {
    let (right, foot) = (rect.x + rect.width, rect.y + rect.height);
    let near_x = (rect.x - middle.x).max(middle.x - right).max(0.0);
    let near_y = (rect.y - middle.y).max(middle.y - foot).max(0.0);
    let far_x = (rect.x - middle.x).abs().max((right - middle.x).abs());
    let far_y = (rect.y - middle.y).abs().max((foot - middle.y).abs());
    (near_x.max(near_y), far_x.max(far_y))
}

/// The box a container shows itself in while a move that was cut short has it.
fn under_way(group: &Group) -> Option<Rect> {
    let Item::Viewport(viewport) = group.items.first()? else {
        return None;
    };
    let placed = group.transform.unwrap_or(Transform::translate(0.0, 0.0));
    Some(carried(viewport.frame, placed))
}

/// The containers among some groups: each one's id, all that it draws, and its well.
pub(super) fn containers<'a>(groups: &[Found<'a>]) -> Vec<(&'a str, Rect, Rect)> {
    let mut boxes: Vec<(&str, Rect, Rect)> = Vec::new();
    for group in groups.iter().filter(|group| group.is_region()) {
        let cut_short = under_way(group.group);
        let Some(frame) = cut_short.or(group.frame) else {
            continue;
        };
        let landed = group.atlas.map_or(frame, |atlas| union(atlas, frame));
        let drawn = cut_short.unwrap_or(landed);
        match boxes.iter_mut().find(|(id, ..)| *id == group.id) {
            Some((_, whole, _)) => *whole = union(*whole, drawn),
            None => boxes.push((group.id, drawn, frame)),
        }
    }
    for (_, whole, _) in &mut boxes {
        *whole = Rect {
            x: whole.x - ROOM,
            y: whole.y - ROOM,
            width: whole.width + ROOM * 2.0,
            height: whole.height + ROOM * 2.0,
        };
    }
    boxes
}

/// How the containers among some groups open, by id: one front out of `middle`
/// between two points of the move, which ends as it passes the last of them. A
/// container's frame and its header open as one.
pub(super) fn ways<'a>(
    groups: &[Found<'a>],
    middle: Point,
    (start, end): (f64, f64),
) -> HashMap<&'a str, Way> {
    let boxes = containers(groups);
    let reach = boxes
        .iter()
        .map(|&(_, whole, _)| distances(whole, middle).1)
        .fold(0.0, f64::max);
    let front = Front {
        middle,
        reach,
        start,
        end,
    };
    boxes
        .into_iter()
        .map(|(id, whole, well)| {
            let (near, far) = distances(whole, middle);
            let way = Way {
                whole,
                well,
                front,
                near,
                far,
            };
            (id, way)
        })
        .collect()
}

/// One group of a container, on its way open.
#[derive(Clone, Debug)]
pub(super) struct Opening {
    group: Group,
    way: Way,
    /// Whether this group wears the edge: the frame does, and its header does not.
    edged: bool,
}

impl Opening {
    /// A group of a container, opening.
    pub(super) fn new(found: &Found<'_>, way: Way) -> Opening {
        Opening {
            group: found.group.clone(),
            way,
            edged: found.ordinal == 0,
        }
    }

    /// Where the container finishes opening.
    pub(super) fn end(&self) -> f64 {
        self.way.end()
    }

    /// The container at a moment of the move.
    pub(super) fn at(&self, progress: f64) -> Vec<Item> {
        let way = self.way;
        let reach = way.front.at(progress);
        if reach >= way.far {
            return vec![Item::Group(self.group.clone())];
        }
        let square = way.front.square(reach);
        let mut group = self.group.clone();
        let Some(area) = meeting(way.whole, square) else {
            group.opacity = Some(0.0);
            return vec![Item::Group(group)];
        };
        let span = way.far - way.near;
        let shown = ease_out(phase(reach, way.near, way.near + span * SHOWN_BY));
        group.opacity = Some(group.opacity.unwrap_or(1.0) * shown);
        group.items = vec![Item::Viewport(Viewport {
            frame: area,
            view: area,
            items: std::mem::take(&mut group.items),
        })];
        let mut items = vec![Item::Group(group)];
        if self.edged {
            let cooled = (1.0 - phase(reach, way.near + span * COOLS_FROM, way.far)).powi(2);
            let reached = meeting(area, way.well).unwrap_or(area);
            items.extend(EDGE.map(|layer| edge(reached, layer, shown * cooled)));
        }
        items
    }
}

/// One layer of the edge that leads an opening.
fn edge(area: Rect, (width, solid): (f64, f64), shown: f64) -> Item {
    let stroke = Stroke {
        opacity: Some(solid * shown),
        ..Stroke::new(Token::DiagramText, width)
    };
    Item::Shape(
        Shape::rect(Purpose::Plate, area, Some(EDGE_CORNER))
            .unfilled()
            .stroked(stroke),
    )
}

#[cfg(test)]
mod tests {
    use archboard_scene::geometry::{Point, Rect};
    use archboard_scene::scene::{Group, Item, Scene};

    use super::super::found::found;
    use super::super::testing::{PHASES, card, drawing, rect, region, scene};
    use super::super::{Between, Entrance, Handover};
    use super::{Opening, ways};

    const MIDDLE: Point = Point { x: 200.0, y: 100.0 };

    /// A tall container round the middle of the board.
    const TALL: Rect = Rect {
        x: 170.0,
        y: 20.0,
        width: 60.0,
        height: 160.0,
    };

    /// What box shows a group, when one does.
    fn shown_box(group: &Group) -> Option<Rect> {
        group.items.iter().find_map(|item| match item {
            Item::Viewport(viewport) => Some(viewport.frame),
            _ => None,
        })
    }

    /// A wide container round the middle of a board 400 by 200, with a header, and
    /// a second container far from the middle.
    fn board() -> Scene {
        scene(
            vec![
                region("near", rect(40.0, 60.0, 320.0, 80.0)),
                region("far", rect(340.0, 160.0, 50.0, 30.0)),
                card("c", rect(180.0, 90.0, 40.0, 20.0), &["C"]),
                region("near", rect(40.0, 50.0, 60.0, 10.0)),
            ],
            &[],
        )
    }

    fn opening_of(board: &Scene, id: &str, ordinal: usize) -> Opening {
        let groups = found(board);
        let all = ways(&groups, MIDDLE, (0.0, PHASES.entry.region_span));
        let group = groups
            .iter()
            .find(|group| group.id == id && group.ordinal == ordinal)
            .expect("a group of the container");
        Opening::new(group, all[id])
    }

    fn first_group(items: &[Item]) -> &Group {
        let Some(Item::Group(group)) = items.first() else {
            panic!("the container comes first")
        };
        group
    }

    #[test]
    fn a_container_opens_out_of_the_middle() {
        let board = board();
        let early = opening_of(&board, "near", 0).at(PHASES.entry.region_span * 0.25);
        let area = shown_box(first_group(&early)).expect("a box shows it");
        assert!(area.width > 0.0 && area.width < 320.0, "it is on its way");
        assert!(area.x < MIDDLE.x && MIDDLE.x < area.x + area.width);
        assert!(area.y < MIDDLE.y && MIDDLE.y < area.y + area.height);
        assert_eq!(early.len(), 3, "the frame wears the edge");
    }

    #[test]
    fn a_container_lands_as_it_was_drawn() {
        let board = board();
        let frame = opening_of(&board, "near", 0);
        let landed = frame.at(frame.end());
        assert_eq!(landed.len(), 1);
        assert_eq!(shown_box(first_group(&landed)), None, "nothing cuts it");
    }

    #[test]
    fn a_frame_and_its_header_open_as_one_and_only_the_frame_wears_the_edge() {
        let board = board();
        let at = PHASES.entry.region_span * 0.2;
        let (frame, header) = (opening_of(&board, "near", 0), opening_of(&board, "near", 1));
        let boxes = [&frame, &header].map(|opening| shown_box(first_group(&opening.at(at))));
        assert!(boxes[0].is_some());
        assert_eq!(boxes[0], boxes[1]);
        assert_eq!(header.at(at).len(), 1);
    }

    #[test]
    fn the_front_reaches_a_container_far_from_the_middle_last() {
        let board = board();
        let (near, far) = (opening_of(&board, "near", 0), opening_of(&board, "far", 0));
        let early = PHASES.entry.region_span * 0.1;
        assert!(shown_box(first_group(&near.at(early))).is_some());
        let unseen = far.at(early);
        assert_eq!(unseen.len(), 1);
        assert_eq!(first_group(&unseen).opacity, Some(0.0));
    }

    #[test]
    fn a_card_near_the_middle_lands_on_a_floor_however_wide_the_board() {
        // The middle row of a wide board. A box that kept the board's shape would
        // reach a card above the middle far later than the front does.
        let board = board();
        let frame = opening_of(&board, "near", 0);
        let begins = PHASES.entry.cards_start + PHASES.entry.cards_start_by * 0.2;
        let area = shown_box(first_group(&frame.at(begins))).expect("a box shows it");
        assert!(area.y <= 90.0 && area.y + area.height >= 110.0);
    }

    /// An entrance of the board after a picture of one tall container.
    fn after_a_tall_tray(wide: &Scene) -> Entrance {
        let tall = scene(vec![region("near", TALL)], &[]);
        let handover = Handover {
            last: &tall,
            shown: 1.0,
        };
        Entrance::new(wide, &PHASES, Some(handover))
    }

    #[test]
    fn a_container_the_last_picture_drew_flies_over_and_lands_as_it_was_drawn() {
        let wide = board();
        let entrance = after_a_tall_tray(&wide);
        assert!(entrance.flown().contains("near"));
        assert!(!entrance.flown().contains("far"), "that one opens");
        assert_eq!(entrance.at(entrance.length()), wide.body);
    }

    #[test]
    fn a_container_the_last_picture_drew_starts_at_its_old_size() {
        let wide = board();
        let entrance = after_a_tall_tray(&wide);
        let start = entrance.at(0.0);
        let held = shown_box(drawing(&start, "near")[0]).expect("a box shows it");
        assert!((held.width - (TALL.width + 6.0)).abs() < 1e-6);
        assert!((held.height - (TALL.height + 6.0)).abs() < 1e-6);
        assert_eq!(
            entrance.holder_at(0.0),
            Some(rect(167.0, 17.0, 66.0, 166.0)),
            "the last picture stays in it"
        );
    }

    #[test]
    fn a_second_change_takes_the_tray_from_where_the_first_had_it() {
        let tall = scene(vec![region("near", TALL)], &[]);
        let wide = board();
        let first = after_a_tall_tray(&wide);
        let mid = first.holder_at(0.2).expect("the tray stays on");
        let cut_short = Scene {
            body: first.at(0.2),
            ..wide
        };
        let handover = Handover {
            last: &cut_short,
            shown: 1.0,
        };
        let second = Entrance::new(&tall, &PHASES, Some(handover));
        let start = second.at(0.0);
        let held = shown_box(drawing(&start, "near")[0]).expect("a box shows it");
        assert!((held.width - (mid.width + 6.0)).abs() < 1.0);
    }

    #[test]
    fn a_picture_with_a_card_outside_the_tray_does_not_leave_inside_it() {
        let last = scene(
            vec![
                region("near", TALL),
                card("out", rect(300.0, 20.0, 40.0, 20.0), &["O"]),
            ],
            &[],
        );
        let handover = Handover {
            last: &last,
            shown: 1.0,
        };
        let entrance = Entrance::new(&board(), &PHASES, Some(handover));
        assert!(entrance.keeps_tray());
        assert_eq!(entrance.holder_at(0.0), None);
    }

    #[test]
    fn an_entrance_opens_its_containers_and_ends_on_the_scene_itself() {
        let board = board();
        let entrance = Entrance::new(&board, &PHASES, None);
        let early = entrance.at(0.1);
        assert!(shown_box(drawing(&early, "near")[0]).is_some());
        assert_eq!(entrance.at(entrance.length()), board.body);
    }

    #[test]
    fn a_container_only_the_next_picture_has_opens_in_a_move() {
        let last = scene(vec![card("c", rect(180.0, 90.0, 40.0, 20.0), &["C"])], &[]);
        let next = board();
        let move_ = Between::new(&last, &next, (0.0, 0.0), &PHASES);
        let t = PHASES.transition;
        let middle = move_.at(t.enter_start + (1.0 - t.enter_start) * 0.3);
        assert!(shown_box(drawing(&middle, "near")[0]).is_some());
        assert_eq!(move_.at(1.0), next.body);
    }
}
