//! What a move does, held to the scenes a test builds by hand. None of it
//! needs a GPU or a DOM: a move is plain items in and plain items out.

use archboard_scene::geometry::Rect;
use archboard_scene::scene::{
    Clip, ClipId, Definition, Group, Item, Mask, MaskId, PathStep, Purpose, Role, Scene, Shape,
    Transform,
};

use super::ease::{emphasised, phase};
use super::testing::{
    PHASES, card, drawing, label, line, plate, rect, region, route_of, scene, shadow,
};
use super::{Between, entrance, shared_shift};

/// Every run of words a group draws, to any depth.
fn said(items: &[Item]) -> Vec<String> {
    items
        .iter()
        .flat_map(|item| match item {
            Item::Text(text) => vec![text.words.clone()],
            Item::Group(group) => said(&group.items),
            Item::Viewport(viewport) => said(&viewport.items),
            _ => Vec::new(),
        })
        .collect()
}

/// How solid a group is drawn.
fn solid(group: &Group) -> f64 {
    group.opacity.unwrap_or(1.0)
}

/// The shape of a purpose that a line group draws directly.
fn shape_of(group: &Group, purpose: Purpose) -> &Shape {
    group
        .items
        .iter()
        .find_map(|item| match item {
            Item::Shape(shape) if shape.purpose == purpose => Some(shape),
            _ => None,
        })
        .expect("the group draws that shape")
}

