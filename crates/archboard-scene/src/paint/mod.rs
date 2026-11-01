//! The painter: a drawing turned into a scene, part by part, in the order the
//! picture is drawn.

use std::collections::{BTreeMap, HashSet};

use crate::drawing::{Node, Painted, ReadingDirection, TextRole};
use crate::measure::{FarCard, far_scale_for};
use crate::request::{ArchitecturePicture, PaintRequest, Picture, SequencePicture, Standing};
use crate::scene::{Atlas, Boxes, Definition, Head, HeadInk, Item, MarkerId, Scene};

mod appearance;
mod architecture;
mod build;
mod cards;
mod colour;
mod crossings;
pub mod design;
mod door;
mod drill_mark;
mod edge_line;
mod edge_tab;
mod export;
mod far_card;
mod far_view;
mod finish;
mod flowchart_shapes;
mod icons;
mod junctions;
mod legend_entries;
mod legend_symbols;
mod marks;
mod measured_cards;
mod page;
mod palette;
mod polygon;
mod ports;
mod relay;
mod sequence;
mod sequence_frames;
mod sequence_messages;
mod shadow;
mod shared_ink;
mod slab;
mod standing;
mod styles;
mod tag;
mod text_runs;
mod toggle;
mod traffic;
mod tray;

pub use legend_entries::{Applied, Drawn, PictureLegend, picture_legend};
pub use marks::{ViewerMarks, viewer_marks};

/// What every part of one picture is painted with.
#[derive(Debug)]
struct Ctx<'a> {
    /// Each icon's path data, by its export name.
    icons: &'a BTreeMap<String, Vec<String>>,
    /// The one type scale of the picture's far cards.
    far_scale: f64,
}

