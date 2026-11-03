//! A container that arrives with nothing to carry it.
//!
//! A container is a well cut into the picture, and a well does not fade in: it opens.
//! One front leaves the middle of the picture ahead of the wave of cards, as a square
//! that grows. Each container shows where the front has passed, so a card lands on a
//! floor, wherever it stands and however wide the picture is. A thin edge runs with the
//! front and cools as the container lands. The drawing keeps its place and its
//! corners, so the walls of a well stand still as the front passes them.

use std::collections::HashMap;

use archboard_scene::geometry::{Point, Rect};
use archboard_scene::scene::{
    Geometry, Group, Item, Purpose, Role, Shape, Stroke, Token, Transform, Viewport,
};

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
    pub(super) well: Rect,
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

/// How the plain items of a group stand against the picture.
fn placing(group: &Group) -> Transform {
    group.transform.unwrap_or(Transform::translate(0.0, 0.0))
}

/// The box a container shows itself in while a move that was cut short has it.
pub(super) fn under_way(group: &Group) -> Option<Rect> {
    let Item::Viewport(viewport) = group.items.first()? else {
        return None;
    };
    Some(carried(viewport.frame, placing(group)))
}

/// The edge a container wears while a move that was cut short has it: its box, and
/// how solid it stands from 0 to 1.
pub(super) fn worn_edge(group: &Group) -> Option<(Rect, f64)> {
    let Item::Group(edge) = group.items.get(1)? else {
        return None;
    };
    let Item::Shape(shape) = edge.items.first()? else {
        return None;
    };
    let Geometry::Rect { rect, .. } = shape.geometry else {
        return None;
    };
    let solid = shape.stroke.as_ref()?.opacity? / EDGE[0].1;
    Some((carried(rect, placing(group)), solid))
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
        // An unfinished clip already includes room for the drawing. Adding it
        // again makes the tray jump on every interrupted entrance.
        let drawn = cut_short.unwrap_or(Rect {
            x: landed.x - ROOM,
            y: landed.y - ROOM,
            width: landed.width + ROOM * 2.0,
            height: landed.height + ROOM * 2.0,
        });
        let outer = group.outer.unwrap_or(Transform::translate(0.0, 0.0));
        let drawn = carried(drawn, outer);
        let frame = carried(frame, outer);
        match boxes.iter_mut().find(|(id, ..)| *id == group.id) {
            Some((_, whole, _)) => *whole = union(*whole, drawn),
            None => boxes.push((group.id, drawn, frame)),
        }
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
    pub(super) fn at(&self, progress: f64) -> Group {
        let way = self.way;
        let reach = way.front.at(progress);
        let mut group = self.group.clone();
        if reach >= way.far {
            return group;
        }
        let square = way.front.square(reach);
        let Some(area) = meeting(way.whole, square) else {
            group.opacity = Some(0.0);
            return group;
        };
        let span = way.far - way.near;
        let shown = ease_out(phase(reach, way.near, way.near + span * SHOWN_BY));
        group.opacity = Some(group.opacity.unwrap_or(1.0) * shown);
        group.items = vec![Item::Viewport(Viewport {
            frame: area,
            view: area,
            items: std::mem::take(&mut group.items),
        })];
        if self.edged {
            let cooled = (1.0 - phase(reach, way.near + span * COOLS_FROM, way.far)).powi(2);
            let reached = meeting(area, way.well).unwrap_or(area);
            group.items.push(edge(reached, cooled));
        }
        group
    }
}

/// The edge that leads an opening, in a group of its own, so that it is no box of
/// the container's. `solid` says how solid it stands, from 0 to 1.
pub(super) fn edge(area: Rect, solid: f64) -> Item {
    let layer = |(width, most): (f64, f64)| {
        let stroke = Stroke {
            opacity: Some(most * solid),
            ..Stroke::new(Token::DiagramText, width)
        };
        Item::Shape(
            Shape::rect(Purpose::Plate, area, Some(EDGE_CORNER))
                .unfilled()
                .stroked(stroke),
        )
    };
    Item::Group(Group::new(Role::Marks, EDGE.map(layer).to_vec()))
}