/// A board of two cards and a line between them.
fn two_cards(left: Rect, note: &str) -> (Vec<Item>, Vec<(&'static str, Rect)>) {
    let right = rect(200.0, 10.0, 100.0, 50.0);
    let body = vec![
        line("e", &[(110.0, 35.0), (200.0, 35.0)]),
        card("a", left, &["Title", note]),
        card("b", right, &["Other"]),
    ];
    (body, vec![("a", left), ("b", right)])
}

/// A move that keeps two cards, moves one, drops a card and adds another.
fn a_busy_move() -> (Scene, Scene, Between) {
    let (before, nodes) = two_cards(rect(10.0, 10.0, 100.0, 50.0), "Old");
    let from = scene(
        [
            before,
            vec![card("c", rect(10.0, 100.0, 100.0, 50.0), &["Gone"])],
        ]
        .concat(),
        &nodes,
    );
    let (mut after, nodes) = two_cards(rect(30.0, 40.0, 100.0, 50.0), "New");
    after.push(card("d", rect(200.0, 100.0, 100.0, 50.0), &["Fresh"]));
    let to = scene(after, &nodes);
    let between = Between::new(&from, &to, (0.0, 0.0), &PHASES);
    (from, to, between)
}

#[test]
fn a_move_lands_on_the_next_scene() {
    let (_, to, between) = a_busy_move();
    assert_eq!(between.at(1.0), to.body);
}

#[test]
fn a_move_starts_on_the_last_scene() {
    let (from, _, between) = a_busy_move();
    let start = between.at(0.0);
    let a = drawing(&start, "a")[0];
    assert_eq!(
        plate(a),
        rect(10.0, 10.0, 100.0, 50.0),
        "a kept card starts where it was"
    );
    assert_eq!(said(&a.items), ["Title", "Old"], "with the words it had");
    assert_eq!(
        solid(drawing(&start, "c")[0]),
        1.0,
        "a card that goes is still there"
    );
    assert_eq!(
        solid(drawing(&start, "d")[0]),
        0.0,
        "a card that comes is not yet"
    );
    let kept = drawing(&from.body, "e")[0];
    assert_eq!(
        route_of(drawing(&start, "e")[0]),
        route_of(kept),
        "a line starts on its old route"
    );
}

#[test]
fn a_shift_holds_the_shared_cards_still_until_they_have_moved() {
    let (body, nodes) = two_cards(rect(10.0, 10.0, 100.0, 50.0), "Note");
    let from = scene(body.clone(), &nodes);
    let to = scene(body, &nodes);
    let between = Between::new(&from, &to, (5.0, 7.0), &PHASES);

    let back = |items: &[Item]| match items {
        [Item::Group(group)] => group.transform,
        _ => None,
    };
    assert_eq!(
        back(&between.at(0.0)),
        Some(Transform::translate(-5.0, -7.0))
    );
    let halfway = back(&between.at(0.4)).expect("still on its way home");
    assert!(halfway.x > -5.0 && halfway.x < 0.0);
    assert_eq!(back(&between.at(0.9)), None, "home with the cards");
}

#[test]
fn a_repeated_id_pairs_in_order() {
    let before = scene(
        vec![
            region("r", rect(0.0, 0.0, 40.0, 40.0)),
            region("r", rect(100.0, 0.0, 40.0, 40.0)),
        ],
        &[],
    );
    let after = scene(
        vec![
            region("r", rect(10.0, 0.0, 40.0, 40.0)),
            region("r", rect(120.0, 0.0, 40.0, 40.0)),
        ],
        &[],
    );
    let between = Between::new(&before, &after, (0.0, 0.0), &PHASES);
    let halfway = 0.5;
    let moved = emphasised(phase(halfway, 0.06, 0.88));
    let body = between.at(halfway);
    let both = drawing(&body, "r");
    assert_eq!(both.len(), 2, "neither group was lost or doubled");
    assert!(
        (plate(both[0]).x - 10.0 * moved).abs() < 1e-9,
        "the first carries to the first"
    );
    assert!(
        (plate(both[1]).x - (100.0 + 20.0 * moved)).abs() < 1e-9,
        "the second to the second"
    );
}

#[test]
fn a_removed_card_fades_and_shrinks_about_its_box() {
    let gone = rect(10.0, 100.0, 100.0, 50.0);
    let from = scene(vec![card("c", gone, &["Gone"])], &[("c", gone)]);
    let to = scene(Vec::new(), &[]);
    let between = Between::new(&from, &to, (0.0, 0.0), &PHASES);

    let early = between.at(0.1);
    let group = drawing(&early, "c")[0];
    assert!(solid(group) < 1.0 && solid(group) > 0.0);
    let shrink = group.transform.expect("shrunk");
    let scale = shrink.scale.expect("a scale");
    assert!(scale < 1.0 && scale > 0.9);
    let (cx, cy) = (gone.x + gone.width / 2.0, gone.y + gone.height / 2.0);
    assert!((cx * scale + shrink.x - cx).abs() < 1e-9 && (cy * scale + shrink.y - cy).abs() < 1e-9);
    assert_eq!(
        group.pointer,
        Some(archboard_scene::scene::Pointer::None),
        "nobody picks what is leaving"
    );
    assert!(
        drawing(&between.at(0.35), "c").is_empty(),
        "gone by the end of its phase"
    );
}

#[test]
fn an_added_line_draws_on_from_its_start() {
    let from = scene(Vec::new(), &[]);
    let to = scene(
        vec![line("f", &[(0.0, 0.0), (60.0, 0.0), (60.0, 80.0)])],
        &[],
    );
    let between = Between::new(&from, &to, (0.0, 0.0), &PHASES);
    let stroke = |progress: f64| {
        let body = between.at(progress);
        let group = drawing(&body, "f")[0].clone();
        (solid(&group), shape_of(&group, Purpose::Line).clone())
    };

    let (visible, begun) = stroke(0.54);
    assert_eq!(visible, 0.0, "invisible where its phase begins");
    let dash = begun.stroke.as_ref().expect("stroked");
    assert_eq!(
        dash.dash_offset,
        dash.dashes.first().copied(),
        "not a unit of it drawn yet"
    );
    assert!(begun.marker.is_none());
}

#[test]
fn an_added_lines_arrowhead_waits_until_it_is_nearly_drawn() {
    let from = scene(Vec::new(), &[]);
    let to = scene(
        vec![line("f", &[(0.0, 0.0), (60.0, 0.0), (60.0, 80.0)])],
        &[],
    );
    let between = Between::new(&from, &to, (0.0, 0.0), &PHASES);
    let stroke = |progress: f64| {
        let body = between.at(progress);
        let group = drawing(&body, "f")[0].clone();
        (solid(&group), shape_of(&group, Purpose::Line).clone())
    };
    let (_, nearly) = stroke(0.95);
    assert!(
        nearly.marker.is_none(),
        "no arrowhead before it is nearly there"
    );
    let (_, there) = stroke(0.97);
    assert!(
        there.marker.is_some(),
        "the arrowhead appears at arrowheadAt"
    );
    let partly = there.stroke.as_ref().expect("stroked");
    assert!(
        partly.dash_offset.expect("an offset") < partly.dashes[0],
        "still drawing"
    );
}

/// A line whose route gets two legs longer.
fn a_longer_route() -> (Scene, Scene, Between) {
    let short = [(110.0, 35.0), (200.0, 35.0)];
    let long = [(110.0, 40.0), (150.0, 40.0), (150.0, 80.0), (200.0, 80.0)];
    let nodes = [("a", rect(10.0, 10.0, 100.0, 50.0))];
    let from = scene(
        vec![line("e", &short), card("a", nodes[0].1, &["A"])],
        &nodes,
    );
    let to = scene(
        vec![line("e", &long), card("a", nodes[0].1, &["A"])],
        &nodes,
    );
    let between = Between::new(&from, &to, (0.0, 0.0), &PHASES);
    (from, to, between)
}

#[test]
fn a_line_keeps_both_its_routes_at_the_ends_of_its_move() {
    let (from, to, between) = a_longer_route();
    let start = between.at(0.0);
    assert_eq!(
        route_of(drawing(&start, "e")[0]),
        route_of(drawing(&from.body, "e")[0])
    );
    let settled = between.at(0.9);
    assert_eq!(
        route_of(drawing(&settled, "e")[0]),
        route_of(drawing(&to.body, "e")[0])
    );
}

#[test]
fn a_line_between_routes_of_different_lengths_is_a_cubic_for_each_leg() {
    let (_, _, between) = a_longer_route();
    let middle = between.at(0.4);
    let steps = route_of(drawing(&middle, "e")[0]);
    assert!(matches!(steps[0], PathStep::Move { .. }));
    assert_eq!(
        steps.len(),
        4,
        "a move and a cubic for each of the longer route's legs"
    );
    assert!(
        steps[1..]
            .iter()
            .all(|step| matches!(step, PathStep::Cubic { .. }))
    );
}

#[test]
fn the_ports_of_a_line_in_flight_wait_for_the_landing() {
    let nodes = [("a", rect(10.0, 10.0, 100.0, 50.0))];
    let from = scene(
        vec![
            line("e", &[(110.0, 35.0), (200.0, 35.0)]),
            card("a", nodes[0].1, &["A"]),
        ],
        &nodes,
    );
    let to = scene(
        vec![
            line("e", &[(110.0, 40.0), (150.0, 80.0), (200.0, 80.0)]),
            card("a", nodes[0].1, &["A"]),
        ],
        &nodes,
    );
    let between = Between::new(&from, &to, (0.0, 0.0), &PHASES);
    let has_port = |items: &[Item]| {
        drawing(items, "e")[0]
            .items
            .iter()
            .any(|item| matches!(item, Item::Group(group) if matches!(group.role, Role::Port)))
    };
    assert!(
        !has_port(&between.at(0.4)),
        "the ports wait for the cards to land"
    );
    assert!(has_port(&between.at(1.0)));
}

#[test]
fn a_kept_cards_box_follows_the_move_curve() {
    let before = rect(10.0, 10.0, 100.0, 50.0);
    let after = rect(30.0, 40.0, 140.0, 50.0);
    let from = scene(vec![card("a", before, &["Title"])], &[("a", before)]);
    let to = scene(vec![card("a", after, &["Title"])], &[("a", after)]);
    let between = Between::new(&from, &to, (0.0, 0.0), &PHASES);

    let body = between.at(0.4);
    let moved = emphasised(phase(0.4, 0.06, 0.88));
    let group = drawing(&body, "a")[0];
    let here = plate(group);
    assert!((here.x - (10.0 + 20.0 * moved)).abs() < 1e-9);
    assert!((here.y - (10.0 + 30.0 * moved)).abs() < 1e-9);
    assert!((here.width - (100.0 + 40.0 * moved)).abs() < 1e-9);

    let clip = group
        .items
        .iter()
        .find_map(|item| match item {
            Item::Viewport(viewport) => Some(viewport),
            _ => None,
        })
        .expect("content is clipped while the frame changes size");
    assert_eq!(
        clip.frame, clip.view,
        "a clip to the frame draws the content where it is"
    );
    assert_eq!(clip.frame, here);
}

#[test]
fn a_title_stays_while_a_changed_note_swaps_through_the_move() {
    let frame = rect(10.0, 10.0, 100.0, 50.0);
    let from = scene(vec![card("a", frame, &["Title", "Old"])], &[("a", frame)]);
    let to = scene(vec![card("a", frame, &["Title", "New"])], &[("a", frame)]);
    let between = Between::new(&from, &to, (0.0, 0.0), &PHASES);
    let words_at = |progress: f64| said(&drawing(&between.at(progress), "a")[0].items);

    assert_eq!(words_at(0.0), ["Title", "Old"]);
    assert_eq!(
        words_at(0.56),
        ["Title", "New"],
        "one after the other, never both"
    );
    assert_eq!(words_at(0.9), ["Title", "New"]);
}

#[test]
fn what_a_move_parks_waits_for_the_landing() {
    let frame = rect(10.0, 10.0, 100.0, 50.0);
    let body = vec![shadow(), card("a", frame, &["Title"])];
    let from = scene(body.clone(), &[("a", frame)]);
    let to = scene(body, &[("a", frame)]);
    let between = Between::new(&from, &to, (0.0, 0.0), &PHASES);
    let has_shadow = |items: &[Item]| {
        items
            .iter()
            .any(|item| matches!(item, Item::Group(group) if matches!(group.role, Role::Shadow(_))))
    };
    assert!(!has_shadow(&between.at(0.5)));
    assert!(has_shadow(&between.at(1.0)));
}

#[test]
fn the_last_scenes_masks_and_clips_keep_their_own_names() {
    let mask = |bounds: Rect| {
        Definition::Mask(Mask {
            id: MaskId { line: "e".into() },
            bounds,
            shapes: Vec::new(),
        })
    };
    let clip = Definition::Clip(Clip {
        id: ClipId { card: "a".into() },
        outline: Vec::new(),
    });
    let mut from = scene(Vec::new(), &[]);
    from.definitions = vec![mask(rect(0.0, 0.0, 1.0, 1.0)), clip.clone()];
    let mut to = scene(Vec::new(), &[]);
    to.definitions = vec![mask(rect(0.0, 0.0, 2.0, 2.0)), clip];
    let defined = Between::new(&from, &to, (0.0, 0.0), &PHASES).definitions();

    let masks: Vec<&MaskId> = defined
        .iter()
        .filter_map(|definition| match definition {
            Definition::Mask(mask) => Some(&mask.id),
            _ => None,
        })
        .collect();
    assert_eq!(masks.len(), 2);
    assert_ne!(masks[0], masks[1], "a line both scenes mask has two masks");
    assert_eq!(masks[0].line, "e", "the next scene's keep their names");
    let clips = defined
        .iter()
        .filter(|definition| matches!(definition, Definition::Clip(_)))
        .count();
    assert_eq!(clips, 2);
}

#[test]
fn the_same_move_is_the_same_frames() {
    let (body, nodes) = two_cards(rect(10.0, 10.0, 100.0, 50.0), "Old");
    let from = scene(body, &nodes);
    let (body, nodes) = two_cards(rect(40.0, 30.0, 100.0, 50.0), "New");
    let to = scene(body, &nodes);
    let one = Between::new(&from, &to, shared_shift(&from, &to), &PHASES);
    let other = Between::new(&from, &to, shared_shift(&from, &to), &PHASES);
    for progress in [0.0, 0.13, 0.5, 0.77, 1.0] {
        assert_eq!(one.at(progress), other.at(progress));
        assert_eq!(one.at(progress), one.at(progress));
    }
}

#[test]
fn the_shift_is_nothing_when_no_card_is_shared_and_the_mean_when_some_are() {
    let apart = scene(Vec::new(), &[("a", rect(0.0, 0.0, 10.0, 10.0))]);
    let other = scene(Vec::new(), &[("b", rect(50.0, 50.0, 10.0, 10.0))]);
    assert_eq!(shared_shift(&apart, &other), (0.0, 0.0));

    let moved = scene(
        Vec::new(),
        &[
            ("a", rect(10.0, 20.0, 10.0, 10.0)),
            ("b", rect(50.0, 50.0, 10.0, 10.0)),
        ],
    );
    let was = scene(
        Vec::new(),
        &[
            ("a", rect(0.0, 0.0, 10.0, 10.0)),
            ("b", rect(50.0, 50.0, 10.0, 10.0)),
        ],
    );
    assert_eq!(shared_shift(&was, &moved), (-5.0, -10.0));
}

/// A board of three cards one under another, a line from the first to the
/// second, the line's label, and a shadow that belongs to no subject.
fn tall_board() -> Scene {
    let body = vec![
        shadow(),
        card("bottom", rect(10.0, 210.0, 80.0, 40.0), &["C"]),
        card("top", rect(10.0, 10.0, 80.0, 40.0), &["A"]),
        card("middle", rect(10.0, 110.0, 80.0, 40.0), &["B"]),
        line("e", &[(50.0, 50.0), (50.0, 110.0)]),
        label("e", rect(40.0, 70.0, 30.0, 14.0), "calls"),
    ];
    scene(body, &[])
}

#[test]
fn an_entrance_runs_down_the_board() {
    let board = tall_board();
    let early = entrance(&board, 0.2, &PHASES);
    let of = |name: &str| solid(drawing(&early, name)[0]);
    assert!(of("top") > 0.0, "the first card is on its way");
    assert_eq!(of("middle"), 0.0);
    assert_eq!(of("bottom"), 0.0, "the wave has not reached the last");
    let ground = early
        .iter()
        .find_map(|item| match item {
            Item::Group(group) if matches!(group.role, Role::Shadow(_)) => Some(group),
            _ => None,
        })
        .expect("the shadow is drawn");
    assert!(
        solid(ground) > 0.0 && solid(ground) < 1.0,
        "what belongs to no subject fades in with the frames"
    );
    assert_eq!(
        entrance(&board, 1.0, &PHASES),
        board.body,
        "it lands on the scene itself"
    );
}

#[test]
fn an_entrance_draws_the_lines_after_the_cards_and_names_them_last() {
    let board = tall_board();
    let lines = |progress: f64| {
        let body = entrance(&board, progress, &PHASES);
        drawing(&body, "e")
            .iter()
            .map(|group| solid(group))
            .collect::<Vec<_>>()
    };
    assert_eq!(lines(0.2), [0.0, 0.0], "no line before the cards");
    let [line, label] = lines(0.5)[..] else {
        panic!("a line and its label")
    };
    assert!(line > 0.0, "the line has begun");
    assert_eq!(label, 0.0, "its label comes last, all together");
}

#[test]
fn an_in_between_draws_with_balanced_layers() {
    use crate::canvas::Count;
    use crate::draw::{Picture, draw};
    use crate::outlines::Outlines;
    use crate::palette::{Palette, Theme};
    use crate::presentation::Presentation;

    let (body, nodes) = two_cards(rect(10.0, 10.0, 100.0, 50.0), "Old");
    let from = scene(body, &nodes);
    let (body, nodes) = two_cards(rect(40.0, 30.0, 140.0, 50.0), "New");
    let to = scene(body, &nodes);
    let between = Between::new(&from, &to, (0.0, 0.0), &PHASES);
    let mut halfway = to;
    halfway.body = between.at(0.5);
    halfway.definitions = between.definitions();
    let mut count = Count::default();
    draw(
        &mut count,
        &Picture::new(halfway),
        (400.0, 300.0),
        &Palette::of(Theme::Light),
        &mut Outlines::default(),
        &Presentation::default(),
    );
    assert!(count.fills > 0 && count.layers > 0);
    assert_eq!(count.open, 0);
}
