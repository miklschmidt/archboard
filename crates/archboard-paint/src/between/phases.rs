//! The numbers of a move that live in `@archboard/timing`. The host passes
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
}

/// When, as shares of an entrance, each part of a picture arrives
/// (`PICTURE_ENTRY_PHASES`).
#[derive(Clone, Copy, Debug, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    /// Frames fade in over the first part.
    pub frames_end: f64,
    /// The first card in the wave begins here.
    pub cards_start: f64,
    /// The last card in the wave begins by here.
    pub cards_start_by: f64,
    /// How long each card takes to arrive.
    pub card_span: f64,
    /// The first line begins drawing here.
    pub lines_start: f64,
    /// The last line begins drawing by here.
    pub lines_start_by: f64,
    /// How long each line takes to draw on.
    pub line_span: f64,
    /// Every label arrives from here to the end.
    pub labels_start: f64,
}

/// Every number of a move that lives in `@archboard/timing`.
///
/// It reads as `{"transition": PICTURE_TRANSITION_PHASES, "entry":
/// PICTURE_ENTRY_PHASES, "exit": PICTURE_MS.exit}`.
#[derive(Clone, Copy, Debug, PartialEq, Deserialize)]
pub struct Phases {
    /// One picture turning into the next.
    pub transition: Transition,
    /// A picture arriving with nothing to carry it from.
    pub entry: Entry,
    /// How long a picture takes to leave, in milliseconds.
    pub exit: f64,
}

#[cfg(test)]
pub(crate) mod fixtures {
    use super::{Entry, Phases, Transition};

    /// The values `@archboard/timing` holds today.
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
        },
        entry: Entry {
            frames_end: 0.35,
            cards_start: 0.04,
            cards_start_by: 0.4,
            card_span: 0.42,
            lines_start: 0.34,
            lines_start_by: 0.62,
            line_span: 0.38,
            labels_start: 0.66,
        },
        exit: 280.0,
    };
}

#[cfg(test)]
mod tests {
    use super::{Phases, fixtures::PHASES};

    #[test]
    fn the_host_hands_over_its_numbers_as_json_in_the_names_of_the_timing_package() {
        let phases: Phases = serde_json::from_str(
            r#"{"transition":{"exitEnd":0.35,"moveStart":0.06,"moveEnd":0.88,"fadeStart":0.2,"fadeEnd":0.68,"swapAt":0.44,"enterStart":0.54,"arrowheadAt":0.9,"labelsStart":0.66},
                "entry":{"framesEnd":0.35,"cardsStart":0.04,"cardsStartBy":0.4,"cardSpan":0.42,"linesStart":0.34,"linesStartBy":0.62,"lineSpan":0.38,"labelsStart":0.66},
                "exit":280}"#,
        )
        .expect("the timing package's phases");
        assert_eq!(phases, PHASES);
    }
}
