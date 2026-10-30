//! The crossing pass and the painter agree on a shared trunk's hop: every
//! route follows the arc, but only its drawer shows the ink.

use archboard_scene::drawing::{Bridged, EdgeFacts, PaintedDrawing};
use archboard_scene::paint::paint;
use archboard_scene::request::PaintRequest;
use archboard_scene::scene::{Colour, Definition, Geometry, Item, Paint, PathStep, Scene};
use serde_json::json;

use super::Drawing;

/// Paint the crossing pass's routes with their ordinary call appearance.
fn picture(drawing: &Drawing, bridged: &Bridged<EdgeFacts>) -> Scene {
    let lines: serde_json::Map<String, serde_json::Value> = drawing
        .edges
        .iter()
        .map(|edge| {
            (
                edge.edge.id.clone(),
                json!({
                    "name": "Call", "dash": "solid", "arrowhead": "filled",
                }),
            )
        })
        .collect();
    let request: PaintRequest = serde_json::from_value(json!({
        "picture": {
            "grammar": "architecture", "drawing": PaintedDrawing { drawing: drawing.clone(), bridged: bridged.clone() },
            "appearances": {}, "lines": lines, "steps": [], "groups": {},
        },
        "page": { "plain": true, "unsettled": [], "unbuilt": false },
        "document": { "name": "Shared hop", "farViewSwapMs": 0 }, "icons": {},
    })).unwrap();
    paint(&request)
}

/// Every definition kept among the scene's items.
fn definitions(items: &[Item]) -> Vec<&Definition> {
    items
        .iter()
        .flat_map(|item| match item {
            Item::Definitions { definitions } => definitions.iter().collect(),
            Item::Group(group) => definitions(&group.items),
            Item::Viewport(viewport) => definitions(&viewport.items),
            _ => Vec::new(),
        })
        .collect()
}

/// Whether a line is drawn through its mask.
fn uses_mask(items: &[Item], id: &str) -> bool {
    items.iter().any(|item| match item {
        Item::Group(group) => {
            group.mask.as_ref().is_some_and(|mask| mask.line == id) || uses_mask(&group.items, id)
        }
        Item::Viewport(viewport) => uses_mask(&viewport.items, id),
        _ => false,
    })
}

/// The shared route's mask removes the curved ink up to its hop's crest.
pub(super) fn hides_hop(drawing: &Drawing, bridged: &Bridged<EdgeFacts>, id: &str, crest: f64) {
    let scene = picture(drawing, bridged);
    let mask = scene
        .definitions
        .iter()
        .chain(definitions(&scene.body))
        .find_map(|definition| match definition {
            Definition::Mask(mask) if mask.id.line == id => Some(mask),
            _ => None,
        })
        .expect("the shared route has a mask");
    assert!(uses_mask(&scene.body, id));
    assert!(mask.shapes.iter().any(|shape| {
        let black = shape.stroke.as_ref().is_some_and(|stroke| {
            stroke.paint
                == Paint::Colour {
                    colour: Colour::Black,
                }
        });
        let Geometry::Path { steps } = &shape.geometry else {
            return false;
        };
        black
            && steps
                .iter()
                .any(|step| matches!(step, PathStep::Cubic { to, .. } if to.y <= crest))
    }));
}
