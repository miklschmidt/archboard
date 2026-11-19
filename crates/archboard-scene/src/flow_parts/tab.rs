//! The tab a sequence's flow frame carries its name and summary in.

use crate::geometry::Rect;
use crate::paint::tab_width;
use crate::sizes::{ARCHITECTURE_CARD_PADDING, FLOW_HEADING, FLOW_HEADING_WITH_NOTE, TAB_PADDING};

/// A flow frame's tab.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct FlowTab {
    /// How wide the tab is.
    pub width: f64,
    /// Where the name and the summary stand, from the tab's top left corner.
    /// The heading stands as far above the tab's foot as below its top.
    pub header: Rect,
}

/// The tab of a flow's frame of some width, with or without its summary: as
/// the flowchart measures the same heading (`measure_flow_frame`).
pub fn flow_tab(frame_width: f64, has_summary: bool) -> FlowTab {
    let width = tab_width(frame_width);
    FlowTab {
        width,
        header: Rect {
            x: TAB_PADDING,
            y: ARCHITECTURE_CARD_PADDING,
            width: width - TAB_PADDING * 2.0,
            height: if has_summary {
                FLOW_HEADING_WITH_NOTE
            } else {
                FLOW_HEADING
            },
        },
    }
}