#[cfg(test)]
mod tests {
    use archboard_scene::geometry::{Point, Rect};
    use archboard_scene::scene::{Group, Item, Scene, Transform};

    use super::super::ease::carried;
    use super::super::found::found;
    use super::super::testing::{PHASES, card, drawing, rect, region, scene};
    use super::super::{Between, Entrance, Handover};
    use super::{Opening, ways, worn_edge};

    const MIDDLE: Point = Point { x: 200.0, y: 100.0 };

    /// A tall container round the middle of the picture.
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

    /// A wide container round the middle of a picture 400 by 200, with a header, and
    /// a second container far from the middle.
    fn picture() -> Scene {
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

    fn opening_of(picture: &Scene, id: &str, ordinal: usize) -> Opening {
        let groups = found(picture);
        let all = ways(&groups, MIDDLE, (0.0, PHASES.entry.region_span));
        let group = groups
            .iter()
            .find(|group| group.id == id && group.ordinal == ordinal)
            .expect("a group of the container");
        Opening::new(group, all[id])
    }

    #[test]
    fn a_container_opens_out_of_the_middle() {
        let picture = picture();
        let early = opening_of(&picture, "near", 0).at(PHASES.entry.region_span * 0.25);
        let area = shown_box(&early).expect("a box shows it");
        assert!(area.width > 0.0 && area.width < 320.0, "it is on its way");
        assert!(area.x < MIDDLE.x && MIDDLE.x < area.x + area.width);
        assert!(area.y < MIDDLE.y && MIDDLE.y < area.y + area.height);
        assert!(worn_edge(&early).is_some(), "the frame wears the edge");
    }

    #[test]
    fn a_container_lands_as_it_was_drawn() {
        let picture = picture();
        let frame = opening_of(&picture, "near", 0);
        let landed = frame.at(frame.end());
        assert_eq!(shown_box(&landed), None, "nothing cuts it");
        assert_eq!(worn_edge(&landed), None);
    }

    #[test]
    fn a_frame_and_its_header_open_as_one_and_only_the_frame_wears_the_edge() {
        let picture = picture();
        let at = PHASES.entry.region_span * 0.2;
        let (frame, header) = (
            opening_of(&picture, "near", 0),
            opening_of(&picture, "near", 1),
        );
        let boxes = [&frame, &header].map(|opening| shown_box(&opening.at(at)));
        assert!(boxes[0].is_some());
        assert_eq!(boxes[0], boxes[1]);
        assert_eq!(worn_edge(&header.at(at)), None);
    }

    #[test]
    fn the_front_reaches_a_container_far_from_the_middle_last() {
        let picture = picture();
        let (near, far) = (
            opening_of(&picture, "near", 0),
            opening_of(&picture, "far", 0),
        );
        let early = PHASES.entry.region_span * 0.1;
        assert!(shown_box(&near.at(early)).is_some());
        let unseen = far.at(early);
        assert_eq!(unseen.opacity, Some(0.0));
        assert_eq!(worn_edge(&unseen), None);
    }

    #[test]
    fn a_card_near_the_middle_lands_on_a_floor_however_wide_the_picture() {
        // The middle row of a wide picture. A box that kept the picture's shape would
        // reach a card above the middle far later than the front does.
        let picture = picture();
        let frame = opening_of(&picture, "near", 0);
        let begins = PHASES.entry.cards_start + PHASES.entry.cards_start_by * 0.2;
        let area = shown_box(&frame.at(begins)).expect("a box shows it");
        assert!(area.y <= 90.0 && area.y + area.height >= 110.0);
    }

    /// An entrance of the picture after a picture of one tall container.
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
        let wide = picture();
        let entrance = after_a_tall_tray(&wide);
        assert!(entrance.flown().contains("near"));
        assert!(!entrance.flown().contains("far"), "that one opens");
        assert_eq!(entrance.at(entrance.length()), wide.body);
    }

