//! Every flow's frame with its blocks laid out in it, one frame under the
//! other, at the column height that fits the reference pane best (ADR 0073).
//!
//! A flowchart that the reference pane shows whole at full size keeps every
//! run of steps in one column. A taller one is laid out again at shorter
//! column heights, and keeps the first that the pane shows at a larger scale
//! than every shorter break before it, so a flowchart breaks into no more
//! columns than it needs.

use std::collections::HashMap;

use archboard_layout::fit_in;
use archboard_scene::drawing::MeasuredLabel;
use archboard_scene::geometry::{Point, Rect};
use archboard_scene::paint::design::DIAGRAM_MARGIN;

use super::graph::Chart;
use super::layout::{Layout, Marker, Run};

/// The room between a frame and what it holds, as a container's.
const FRAME_INSET: f64 = 20.0;
/// The room between two flows' frames, one under the other.
const FLOW_GAP: f64 = 32.0;
/// The most columns a run of steps is tried in.
const MOST_COLUMNS: u32 = 12;
/// How many column heights are tried between one column count and the next.
const TRIES_PER_COLUMN: u32 = 4;
/// How much larger a picture with more breaks must show in the reference pane
/// to be kept over one with fewer.
const BETTER_FIT: f64 = 1.01;

/// What a frame needs to stand around its blocks: its header's height, and
/// the width its header's words take.
#[derive(Clone, Copy, Debug)]
pub(super) struct Header {
    /// How tall the frame's tab is.
    pub height: f64,
    /// How wide the frame must be to hold its tab.
    pub width: f64,
}

/// Every flow laid out on the page.
#[derive(Clone, Debug)]
pub(super) struct Page {
    /// How wide the page is, margins included.
    pub width: f64,
    /// How tall the page is, margins included.
    pub height: f64,
    /// Every frame, by flow.
    pub frames: Vec<(String, Rect)>,
    /// Every box and shape, by node.
    pub boxes: Vec<(String, Rect)>,
    /// Every end of a jump, by the flow whose frame holds it.
    pub markers: Vec<(String, Marker)>,
    /// Every line.
    pub runs: Vec<Run>,
    /// How many times a run of blocks broke into another column.
    pub breaks: usize,
}

/// Every flow's frame and blocks, one frame under the other, with each run of
/// blocks no taller than a column height.
fn page(charts: &[Chart], headers: &HashMap<String, Header>, layout: &Layout<'_>) -> Page {
    let mut page = Page {
        width: 0.0,
        height: 0.0,
        frames: Vec::new(),
        boxes: Vec::new(),
        markers: Vec::new(),
        runs: Vec::new(),
        breaks: 0,
    };
    let mut top = DIAGRAM_MARGIN;
    for chart in charts {
        let header = headers.get(&chart.flow).copied().unwrap_or(Header {
            height: 0.0,
            width: 0.0,
        });
        let blocks = layout.chain(&chart.blocks);
        let width = (blocks.width + 2.0 * FRAME_INSET).max(header.width);
        let height = header.height + blocks.height + 2.0 * FRAME_INSET;
        let offset = Point {
            x: DIAGRAM_MARGIN + (width - blocks.width) / 2.0,
            y: top + header.height + FRAME_INSET,
        };
        let blocks = blocks.moved(offset);
        page.frames.push((
            chart.flow.clone(),
            Rect {
                x: DIAGRAM_MARGIN,
                y: top,
                width,
                height,
            },
        ));
        page.boxes.extend(blocks.boxes);
        page.markers
            .extend((blocks.markers.into_iter()).map(|marker| (chart.flow.clone(), marker)));
        page.runs.extend(blocks.runs);
        page.breaks += blocks.breaks;
        page.width = page.width.max(width + 2.0 * DIAGRAM_MARGIN);
        top += height + FLOW_GAP;
    }
    page.height = top - FLOW_GAP + DIAGRAM_MARGIN;
    page
}

/// Every flow laid out at the column height whose page the reference pane
/// shows at the largest scale, with fewer breaks on a near tie.
pub(super) fn fitted(
    charts: &[Chart],
    headers: &HashMap<String, Header>,
    sizes: &HashMap<String, (f64, f64)>,
    words: &HashMap<String, MeasuredLabel>,
) -> Page {
    let at_height = |column: f64| {
        let layout = Layout {
            sizes,
            words,
            column,
        };
        page(charts, headers, &layout)
    };
    let whole = at_height(f64::INFINITY);
    let mut best_fit = fit_in(whole.width, whole.height);
    let tallest = whole.height;
    let mut best = whole;
    let tries = (TRIES_PER_COLUMN + 1..=MOST_COLUMNS * TRIES_PER_COLUMN)
        .map(|share| tallest * f64::from(TRIES_PER_COLUMN) / f64::from(share));
    for column in tries {
        if best_fit >= 1.0 {
            break;
        }
        let candidate = at_height(column);
        let fit = fit_in(candidate.width, candidate.height);
        if fit > best_fit * BETTER_FIT {
            best_fit = fit;
            best = candidate;
        }
    }
    best
}
