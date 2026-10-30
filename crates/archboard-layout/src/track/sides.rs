//! The side walls of the frames and group regions a track scene draws, fitted
//! once every line is routed. Graphviz sizes a cluster to hold each label box
//! where Graphviz stood it; the router then slides some labels onto their
//! lines, and the strip kept for a label's old place stayed empty beside the
//! container's members. Each wall is pulled in to one inset from the
//! outermost thing its container holds.

use crate::constants::{ARCHITECTURE_HEADER_PADDING, CONTAINER_INSET, REGION_INSET};
use crate::ecma::{abs, js_max, js_min, max, min, sorted_by};
use crate::geometry::{Point, Rect};
use crate::track::chains::{LANE, REGION_CLEARANCE};
use crate::track::containers::{Edges, FrameShape, RegionShape, frame_shapes, region_shapes};
use crate::track::scene::{Placement, REGION_CAPTION_INSET};

/// One container whose side walls are fitted.
struct Fitting {
    /// Its box; replaced once fitted.
    bx: Rect,
    /// The room it keeps beside what it holds.
    inset: f64,
    /// The room it keeps beside a line it holds.
    clearance: f64,
    /// The narrowest it may be: its heading's width.
    narrowest: f64,
    /// Its title row or caption.
    heading: Rect,
    /// How far in from its left wall its heading's words end.
    words: f64,
    /// For a frame laid out as the region round it: how wide the region's
    /// caption needs it, and its box fitted before it widened for that.
    wide: Option<(f64, Option<Rect>)>,
    /// Routed endpoints fix the header in place after composition.
    fixed: bool,
}

/// Whether two boxes share some area.
fn overlaps(one: &Rect, other: &Rect) -> bool {
    one.x < other.x + other.width
        && other.x < one.x + one.width
        && one.y < other.y + other.height
        && other.y < one.y + one.height
}

/// Whether one line point, or the upright run from it to the next, stands in a box.
fn stands_in(point: Point, next: Option<Point>, bx: &Rect) -> bool {
    if point.x <= bx.x || point.x >= bx.x + bx.width {
        return false;
    }
    let (top, bottom) = match next {
        Some(next) if abs(next.x - point.x) < 0.5 => {
            (js_min(point.y, next.y), js_max(point.y, next.y))
        }
        _ => (point.y, point.y),
    };
    top < bx.y + bx.height && bottom > bx.y
}

/// The x of every line's end on a box's top or bottom wall.
fn ends_on(lines: &[&[Point]], bx: &Rect) -> Vec<f64> {
    lines
        .iter()
        .flat_map(|points| [points[0], points[points.len() - 1]])
        .filter(|point| {
            point.x >= bx.x
                && point.x <= bx.x + bx.width
                && (abs(point.y - bx.y) < 0.5 || abs(point.y - bx.y - bx.height) < 0.5)
        })
        .map(|point| point.x)
        .collect()
}

/// A frame laid out as the region round it, fitted, widened for its region's
/// caption: round the middle of the frame, inside the box its layout kept.
fn widened_in(fitted: Rect, width: f64) -> Rect {
    let wide = js_max(fitted.width, width);
    let x = fitted.x - (wide - fitted.width) / 2.0;
    Rect {
        x,
        width: wide,
        ..fitted
    }
}

/// The x of every point of a line inside a box, and of every upright run that passes through it.
fn uprights_in(lines: &[&[Point]], bx: &Rect) -> Vec<f64> {
    lines
        .iter()
        .flat_map(|points| {
            points
                .iter()
                .enumerate()
                .filter(|&(index, &point)| stands_in(point, points.get(index + 1).copied(), bx))
                .map(|(_, point)| point.x)
        })
        .collect()
}

/// Pull a container's side walls in to one inset from the outermost thing it holds.
fn fit_side(
    fittings: &mut [Fitting],
    at: usize,
    items: &[Rect],
    inner: &[usize],
    lines: &[&[Point]],
) {
    let fitting = &fittings[at];
    let (bx, inset, clearance, narrowest, heading, words) = (
        fitting.bx,
        fitting.inset,
        fitting.clearance,
        fitting.narrowest,
        fitting.heading,
        fitting.words,
    );
    let held: Vec<Rect> = items
        .iter()
        .copied()
        .filter(|one| overlaps(one, &bx))
        .chain(inner.iter().map(|&one| fittings[one].bx))
        .collect();
    let mut uprights = uprights_in(lines, &bx);
    uprights.extend(ends_on(lines, &bx));
    if held.len() + uprights.len() == 0 {
        return;
    }
    let lows = held
        .iter()
        .map(|one| one.x - inset)
        .chain(uprights.iter().map(|x| x - clearance));
    let highs: Vec<f64> = held
        .iter()
        .map(|one| one.x + one.width + inset)
        .chain(uprights.iter().map(|x| x + clearance))
        .collect();
    let crossing = uprights_in(
        lines,
        &Rect {
            x: bx.x,
            width: bx.width,
            ..heading
        },
    );
    let right = bx.x + bx.width;
    let mut low = js_max(
        bx.x,
        min(lows.chain(crossing.iter().map(|x| x - LANE - words))),
    );
    // A compact header keeps its routed endpoints when the frame tightens.
    // Its slab is content too, so the left wall cannot move past it.
    if fitting.fixed {
        low = js_min(low, heading.x);
    }
    let mut high = js_min(right, max(highs.iter().copied()));
    if high - low < narrowest {
        high = js_min(right, low + narrowest);
        low = js_max(bx.x, high - narrowest);
    }
    let fitted = Rect {
        x: low,
        width: high - low,
        ..bx
    };
    let fitting = &mut fittings[at];
    fitting.bx = fitted;
    if let Some((width, ref mut before)) = fitting.wide {
        *before = Some(fitted);
        fitting.bx = widened_in(fitted, width);
    }
}

