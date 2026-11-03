//! What an entrance brings in when, so that nothing stands before what holds it.

use archboard_scene::scene::{Group, Item, Purpose, Role, Scene, Shape, Subject, SubjectKind};

use super::testing::{PHASES, card, drawing, label, line, rect, scene, shadow};
use super::tests::solid;
use super::{Entrance, Handover};

/// A board of three cards one under another, a line from the first to the
/// second, the line's label, and the shadow of a flow's start.
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

/// The shadows at the top of a picture that is one group.
fn shadows_of(body: &[Item]) -> Vec<&Group> {
    let Some(Item::Group(picture)) = body.first() else {
        panic!("the picture is one group");
    };
    picture
        .items
        .iter()
        .filter_map(|item| match item {
            Item::Group(group) if matches!(group.role, Role::Shadow(_)) => Some(group),
            _ => None,
        })
        .collect()
}

/// A picture whose cards cast shadows, and whose line casts one too.
fn cast_board() -> Scene {
    let cast = |owner: &str| {
        let Item::Group(group) = shadow() else {
            unreachable!("a shadow is a group");
        };
        Item::Group(group.standing_with(vec![owner.to_owned()]))
    };
    scene(
        vec![Item::Group(Group::new(
            Role::Move,
            vec![
                cast("top"),
                cast("e"),
                cast("bottom"),
                card("top", rect(10.0, 10.0, 80.0, 40.0), &["A"]),
                card("bottom", rect(10.0, 210.0, 80.0, 40.0), &["C"]),
                line("e", &[(50.0, 50.0), (50.0, 110.0)]),
            ],
        ))],
        &[],
    )
}

#[test]
fn a_shadow_inside_the_picture_waits_for_what_casts_it() {
    let early = Entrance::new(&cast_board(), &PHASES, None).at(0.1);
    let shadows = shadows_of(&early);
    assert_eq!(shadows.len(), 3);
    assert_eq!(solid(shadows[0]), 0.0, "the last card is not there yet");
    assert_eq!(solid(shadows[1]), 0.0, "its line's words come later");
}

#[test]
fn a_card_and_its_shadow_bloom_out_as_one() {
    let early = Entrance::new(&cast_board(), &PHASES, None).at(0.2);
    let shadow = shadows_of(&early)[2];
    let card = drawing(&early, "bottom")[0];
    assert!(solid(card) > 0.0);
    assert_eq!(shadow.transform, card.transform);
    assert_eq!(solid(shadow), solid(card));
}

#[test]
fn an_entrance_opens_from_the_middle_of_the_board() {
    let board = tall_board();
    let early = Entrance::new(&board, &PHASES, None).at(0.1);
    let of = |name: &str| solid(drawing(&early, name)[0]);
    assert!(
        of("middle") > 0.0,
        "the card nearest the middle is on its way"
    );
    assert_eq!(of("top"), 0.0, "the wave has not reached the farthest");
    let entrance = Entrance::new(&board, &PHASES, None);
    assert_eq!(
        entrance.at(entrance.length()),
        board.body,
        "it lands on the scene itself"
    );
}

#[test]
fn a_card_comes_out_of_the_middle_small_and_lands_where_it_is_drawn() {
    let early = Entrance::new(&tall_board(), &PHASES, None).at(0.12);
    let moved = drawing(&early, "middle")[0].transform.expect("it is moved");
    assert!(moved.scale.is_some_and(|scale| scale < 1.0));
    let (x, _) = (50.0 * moved.scale.unwrap_or(1.0) + moved.x, 0.0);
    assert!(x > 50.0, "it starts nearer the middle than it lands");
}

#[test]
fn a_card_the_last_picture_drew_flies_from_where_it_stood() {
    let was = rect(300.0, 200.0, 80.0, 40.0);
    let last = scene(vec![card("middle", was, &["B"])], &[]);
    let board = tall_board();
    let handover = Handover {
        last: &last,
        shown: 0.5,
    };
    let entrance = Entrance::new(&board, &PHASES, Some(handover));
    assert!(entrance.flown().contains("middle"));
    let start = entrance.at(0.0);
    let flying = drawing(&start, "middle")[0];
    let moved = flying.transform.expect("it stands where it stood");
    assert_eq!((10.0 + moved.x, 110.0 + moved.y), (was.x, was.y));
    assert_eq!(solid(flying), 0.5, "it shows as the last picture does");
    assert_eq!(solid(drawing(&start, "top")[0]), 0.0, "the rest bloom");
}

#[test]
fn no_line_leaves_or_reaches_a_card_before_the_card_shows_in_full() {
    let board = tall_board();
    let entrance = Entrance::new(&board, &PHASES, None);
    let drawn_by = |at: &f64| {
        let body = entrance.at(*at);
        solid(drawing(&body, "e")[0]) > 0.0
    };
    let begins = (0..400)
        .map(|step| f64::from(step) * 0.01)
        .find(drawn_by)
        .expect("it is drawn");
    let body = entrance.at(begins);
    assert_eq!(solid(drawing(&body, "top")[0]), 1.0, "it leaves a card");
    assert_eq!(solid(drawing(&body, "middle")[0]), 1.0, "it reaches one");
}

#[test]
fn an_entrance_draws_the_lines_after_the_cards_and_each_label_as_its_line_reaches_it() {
    let board = tall_board();
    let lines = |progress: f64| {
        let body = Entrance::new(&board, &PHASES, None).at(progress);
        drawing(&body, "e")
            .iter()
            .map(|group| solid(group))
            .collect::<Vec<_>>()
    };
    assert_eq!(lines(0.5), [0.0, 0.0], "no line before the cards");
    let [line, label] = lines(0.7)[..] else {
        panic!("a line and its label")
    };
    assert!(line > 0.0, "the line has begun");
    assert_eq!(label, 0.0, "the spark has not reached its label");
    assert!(lines(1.0)[1] > 0.0, "it arrives as the spark reaches it");
}

/// A participant's column: its bar stands in the middle of the picture, and its card at the top.
fn column() -> Scene {
    let bar = Shape::rect(Purpose::Halo, rect(195.0, 80.0, 10.0, 80.0), None);
    let lifeline = Group::new(Role::Lifeline, vec![Item::Shape(bar)]).drawing(Subject {
        kind: SubjectKind::Node,
        id: "p".to_owned(),
        standing: None,
    });
    let body = vec![
        Item::Group(lifeline),
        card("near", rect(160.0, 100.0, 20.0, 20.0), &[]),
        card("p", rect(160.0, 10.0, 80.0, 40.0), &["P"]),
    ];
    scene(body, &[])
}

#[test]
fn a_lifeline_and_its_bars_arrive_with_the_card_at_their_head() {
    let board = column();
    let entrance = Entrance::new(&board, &PHASES, None);
    let visible = (0..=100).map(|step| {
        let body = entrance.at(f64::from(step) * 0.01);
        let groups = drawing(&body, "p");
        (solid(groups[0]), solid(groups[1]))
    });
    for (lifeline, head) in visible {
        assert_eq!(lifeline, head, "the column shows as its card does");
    }
}

#[test]
fn the_shadow_of_a_flows_start_waits_for_the_start() {
    let early = Entrance::new(&tall_board(), &PHASES, None).at(0.2);
    let shadow = early
        .iter()
        .find_map(|item| match item {
            Item::Group(group) if matches!(group.role, Role::Shadow(_)) => Some(group),
            _ => None,
        })
        .expect("the shadow is drawn");
    assert_eq!(solid(shadow), 0.0, "the last cards are not there yet");
}
