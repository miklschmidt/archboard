//! The painter: a drawing turned into a scene, part by part, in the order the
//! picture is drawn.

use std::collections::{BTreeMap, HashSet};

use crate::drawing::ReadingDirection;
use crate::markup::{Markup, concat};
use crate::measure::{Measure, Measurer};
use crate::request::{PaintRequest, Picture, Standing};
use crate::scene::{Atlas, Boxes, Scene};

pub mod appearance;
mod architecture;
mod cards;
pub mod colour;
mod crossings;
pub mod design;
mod drill_mark;
pub mod export;
mod far_card;
mod far_view;
pub mod flowchart_shapes;
pub mod fonts;
pub mod icons;
mod junctions;
mod measured_cards;
pub mod page;
pub mod palette;
pub mod polygon;
mod ports;
mod regions;
mod relay;
pub mod sequence;
pub mod shadow;
mod shared_ink;
pub mod slab;
pub mod standing;
pub mod styles;
pub mod text_runs;
mod traffic;
mod tray;

/// What every part of one picture is painted with: the host's measure of text,
/// and the icons the host has.
#[derive(Debug)]
pub struct Ctx<'a> {
    pub measurer: Measurer<'a>,
    pub icons: &'a BTreeMap<String, Vec<String>>,
}

/// Every arrowhead marker and shared gradient a picture's body refers to.
fn definitions(palette: &palette::Palette) -> Markup {
    use styles::{Head, LIT_HEAD, WEIGHTS, line_colour};

    let mut inks: Vec<(String, String)> = vec![(line_colour(palette, None), String::new())];
    for standing in [Standing::Added, Standing::Changed, Standing::Removed] {
        inks.push((
            line_colour(palette, Some(standing)),
            format!("-{}", standing.as_str()),
        ));
    }
    inks.push((palette.selection.to_owned(), LIT_HEAD.to_owned()));
    let mut parts = Vec::new();
    for head in [Head::Filled, Head::Open] {
        for weight in WEIGHTS {
            for (colour, suffix) in &inks {
                parts.push(architecture::arrowhead_marker(
                    &format!("ah-{}-{}{suffix}", head.as_str(), weight.as_str()),
                    head,
                    weight,
                    colour,
                ));
            }
        }
    }
    parts.push(slab::slab_definitions(palette));
    parts.push(ports::port_definitions(palette));
    concat(parts)
}

/// An atlas holding only the subjects a reader can pick.
fn subject_atlas(atlas: Atlas, subjects: &HashSet<&str>) -> Atlas {
    let kept = |boxes: Boxes| {
        Boxes(
            boxes
                .0
                .into_iter()
                .filter(|(id, _)| subjects.contains(id.as_str()))
                .collect(),
        )
    };
    Atlas {
        nodes: kept(atlas.nodes),
        edges: kept(atlas.edges),
        regions: kept(atlas.regions),
    }
}

/// One picture painted into a scene, its text measured by the host.
pub fn paint(request: &PaintRequest, host: &dyn Measure) -> Scene {
    let ctx = Ctx {
        measurer: Measurer::new(host),
        icons: &request.icons,
    };
    let palette = &palette::PALETTE;
    let page = &request.page;
    let unsettled = standing::Unsettled::from(&page.unsettled);
    let painted = standing::Standings::from(if page.plain {
        None
    } else {
        page.standing.as_ref()
    });
    let held = standing::Standings::from(page.standing.as_ref());
    let (painting, reading, flowchart) = match &request.picture {
        Picture::Architecture(picture) => {
            let shapes =
                picture
                    .flowchart
                    .as_ref()
                    .map(|parts| flowchart_shapes::FlowchartShapes {
                        shapes: &parts.shapes,
                        palette,
                    });
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
                shapes: shapes
                    .as_ref()
                    .map(|shapes| -> &dyn architecture::Shapes { shapes }),
            };
            let mut painting = architecture::paint_architecture(
                &ctx,
                &picture.drawing,
                palette,
                &painted,
                &unsettled,
                &vocabulary,
                &held_page,
            );
            if let Some(parts) = &picture.flowchart {
                let subjects: HashSet<&str> = parts.subjects.iter().map(String::as_str).collect();
                painting.atlas = subject_atlas(painting.atlas, &subjects);
            }
            (
                painting,
                Some(picture.drawing.drawing.direction),
                picture.flowchart.is_some(),
            )
        }
        Picture::Sequence(picture) => (
            sequence::paint_sequence(&ctx, picture, palette, &painted, &unsettled, &held),
            None,
            false,
        ),
    };
    let framed = page::page_for(&ctx, painting, palette, page.unbuilt);
    let placed = export::placed_on(&framed.atlas);
    let framed = export::framed_for_export(
        &ctx,
        framed,
        page.frame.as_ref(),
        page.standing.as_ref(),
        page.plain,
        palette,
    );
    let body = if flowchart {
        concat(vec![flowchart_shapes::flowchart_definitions(), framed.body])
    } else {
        framed.body
    };
    let document = &request.document;
    Scene {
        width: framed.width,
        height: framed.height,
        title: export::exported_name(
            &page::planned_title(&document.name, page.unbuilt),
            page.frame.as_ref(),
        ),
        description: document.description.clone(),
        reading: reading.filter(|direction| *direction == ReadingDirection::Down),
        background: palette.background.to_owned(),
        definitions: definitions(palette),
        body,
        atlas: framed.atlas,
        placed,
    }
}

