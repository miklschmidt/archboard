//! Flow part measures: each part a flow layout places is measured where the
//! painter draws it from, so the layout and the painter agree without sharing a
//! size. Each test states the agreement its measure exists for.

use archboard_geometry::Point;
use archboard_painting::{
    CardWords, ColumnLimits, HeadCard, Part, Span, activation_span, flow_tab, fragment_bounds,
    fragment_head, measure_node, message_ends, message_plate, note_plate, self_loop,
    sequence_cards, shape_words,
};
use archboard_scene::request::{FrameOperator, MessageKind};

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
fn two_cards() -> (f64, f64, Vec<HeadCard>) {
    let heads = sequence_cards(
        &[
            card("Checkout API", None, false),
            card("Inventory service", Some(RESERVES), true),
        ],
        ColumnLimits {
            least: 112.0,
            most: 192.0,
            floor: 0.0,
        },
    );
    (heads.width, heads.lifeline_drop, heads.cards)
}

#[test]
fn a_card_holds_its_whole_responsibility_inside_its_text_run() {
    let (width, _, cards) = two_cards();
    assert!((112.0..=192.0).contains(&width));
    let notes = &cards[1].notes;
    assert!(notes.len() > 1);
    for line in notes {
        assert!(line.width + CARD_CHROME <= width, "{} overruns", line.text);
    }
    let joined: Vec<&str> = notes.iter().map(|line| line.text.as_str()).collect();
    assert_eq!(joined.join(" "), RESERVES);
}

#[test]
fn a_card_grows_a_note_line_at_a_time_and_keeps_its_mark_beside_its_name() {
    let (width, lifeline_drop, cards) = two_cards();
    let [plain, noted] = cards.as_slice() else {
        panic!("one card each");
    };
    assert_eq!((plain.notes.len(), plain.height), (0, 46.0));
    // One line of a note is 9.5 high at a 1.35 line height.
    let extra = noted.notes.len() as f64 - 1.0;
    assert!((noted.height - (58.0 + extra * 12.825)).abs() < 1e-9);
    assert_eq!(plain.title_room, width - CARD_CHROME);
    assert_eq!(noted.title_room, width - CARD_CHROME - 21.0);
    // The lifeline starts clear of the card's shadow.
    assert_eq!(lifeline_drop, 13.0);
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

#[test]
fn a_note_wraps_whole_on_a_plate_that_holds_its_lines() {
    let note = "retries twice with a fresh token before it gives the order up as lost";
    let plate = note_plate(note, 180.0);
    let joined: Vec<&str> = plate.lines.iter().map(|line| line.text.as_str()).collect();
    assert_eq!(joined.join(" "), note);
    let widest = plate
        .lines
        .iter()
        .map(|line| line.width)
        .fold(0.0, f64::max);
    // The plate keeps 4 either side and 2 above and below; a line is 9.5 at a 1.35 line height.
    assert_eq!(plate.width, widest.ceil() + 8.0);
    let height = plate.lines.len() as f64 * 12.825 + 4.0;
    assert!(plate.lines.len() > 1 && (plate.height - height).abs() < 1e-9);
}

/// How wide words on a fragment's head or guard row are set: in the label
/// face at 9, as a message's plate sets them.
fn row_words(words: &str) -> f64 {
    message_plate(words, f64::INFINITY).lines[0].width
}

#[test]
fn a_fragment_is_never_narrower_than_its_tab_its_words_and_each_guard() {
    let guard = "refused at the payment gateway after three tries";
    let head = fragment_head(FrameOperator::Alt, "is the order paid", &["paid", guard]);
    assert_eq!((head.tab.height, head.guard_height), (18.0, 16.0));
    // The tab pads its operator by 6 a side; the words stand 6 past it and 10 short of the side.
    assert_eq!(head.tab.width, (row_words("alt") + 12.0).ceil());
    assert!(head.least_width >= head.tab.width + 6.0 + row_words("is the order paid") + 10.0);
    // A guard is spelled in brackets and stands 10 in from either side.
    assert!(head.least_width >= row_words(&format!("[{guard}]")) + 20.0);
}

#[test]
fn a_fragment_reaches_round_the_ink_it_holds_or_spans_the_columns() {
    let head = fragment_head(FrameOperator::Loop, "[each line]", &[]);
    let columns = Span {
        x: 38.0,
        width: 400.0,
    };
    let ink = Span {
        x: 100.5,
        width: 200.0,
    };
    let round = fragment_bounds(Some(ink), columns, &head);
    assert_eq!((round.x, round.width), (90.0, 221.0));
    let tight = Span {
        x: 100.0,
        width: 1.0,
    };
    assert_eq!(
        fragment_bounds(Some(tight), columns, &head).width,
        head.least_width
    );
    let empty = fragment_bounds(None, columns, &head);
    assert_eq!((empty.x, empty.width), (38.0, 400.0));
}

#[test]
fn a_sequence_s_tab_holds_the_heading_a_flowchart_measures_for_the_same_flow() {
    for summary in [None, Some("What happens when an order is placed")] {
        let tab = flow_tab(400.0, summary.is_some());
        // The tab stops short of the frame's right edge by its foot and the
        // frame's corner, 20, and its words stand 12 in from either side.
        assert_eq!(tab.width, 380.0);
        assert_eq!((tab.header.x, tab.header.width), (12.0, 356.0));
        let heading = measure_node((), &card("Place an order", summary, false), Part::FlowFrame);
        assert_eq!(tab.header.y * 2.0 + tab.header.height, heading.height);
    }
}

#[test]
fn a_shape_s_words_wrap_whole_inside_its_width_a_line_at_a_time() {
    let name = "Is every line of the order in stock";
    let words = shape_words(name, 120.0);
    assert!(words.lines.len() > 1);
    assert_eq!(words.lines.join(" "), name);
    // A shape sets its words at 11, 14 to a line.
    assert_eq!(words.height, words.lines.len() as f64 * 14.0);
    assert!(words.width <= 120.0 && words.width > 0.0);
}
