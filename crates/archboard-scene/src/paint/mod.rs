//! The painter: a drawing turned into a scene, part by part, in the order the
//! picture is drawn.

use std::collections::{BTreeMap, HashSet};

use crate::attrs;
use crate::drawing::{Emphasis, ReadingDirection};
use crate::geometry::coord;
use crate::markup::{Markup, concat, tag, wrap};
use crate::measure::{Measure, Measurer};
use crate::request::{PaintRequest, Picture, Standing};
use crate::scene::{Atlas, Boxes, Scene};

pub mod appearance;
pub mod architecture;
pub mod cards;
pub mod colour;
pub mod crossings;
pub mod design;
pub mod drill_mark;
pub mod export;
pub mod far_card;
pub mod far_view;
pub mod flowchart_shapes;
pub mod fonts;
pub mod icons;
pub mod junctions;
pub mod measured_cards;
pub mod page;
pub mod palette;
pub mod polygon;
pub mod ports;
pub mod regions;
pub mod relay;
pub mod sequence;
pub mod shadow;
pub mod shared_ink;
pub mod slab;
pub mod standing;
pub mod styles;
pub mod text_runs;
pub mod traffic;
pub mod tray;

/// What every part of one picture is painted with: the host's measure of text,
/// and the icons the host has.
pub struct Ctx<'a> {
    pub measurer: Measurer<'a>,
    pub icons: &'a BTreeMap<String, Vec<String>>,
}

/// Every arrowhead marker and shared gradient a picture's body refers to.
fn definitions(palette: &palette::Palette) -> Markup {
    use styles::{Head, LIT_HEAD, WEIGHTS, head_ref_x, head_widths, line_colour};

    let mut inks: Vec<(String, String)> = vec![(line_colour(palette, None), String::new())];
    for standing in [Standing::Added, Standing::Changed, Standing::Removed] {
        inks.push((line_colour(palette, Some(standing)), format!("-{}", standing.as_str())));
    }
    inks.push((palette.selection.to_owned(), LIT_HEAD.to_owned()));
    let marker = |head: Head, weight: Emphasis, colour: &str, suffix: &str| {
        let size = coord(head_widths(weight));
        let shape = match head {
            Head::Filled => tag("path", attrs! { "d": "M0,0 L10,5 L0,10 z", "fill": colour }),
            Head::Open => tag(
                "path",
                attrs! {
                    "d": "M2,1 L10,5 L2,9",
                    "fill": "none",
                    "stroke": colour,
                    "stroke-width": 1.7,
                    "stroke-linecap": "round",
                    "stroke-linejoin": "round",
                },
            ),
        };
        wrap(
            "marker",
            attrs! {
                "id": format!("ah-{}-{}{suffix}", head.as_str(), weight.as_str()),
                "viewBox": "0 0 10 10",
                "refX": head_ref_x(head),
                "refY": 5.0,
                "markerWidth": size.as_str(),
                "markerHeight": size.as_str(),
                "orient": "auto-start-reverse",
            },
            shape,
        )
    };
    let mut parts = Vec::new();
    for head in [Head::Filled, Head::Open] {
        for weight in styles::WEIGHTS {
            for (colour, suffix) in &inks {
                parts.push(marker(head, weight, colour, suffix));
            }
        }
    }
    let _ = WEIGHTS;
    parts.push(slab::slab_definitions(palette));
    parts.push(ports::port_definitions(palette));
    concat(parts)
}

/// An atlas holding only the subjects a reader can pick.
fn subject_atlas(atlas: Atlas, subjects: &HashSet<&str>) -> Atlas {
    let kept = |boxes: Boxes| Boxes(boxes.0.into_iter().filter(|(id, _)| subjects.contains(id.as_str())).collect());
    Atlas { nodes: kept(atlas.nodes), edges: kept(atlas.edges), regions: kept(atlas.regions) }
}

/// One picture painted into a scene, its text measured by the host.
pub fn paint(request: &PaintRequest, host: &dyn Measure) -> Scene {
    let ctx = Ctx { measurer: Measurer::new(host), icons: &request.icons };
    let palette = &palette::PALETTE;
    let page = &request.page;
    let unsettled = standing::Unsettled::from(&page.unsettled);
    let painted = standing::Standings::from(if page.plain { None } else { page.standing.as_ref() });
    let held = standing::Standings::from(page.standing.as_ref());
    let (painting, reading, flowchart) = match &request.picture {
        Picture::Architecture(picture) => {
            let shapes = picture.flowchart.as_ref().map(|parts| flowchart_shapes::FlowchartShapes { shapes: &parts.shapes, palette });
            let vocabulary = architecture::Vocabulary {
                appearances: &picture.appearances,
                lines: &picture.lines,
                groups: &picture.groups,
                steps: picture.steps.iter().map(String::as_str).collect(),
                far_size: picture.far_size,
            };
            let held_page = architecture::HeldPage {
                drawing: picture.whole.as_ref().unwrap_or(&picture.drawing),
                // A flowchart's page holds the marks it draws.
                standings: if shapes.is_some() { &painted } else { &held },
                shapes: shapes.as_ref().map(|shapes| shapes as &dyn architecture::Shapes),
                card_kind: if shapes.is_some() { crate::scene::SubjectKind::Step } else { crate::scene::SubjectKind::Node },
            };
            let mut painting =
                architecture::paint_architecture(&ctx, &picture.drawing, palette, &painted, &unsettled, &vocabulary, &held_page);
            if let Some(parts) = &picture.flowchart {
                let subjects: HashSet<&str> = parts.subjects.iter().map(String::as_str).collect();
                painting.atlas = subject_atlas(painting.atlas, &subjects);
            }
            (painting, Some(picture.drawing.drawing.direction), picture.flowchart.is_some())
        }
        Picture::Sequence(picture) => {
            (sequence::paint_sequence(&ctx, picture, palette, &painted, &unsettled, &held), None, false)
        }
    };
    let framed = page::page_for(&ctx, painting, palette, page.unbuilt);
    let framed = export::framed_for_export(&ctx, framed, page.frame.as_ref(), page.standing.as_ref(), page.plain, palette);
    let body = if flowchart { concat(vec![flowchart_shapes::flowchart_definitions(), framed.body]) } else { framed.body };
    let document = &request.document;
    Scene {
        width: framed.width,
        height: framed.height,
        title: export::exported_name(&page::planned_title(&document.name, page.unbuilt), page.frame.as_ref()),
        description: document.description.clone(),
        reading: reading.filter(|direction| *direction == ReadingDirection::Down),
        background: palette.background.to_owned(),
        definitions: definitions(palette),
        body,
        atlas: framed.atlas,
    }
}
