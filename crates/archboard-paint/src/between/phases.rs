//! The numbers of a move that live in the web app's picture motion. The host passes
//! them, so that no duration or phase is written twice.

use serde::Deserialize;

/// When, as shares of a transition, each part of the change happens
/// (`PICTURE_TRANSITION_PHASES`).
#[derive(Clone, Copy, Debug, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Transition {
    /// Subjects only the last picture had are gone by here.
    pub exit_end: f64,
    /// Shared subjects begin to move here.
    pub move_start: f64,
    /// Shared subjects are in place by here.
    pub move_end: f64,
    /// A changed card's old content and frame begin to cross-fade into the new here.
    pub fade_start: f64,
    /// The cross-fade ends here.
    pub fade_end: f64,
    /// What a card's old content leaves by here, and what arrives begins.
    pub swap_at: f64,
    /// Subjects only the next picture has begin to appear here.
    pub enter_start: f64,
    /// An arriving line shows its arrowhead once this much of it is drawn.
    pub arrowhead_at: f64,
    /// Every label only the next picture has arrives from here to the end.
    pub labels_start: f64,
    /// The parts inside a door begin to show here.
    pub inside_start: f64,
    /// The parts inside a door show in full by here.
    pub inside_end: f64,
    /// A spark starts to redraw the lines here.
    pub draw_start: f64,
    /// The last spark lands by here, past the end of the rest of the move.
    pub draw_end: f64,
}

/// When, as shares of an entrance, each part of a picture arrives
/// (`PICTURE_ENTRY_PHASES`).
#[derive(Clone, Copy, Debug, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    /// The page's furniture fades in over the first part.
    pub frames_end: f64,
    /// How long the front that opens the containers takes.
    pub region_span: f64,
    /// The first card in the wave begins here.
    pub cards_start: f64,
    /// The last card in the wave begins by here.
    pub cards_start_by: f64,
    /// How long each card takes to arrive.
    pub card_span: f64,
    /// A spark starts to draw the lines here.
    pub lines_start: f64,
    /// The last spark lands by here, past the end of the rest of the entrance.
    pub draw_end: f64,
    /// How long a line's pulses take to come in once it is drawn.
    pub pulse_span: f64,
    /// Every label arrives from here to the end.
    pub labels_start: f64,
}

/// Every number of a move that lives in the web app's picture motion.
///
/// It reads as `{"transition": PICTURE_TRANSITION_PHASES, "entry":
/// PICTURE_ENTRY_PHASES, "enter": PICTURE_MS.entry, "exit": PICTURE_MS.exit,
/// "shutter": PICTURE_MS.shutter}`.
#[derive(Clone, Copy, Debug, PartialEq, Deserialize)]
pub struct Phases {
    /// One picture turning into the next.
    pub transition: Transition,
    /// A picture arriving with nothing to carry it from.
    pub entry: Entry,
    /// How long a picture takes to arrive, in milliseconds.
    pub enter: f64,
    /// How long a picture takes to leave, in milliseconds.
    pub exit: f64,
    /// How long a sideways passage's shutter samples, in milliseconds.
    pub shutter: f64,
}

#[cfg(test)]
pub(crate) mod fixtures {
    use super::{Entry, Phases, Transition};

    /// The values the web app's picture motion holds today.
    pub(crate) const PHASES: Phases = Phases {
        transition: Transition {
            exit_end: 0.35,
            move_start: 0.06,
            move_end: 0.88,
            fade_start: 0.2,
            fade_end: 0.68,
            swap_at: 0.44,
            enter_start: 0.54,
            arrowhead_at: 0.9,
            labels_start: 0.66,
            inside_start: 0.08,
            inside_end: 0.46,
            draw_start: 0.42,
            draw_end: 3.0,
        },
        entry: Entry {
            frames_end: 0.3,
            region_span: 0.6,
            cards_start: 0.06,
            cards_start_by: 0.36,
            card_span: 0.48,
            lines_start: 0.32,
            draw_end: 2.8,
            pulse_span: 0.12,
            labels_start: 0.66,
        },
        enter: 760.0,
        exit: 280.0,
        shutter: 8.0,
    };
}

#[cfg(test)]
mod tests {
    use super::{Phases, fixtures::PHASES};

    #[test]
    fn the_host_hands_over_its_numbers_as_json_in_the_names_of_the_page() {
        let phases: Phases = serde_json::from_str(
            r#"{"transition":{"exitEnd":0.35,"moveStart":0.06,"moveEnd":0.88,"fadeStart":0.2,"fadeEnd":0.68,"swapAt":0.44,"enterStart":0.54,"arrowheadAt":0.9,"labelsStart":0.66,"insideStart":0.08,"insideEnd":0.46,"drawStart":0.42,"drawEnd":3.0},
                "entry":{"framesEnd":0.3,"regionSpan":0.6,"cardsStart":0.06,"cardsStartBy":0.36,"cardSpan":0.48,"linesStart":0.32,"drawEnd":2.8,"pulseSpan":0.12,"labelsStart":0.66},
                "enter":760,"exit":280,"shutter":8}"#,
        )
        .expect("the page's phases");
        assert_eq!(phases, PHASES);
    }
}
