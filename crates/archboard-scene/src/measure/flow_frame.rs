//! A flow's frame: its name and its summary in its tab, settled before layout.

use crate::drawing::{MeasuredNode, TextRole, TextRun};
use crate::js;
use crate::measure::cards::CardWords;
use crate::measure::{truncate, width};
use crate::paint::design::{
    ARCHITECTURE_CARD_PADDING, ARCHITECTURE_NOTE_GAP, CARD_NOTE_FONT, CARD_TITLE_FONT,
    FLOW_HEADING, FLOW_HEADING_WITH_NOTE, PART_NOTE_SIZE, PART_TITLE_LINE, PART_TITLE_SIZE,
    TAB_PADDING, TAB_SHOULDER,
};

/// How far a flow's heading runs along its tab.
const FLOW_HEADING_MOST: f64 = 560.0;

/// One line of a flow's heading, from the top left of its tab, cut to the room it has.
fn flow_heading_run(words: &str, role: TextRole, baseline: f64) -> TextRun {
    let (font, font_size) = match role {
        TextRole::Title => (CARD_TITLE_FONT, PART_TITLE_SIZE),
        _ => (CARD_NOTE_FONT, PART_NOTE_SIZE),
    };
    let text = truncate(words, font, font_size, FLOW_HEADING_MOST);
    TextRun {
        width: width(&text, font, font_size),
        text,
        x: TAB_PADDING,
        y: baseline,
        font,
        font_size,
        role,
    }
}

/// Measure a flow's frame before layout: its name and its summary in its tab, as
/// a sequence sets them.
pub fn measure_flow_frame<N>(node: N, words: &CardWords<'_>) -> MeasuredNode<N> {
    let top = ARCHITECTURE_CARD_PADDING;
    let note = words.responsibility.map(|summary| {
        let baseline = top + PART_TITLE_LINE + ARCHITECTURE_NOTE_GAP + PART_NOTE_SIZE;
        flow_heading_run(summary, TextRole::Note, baseline)
    });
    let heading = if note.is_some() {
        FLOW_HEADING_WITH_NOTE
    } else {
        FLOW_HEADING
    };
    let height = heading + 2.0 * top;
    let mut runs = vec![flow_heading_run(
        words.name,
        TextRole::Title,
        top + PART_TITLE_SIZE,
    )];
    runs.extend(note);
    let wide = js::max(runs.iter().map(|run| run.width));
    MeasuredNode {
        node,
        width: wide + 2.0 * TAB_PADDING + TAB_SHOULDER,
        height,
        header_height: height,
        runs,
        headers: None,
        pointed: None,
    }
}
