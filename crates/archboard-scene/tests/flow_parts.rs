//! Flow part measures: each part a flow layout places is measured where the
//! painter draws it from, so the layout and the painter agree without sharing a
//! size. Each test states the agreement its measure exists for.

use archboard_scene::geometry::Point;
use archboard_scene::request::MessageKind;
use archboard_scene::{
    CardWords, ColumnLimits, HeadCards, activation_span, message_ends, message_plate, self_loop,
    sequence_cards,
};

/// A sequence card's words.
fn card<'a>(name: &'a str, responsibility: Option<&'a str>, drills: bool) -> CardWords<'a> {
    CardWords {
        name,
        responsibility,
        path: None,
        tags: &[],
        drills,
        door: false,
        toggle: None,
    }
}

/// A card's chrome across: its padding either side, its chip and the gap after it.
const CARD_CHROME: f64 = 13.0 * 2.0 + 24.0 + 10.0;

/// What a reserving service is responsible for: three lines or so in a column.
const RESERVES: &str =
    "Reserves stock for every order line and releases what an order no longer holds";

/// A plain card and a card with a responsibility that opens another picture,
/// measured together in the layout's usual limits.
fn two_cards() -> HeadCards {
    sequence_cards(
        &[
            card("Checkout API", None, false),
            card("Inventory service", Some(RESERVES), true),
        ],
        ColumnLimits {
            least: 112.0,
            most: 192.0,
            floor: 0.0,
        },
    )
}

#[test]
fn a_card_holds_its_whole_responsibility_inside_its_text_run() {
    let heads = two_cards();
    assert!((112.0..=192.0).contains(&heads.width));
    let notes = &heads.cards[1].notes;
    assert!(notes.len() > 1);
    for line in notes {
        assert!(
            line.width + CARD_CHROME <= heads.width,
            "{} overruns",
            line.text
        );
    }
    let joined: Vec<&str> = notes.iter().map(|line| line.text.as_str()).collect();
    assert_eq!(joined.join(" "), RESERVES);
}

#[test]
fn a_card_grows_a_note_line_at_a_time_and_keeps_its_mark_beside_its_name() {
    let heads = two_cards();
    let [plain, noted] = heads.cards.as_slice() else {
        panic!("one card each");
    };
    assert_eq!((plain.notes.len(), plain.height), (0, 46.0));
    // One line of a note is 9.5 high at a 1.35 line height.
    let extra = noted.notes.len() as f64 - 1.0;
    assert!((noted.height - (58.0 + extra * 12.825)).abs() < 1e-9);
    assert_eq!(plain.title_room, heads.width - CARD_CHROME);
    assert_eq!(noted.title_room, heads.width - CARD_CHROME - 21.0);
    // The lifeline starts clear of the card's shadow.
    assert_eq!(heads.lifeline_drop, 13.0);
}

#[test]
fn a_long_name_steps_its_title_down_before_it_widens_every_column() {
    let long = "Fulfilment orchestration coordinator";
    let heads = sequence_cards(
        &[card(long, None, false)],
        ColumnLimits {
            least: 112.0,
            most: 120.0,
            floor: 300.0,
        },
    );
    assert_eq!(heads.width, 300.0, "the layout's floor wins");
    let narrow = sequence_cards(
        &[card(long, None, false)],
        ColumnLimits {
            least: 112.0,
            most: 120.0,
            floor: 0.0,
        },
    );
    let fitted = &narrow.cards[0];
    assert!(
        fitted.title_size < 11.5,
        "a narrow column sets a smaller title"
    );
    assert!(fitted.title_size >= 10.5, "never below the floor");
    assert!(
        narrow.width > 120.0,
        "the smallest title still fits, so columns widen"
    );
}

#[test]
fn a_label_wraps_inside_its_room_on_a_plate_that_holds_every_line() {
    let words = "reserve every line of the order and answer what is short";
    let plate = message_plate(words, 120.0);
    let widest = plate
        .lines
        .iter()
        .map(|line| line.width)
        .fold(0.0, f64::max);
    // The plate keeps 8 either side of its words, and stands 15 for a line and 12 more for each after.
    let after_first = plate.lines.len() as f64 - 1.0;
    assert!(after_first >= 1.0 && widest + 16.0 <= 120.0);
    assert_eq!(
        (plate.width, plate.height, plate.taller_by),
        (widest + 16.0, 15.0 + after_first * 12.0, after_first * 12.0)
    );
    let unbounded = message_plate(words, f64::INFINITY);
    assert_eq!((unbounded.lines.len(), unbounded.taller_by), (1, 0.0));
}

#[test]
fn an_arrow_stops_at_the_bar_it_meets_short_by_its_head() {
    let (from, to) = (100.0, 300.0);
    let (leaving, arriving) = (activation_span(from), activation_span(to));
    assert_eq!(
        (leaving.x, leaving.width),
        (94.0, 12.0),
        "the bar the painter draws"
    );
    let busy = message_ends(MessageKind::Sync, from, to, (true, true));
    assert_eq!((busy.travel, busy.start), (1, leaving.x + leaving.width));
    assert!(busy.end < arriving.x && busy.end > arriving.x - 11.0);
    let free = message_ends(MessageKind::Sync, from, to, (false, false));
    assert_eq!((free.start, free.end - busy.end), (from, 6.0));
}

#[test]
fn an_arrow_back_and_a_message_to_itself_leave_from_their_bars() {
    let bar = activation_span(100.0);
    let back = message_ends(MessageKind::Return, 300.0, 100.0, (false, true));
    assert_eq!(back.travel, -1);
    assert!(back.end > bar.x + bar.width);
    let own = message_ends(MessageKind::Myself, 100.0, 100.0, (true, true));
    assert_eq!((own.travel, own.start, own.end), (0, 106.0, 106.0));
}

#[test]
fn a_self_message_loops_out_and_back_below_its_row() {
    let start = Point { x: 40.0, y: 70.0 };
    let reach = self_loop(start);
    assert_eq!(
        (reach.x, reach.y, reach.width, reach.height),
        (40.0, 70.0, 60.0, 24.0)
    );
}