/// Every arrowhead marker and shared gradient a picture's body refers to.
fn definitions(palette: &palette::Palette) -> Vec<Definition> {
    use styles::{WEIGHTS, line_colour};

    let inks = [
        (HeadInk::Neutral, line_colour(palette, None)),
        (HeadInk::Added, line_colour(palette, Some(Standing::Added))),
        (
            HeadInk::Changed,
            line_colour(palette, Some(Standing::Changed)),
        ),
        (
            HeadInk::Removed,
            line_colour(palette, Some(Standing::Removed)),
        ),
        (HeadInk::Lit, palette.selection.clone()),
    ];
    let mut defined = Vec::new();
    for head in [Head::Filled, Head::Open] {
        for weight in WEIGHTS {
            for (ink, colour) in &inks {
                defined.push(Definition::Marker(edge_line::arrowhead_marker(
                    MarkerId::Shared {
                        head,
                        weight,
                        ink: *ink,
                    },
                    head,
                    weight,
                    colour,
                )));
            }
        }
    }
    defined.extend(slab::slab_definitions(palette));
    defined.extend(ports::port_definitions(palette));
    defined.push(tray::well_shade(palette));
    defined
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

/// The one type scale of a page's far cards. A door and a shape keep their own words.
fn far_scale(picture: &ArchitecturePicture, page: &Painted) -> f64 {
    let appearance = |id: &str| picture.appearances.get(id);
    let shaped =
        |id: &str| (picture.flowchart.as_ref()).is_some_and(|parts| parts.shapes.contains_key(id));
    let cards: Vec<&Node> = (page.drawing.cards.iter())
        .filter(|card| card.measured.node.door.is_none())
        .filter(|card| !shaped(&card.measured.node.id))
        .collect();
    let tags: Vec<Vec<&str>> = (cards.iter())
        .map(|card| {
            appearance(&card.measured.node.id).map_or_else(Vec::new, |look| {
                look.tags.iter().map(|tag| tag.name.as_str()).collect()
            })
        })
        .collect();
    let far: Vec<FarCard<'_>> = (cards.iter().zip(&tags))
        .map(|(card, tags)| {
            let node = &card.measured.node;
            FarCard {
                name: &node.name,
                path: node.code_path.as_deref(),
                gist: node.responsibility.as_deref(),
                tags,
                drills: appearance(&node.id).is_some_and(|look| look.drill.is_some()),
                lines: (card.measured.runs.iter())
                    .filter(|run| run.role == TextRole::Title)
                    .count(),
                width: card.bounds.width,
                height: card.bounds.height,
                chip_top: measured_cards::name_top(card),
            }
        })
        .collect();
    far_scale_for(&far)
}

/// The one type scale of a sequence's far cards.
fn sequence_far_scale(picture: &SequencePicture) -> f64 {
    let laid = picture.shown.as_ref().unwrap_or(&picture.laid);
    let cards: Vec<FarCard<'_>> = (laid.flows.iter())
        .flat_map(|flow| &flow.columns)
        .map(|column| FarCard {
            name: &column.card.node.name,
            path: column.card.node.code_path.as_deref(),
            gist: column.card.node.responsibility.as_deref(),
            tags: &[],
            drills: false,
            lines: 1,
            width: column.card.bounds.width,
            height: column.card.bounds.height,
            chip_top: cards::sequence_chip_top(
                !column.card.notes.is_empty(),
                column.card.bounds.height,
            ),
        })
        .collect();
    far_scale_for(&cards)
}

/// The one type scale of a picture's far cards.
fn picture_far_scale(picture: &Picture) -> f64 {
    match picture {
        Picture::Architecture(picture) => {
            far_scale(picture, picture.whole.as_ref().unwrap_or(&picture.drawing))
        }
        Picture::Sequence(picture) => sequence_far_scale(picture),
    }
}

/// One picture painted into a scene.
pub fn paint(request: &PaintRequest) -> Scene {
    let ctx = Ctx {
        icons: &request.icons,
        far_scale: picture_far_scale(&request.picture),
    };
    let palette = &palette::Palette::of_page();
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
            let page_drawing = picture.whole.as_ref().unwrap_or(&picture.drawing);
            let vocabulary = architecture::Vocabulary {
                appearances: &picture.appearances,
                lines: &picture.lines,
                steps: picture.steps.iter().map(String::as_str).collect(),
            };
            let held_page = architecture::HeldPage {
                drawing: page_drawing,
                // A flowchart's page holds the marks it draws.
                standings: if shapes.is_some() { &painted } else { &held },
                shapes: shapes.as_ref(),
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
    let framed = page::page_for(painting, palette, page.unbuilt);
    let placed = export::placed_on(&framed.atlas);
    let framed = export::framed_for_export(
        framed,
        page.frame.as_ref(),
        (page.standing.as_ref(), &placed),
        page.plain,
        palette,
    );
    let body = if flowchart {
        let mut body = vec![Item::Definitions {
            definitions: flowchart_shapes::flowchart_definitions(),
        }];
        body.extend(framed.body);
        body
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
        background: palette.background.clone(),
        definitions: definitions(palette),
        body,
        atlas: framed.atlas,
        placed,
    }
}

#[cfg(test)]
mod tests {
    //! What a scene is to a painter (ADR 0059): each group names the subject it
    //! draws and its role, and traffic is data, which each painter animates as
    //! it can, never an animation written into the scene.

    use super::paint;
    use crate::request::{PaintRequest, Standing};
    use crate::scene::{Item, Motion, Role, Scene, Subject, SubjectKind};

    /// The sort of role a group plays, its facts aside.
    fn sort(role: &Role) -> std::mem::Discriminant<Role> {
        std::mem::discriminant(role)
    }

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
            "steps": []
        },
        "page": {"standing": {"a": "added"}, "plain": false, "unsettled": [], "unbuilt": false},
        "document": {"name": "Two services", "farViewSwapMs": 280},
        "icons": {}
    }"#;

    const EDGE: &str = r#"{"edge": {"id": "ab", "from": "a", "to": "b", "kind": "calls", "emphasis": "normal", "traffic": {"speed": 80, "volume": 1}},
        "curve": {"from": {"x": 100, "y": 60}, "segments": [{"kind": "line", "to": {"x": 100, "y": 200}}]}}"#;

    /// Every item of a scene, depth first.
    fn every(items: &[Item]) -> Vec<&Item> {
        let mut all = Vec::new();
        for item in items {
            all.push(item);
            match item {
                Item::Group(group) => all.extend(every(&group.items)),
                Item::Viewport(viewport) => all.extend(every(&viewport.items)),
                _ => {}
            }
        }
        all
    }

    /// The scene of the test board.
    fn painted() -> Scene {
        let request: PaintRequest =
            serde_json::from_str(&REQUEST.replace("EDGE", EDGE)).expect("the request reads");
        paint(&request)
    }

    #[test]
    fn each_group_names_its_subject_and_role() {
        let scene = painted();
        let items = every(&scene.body);
        let drawn = |kind: SubjectKind, id: &str| -> Vec<(&Role, Subject)> {
            items
                .iter()
                .filter_map(|item| match item {
                    Item::Group(group) => group
                        .subject
                        .as_ref()
                        .map(|subject| (&group.role, subject.clone())),
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
        let card = |(role, subject): &(&Role, Subject), wanted: &Subject| {
            matches!(role, Role::Card(_)) && subject == wanted
        };
        assert!(
            drawn(SubjectKind::Node, "a")
                .iter()
                .any(|drawn| card(drawn, &added))
        );
        // A comparison states what moved, and what it does not mention stands unchanged.
        let kept = Subject {
            kind: SubjectKind::Node,
            id: "b".to_owned(),
            standing: Some(Standing::Unchanged),
        };
        assert!(
            drawn(SubjectKind::Node, "b")
                .iter()
                .any(|drawn| card(drawn, &kept))
        );
        assert!(
            drawn(SubjectKind::Edge, "ab")
                .iter()
                .any(|(role, _)| sort(role) == sort(&Role::Line(None)))
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
    }
}