    #[test]
    fn a_container_the_last_picture_drew_starts_at_its_old_size() {
        let wide = picture();
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
        let wide = picture();
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
        assert!((held.width - mid.width).abs() < 1e-6);
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
        let entrance = Entrance::new(&picture(), &PHASES, Some(handover));
        assert!(entrance.keeps_tray());
        assert_eq!(entrance.holder_at(0.0), None);
    }

    /// The picture with its wide container a little wider, as a door in it opens.
    fn with_a_door_open() -> Scene {
        scene(
            vec![
                region("near", rect(40.0, 60.0, 350.0, 80.0)),
                region("far", rect(340.0, 160.0, 50.0, 30.0)),
                card("c", rect(180.0, 90.0, 40.0, 20.0), &["C"]),
                region("near", rect(40.0, 50.0, 60.0, 10.0)),
            ],
            &[],
        )
    }

    /// The opening of the picture as it stood a quarter of the way, and the move that
    /// cut it short.
    fn cut_short() -> (Scene, Between) {
        let picture = picture();
        let entrance = Entrance::new(&picture, &PHASES, None);
        let seen = Scene {
            body: entrance.at(PHASES.entry.region_span * 0.25),
            ..picture
        };
        let move_ = Between::new(&seen, &with_a_door_open(), (0.0, 0.0), &PHASES);
        (seen, move_)
    }

    /// The box that shows a group, where the group stands.
    fn held_box(group: &Group) -> Rect {
        let at = group.transform.unwrap_or(Transform::translate(0.0, 0.0));
        carried(shown_box(group).expect("a box shows it"), at)
    }

    #[test]
    fn a_container_a_move_cut_short_goes_on_opening_from_where_it_stood() {
        let (seen, move_) = cut_short();
        let stood = held_box(drawing(&seen.body, "near")[0]);
        let start = move_.at(0.0);
        assert_eq!(held_box(drawing(&start, "near")[0]), stood);
        let later = move_.at(0.4);
        assert!(held_box(drawing(&later, "near")[0]).width > stood.width);
        assert_eq!(move_.at(move_.length()), with_a_door_open().body);
    }

    #[test]
    fn a_container_a_move_cut_short_takes_its_edge_along_and_lets_it_cool() {
        let (seen, move_) = cut_short();
        let (stood, solid) = worn_edge(drawing(&seen.body, "near")[0]).expect("it wears its edge");
        let edge_at = |progress: f64| {
            let body = move_.at(progress);
            worn_edge(drawing(&body, "near")[0]).expect("it wears its edge")
        };
        let (start, solid_at_start) = edge_at(0.0);
        assert_eq!((start, solid_at_start), (stood, solid), "no step in it");
        let (later, solid_later) = edge_at(0.4);
        assert!(later.width > stood.width, "it runs with the box");
        assert!(solid_later < solid, "it cools");
    }

    #[test]
    fn an_entrance_opens_its_containers_and_ends_on_the_scene_itself() {
        let picture = picture();
        let entrance = Entrance::new(&picture, &PHASES, None);
        let early = entrance.at(0.1);
        assert!(shown_box(drawing(&early, "near")[0]).is_some());
        assert_eq!(entrance.at(entrance.length()), picture.body);
    }

    #[test]
    fn a_container_only_the_next_picture_has_opens_in_a_move() {
        let last = scene(vec![card("c", rect(180.0, 90.0, 40.0, 20.0), &["C"])], &[]);
        let next = picture();
        let move_ = Between::new(&last, &next, (0.0, 0.0), &PHASES);
        let t = PHASES.transition;
        let middle = move_.at(t.enter_start + (1.0 - t.enter_start) * 0.3);
        assert!(shown_box(drawing(&middle, "near")[0]).is_some());
        assert_eq!(move_.at(1.0), next.body);
    }
}