#[cfg(test)]
mod tests {
    //! What a scene is to a painter (ADR 0057): each group names the subject it
    //! draws and its role, and traffic is data, which each painter animates as
    //! it can, never an animation written into the scene.

    use super::paint;
    use crate::measure::fixed::Monospace;
    use crate::request::{PaintRequest, Standing};
    use crate::scene::{Item, Motion, Role, Scene, Subject, SubjectKind};

    /// Two cards, the first one added, and a line with traffic between them.
    const REQUEST: &str = r#"{
        "picture": {
            "grammar": "architecture",
            "drawing": {
                "direction": "down", "width": 200, "height": 260,
                "cards": [
                    {"measured": {"node": {"id": "a", "order": 0, "name": "Alpha"}, "width": 200, "height": 60, "headerHeight": 0, "runs": []},
                     "box": {"x": 0, "y": 0, "width": 200, "height": 60}, "depth": 0},
                    {"measured": {"node": {"id": "b", "order": 1, "name": "Beta"}, "width": 200, "height": 60, "headerHeight": 0, "runs": []},
                     "box": {"x": 0, "y": 200, "width": 200, "height": 60}, "depth": 0}
                ],
                "containers": [],
                "edges": [EDGE],
                "bridged": {"edges": [EDGE], "bridges": []}
            },
            "appearances": {
                "a": {"container": false, "icon": "RiServerLine", "typeName": "Service", "typeKind": "service", "drill": null},
                "b": {"container": false, "icon": "RiServerLine", "typeName": "Service", "typeKind": "service", "drill": null}
            },
            "lines": {"ab": {"name": "Calls", "dash": "solid", "arrowhead": "filled"}},
            "steps": [], "groups": {}, "farSize": 14
        },
        "page": {"standing": {"a": "added"}, "plain": false, "unsettled": [], "unbuilt": false},
        "document": {"name": "Two services", "fonts": "linked", "farViewSwapMs": 280},
        "icons": {}
    }"#;

    const EDGE: &str = r#"{"edge": {"id": "ab", "from": "a", "to": "b", "kind": "calls", "emphasis": "normal", "traffic": {"speed": 80, "volume": 1}},
        "curve": {"from": {"x": 100, "y": 60}, "segments": [{"kind": "line", "to": {"x": 100, "y": 200}}]}, "path": "M100,60 L100,200"}"#;

    /// Every item of a scene, depth first.
    fn every(items: &[Item]) -> Vec<&Item> {
        let mut all = Vec::new();
        for item in items {
            all.push(item);
            match item {
                Item::Group(group) => all.extend(every(&group.children)),
                Item::Element(element) => all.extend(every(&element.children)),
                _ => {}
            }
        }
        all
    }

    /// The scene of the test board.
    fn painted() -> Scene {
        let request: PaintRequest =
            serde_json::from_str(&REQUEST.replace("EDGE", EDGE)).expect("the request reads");
        paint(&request, &Monospace)
    }

    #[test]
    fn each_group_names_its_subject_and_role() {
        let scene = painted();
        let items = every(&scene.body);
        let drawn = |kind: SubjectKind, id: &str| -> Vec<(Role, Subject)> {
            items
                .iter()
                .filter_map(|item| match item {
                    Item::Group(group) => group
                        .subject
                        .as_ref()
                        .map(|subject| (group.role, subject.clone())),
                    _ => None,
                })
                .filter(|(_, subject)| subject.kind == kind && subject.id == id)
                .collect()
        };
        let added = Subject {
            kind: SubjectKind::Node,
            id: "a".to_owned(),
            standing: Some(Standing::Added),
        };
        assert!(drawn(SubjectKind::Node, "a").contains(&(Role::Card, added)));
        // A comparison states what moved, and what it does not mention stands unchanged.
        let kept = Subject {
            kind: SubjectKind::Node,
            id: "b".to_owned(),
            standing: Some(Standing::Unchanged),
        };
        assert!(drawn(SubjectKind::Node, "b").contains(&(Role::Card, kept)));
        assert!(
            drawn(SubjectKind::Edge, "ab")
                .iter()
                .any(|(role, _)| *role == Role::Line)
        );
    }

    #[test]
    fn traffic_is_data_the_painter_does_not_animate() {
        let scene = painted();
        let items = every(&scene.body);
        let traffic: Vec<_> = items
            .iter()
            .filter_map(|item| match item {
                Item::Traffic(mark) => Some(mark),
                _ => None,
            })
            .collect();
        assert_ne!(traffic.len(), 0, "the board draws its traffic");
        assert!(traffic.iter().all(|mark| !mark.route.segments.is_empty()
            && matches!(mark.motion, Motion::Steady { speed, .. } if speed > 0.0)));
        assert!(items.iter().all(
            |item| !matches!(item, Item::Element(element) if element.name.starts_with("animate"))
        ));
    }
}