/// Whether one container stands wholly inside another.
fn around(outer: &Fitting, inner: &Fitting) -> bool {
    outer.bx.x <= inner.bx.x
        && inner.bx.x + inner.bx.width <= outer.bx.x + outer.bx.width
        && outer.bx.y <= inner.bx.y
        && inner.bx.y + inner.bx.height <= outer.bx.y + outer.bx.height
}

/// Fit every container's side walls, innermost first.
fn fit_all(fittings: &mut [Fitting], items: &[Rect], lines: &[&[Point]]) {
    let inside: Vec<Vec<usize>> = (0..fittings.len())
        .map(|one| {
            (0..fittings.len())
                .filter(|&other| other != one && around(&fittings[one], &fittings[other]))
                .collect()
        })
        .collect();
    let order: Vec<usize> = (0..fittings.len()).collect();
    let area = |at: usize| fittings[at].bx.width * fittings[at].bx.height;
    let order = sorted_by(&order, |&a, &b| area(a) - area(b));
    for one in order {
        fit_side(fittings, one, items, &inside[one], lines);
    }
}

/// Every frame and group region of a routed scene, with its side walls fitted to what it holds.
pub(crate) fn fit_sides(
    scene: &Placement,
    edges: &Edges<'_>,
    lines: &[&[Point]],
    left: f64,
) -> (Vec<FrameShape>, Vec<RegionShape>) {
    let (frames, regions) = (
        frame_shapes(scene, edges, left),
        region_shapes(scene, edges, left),
    );
    let items: Vec<Rect> = scene
        .cards
        .values()
        .chain(scene.labels.values())
        .map(|&item| scene.moved_id(item, left))
        .collect();
    let mut fittings: Vec<Fitting> = frames
        .iter()
        .map(|frame| {
            let title = scene.titles[frame.id.as_str()];
            let words = scene.words[&title];
            let narrowest = words + ARCHITECTURE_HEADER_PADDING;
            let heading = scene.moved_id(title, left);
            // A frame laid out as the region round it keeps the region's inset too.
            let inset = CONTAINER_INSET + scene.frames[frame.id.as_str()].below.unwrap_or(0.0);
            let wide = scene.frames[frame.id.as_str()]
                .wide
                .map(|width| (width, None));
            Fitting {
                bx: frame.bx,
                inset,
                clearance: inset,
                narrowest,
                heading,
                words,
                wide,
                fixed: !lines.is_empty(),
            }
        })
        .collect();
    fittings.extend(regions.iter().map(|region| {
        let words = REGION_CAPTION_INSET + region.caption.width;
        Fitting {
            bx: region.bx,
            inset: REGION_INSET,
            clearance: REGION_CLEARANCE,
            narrowest: words + REGION_CAPTION_INSET,
            heading: region.caption,
            words,
            wide: None,
            fixed: false,
        }
    }));
    fit_all(&mut fittings, &items, lines);
    let framed = frames
        .into_iter()
        .enumerate()
        .map(|(index, frame)| {
            let fitting = &fittings[index];
            match fitting.wide {
                None => FrameShape {
                    bx: fitting.bx,
                    ..frame
                },
                Some((_, fitted)) => FrameShape {
                    bx: fitted.unwrap_or(fitting.bx),
                    region: Some(fitting.bx),
                    ..frame
                },
            }
        })
        .collect::<Vec<_>>();
    let count = framed.len();
    let banded = regions
        .into_iter()
        .enumerate()
        .map(|(index, region)| {
            let bx = fittings[count + index].bx;
            let caption = Rect {
                x: region.caption.x + bx.x - region.bx.x,
                ..region.caption
            };
            RegionShape {
                bx,
                caption,
                ..region
            }
        })
        .collect();
    (framed, banded)
}

/// Tighten member frames and place their compact headers before routing.
/// A wider lone caption keeps its original reserved envelope independently.
pub(crate) fn place_headers(scene: &mut Placement, edges: &Edges<'_>) {
    if scene.frames.is_empty() && scene.regions.is_empty() {
        return;
    }
    let tops: Vec<f64> = scene.bands.iter().map(|band| band.new_top).collect();
    for band in &mut scene.bands {
        band.new_top = band.top;
    }
    let (frames, regions) = fit_sides(scene, edges, &[], 0.0);
    for frame in frames {
        let title = scene.titles[frame.id.as_str()];
        scene.item_mut(title).bx.x = frame.bx.x;
        let own = scene
            .frames
            .get_mut(frame.id.as_str())
            .expect("a placed frame");
        own.x = frame.bx.x;
        own.width = frame.bx.width;
    }
    place_regions(scene, regions);
    for (band, top) in scene.bands.iter_mut().zip(tops) {
        band.new_top = top;
    }
}

/// Keep each group caption at its tightened region before routing.
fn place_regions(scene: &mut Placement, regions: Vec<RegionShape>) {
    for region in regions {
        let own = scene
            .regions
            .iter_mut()
            .find(|own| own.group == region.group && own.parent == region.parent);
        if let Some(own) = own {
            own.x = region.bx.x;
            own.width = region.bx.width;
            let caption = own.caption;
            scene.item_mut(caption).bx.x = region.caption.x;
        }
    }
}
