//! The definitions a move draws with: the masks, clips, arrowheads and gradients
//! that its two scenes define, wherever they stand.

use std::collections::HashMap;

use archboard_scene::scene::{Definition, Item, Mask, Scene, each_list, every};

/// Every definition among some items, to any depth.
fn defined_in(items: &[Item], found: &mut Vec<Definition>) {
    for item in every(items) {
        if let Item::Definitions { definitions } = item {
            found.extend(definitions.iter().cloned());
        }
    }
}

/// Drop definitions from a body whose complete definitions were lifted into
/// the scene. A body's old mask must not replace the mask of the current frame.
pub(super) fn clear_definitions(items: &mut Vec<Item>) {
    each_list(items, &mut |list| {
        list.retain(|item| !matches!(item, Item::Definitions { .. }));
    });
}

/// Every mask of a scene, by the name of its line.
pub(super) fn masks_of(scene: &Scene) -> HashMap<String, Mask> {
    let mut known = scene.definitions.clone();
    defined_in(&scene.body, &mut known);
    known
        .into_iter()
        .filter_map(|definition| match definition {
            Definition::Mask(mask) => Some((mask.id.line.clone(), mask)),
            _ => None,
        })
        .collect()
}

/// Every definition of the next scene, wherever it stands, and the last scene's
/// beside them: its masks and clips are renamed already, and its arrowheads and
/// gradients are named by what they are, so the next scene's own stand for the
/// same ones.
pub(super) fn borrowed_definitions(last: &Scene, next: &Scene) -> Vec<Definition> {
    let mut known = next.definitions.clone();
    defined_in(&next.body, &mut known);
    let mut kept = known.clone();
    let mut theirs = last.definitions.clone();
    defined_in(&last.body, &mut theirs);
    for definition in theirs {
        let own = match &definition {
            Definition::Marker(marker) => known
                .iter()
                .any(|d| matches!(d, Definition::Marker(m) if m.id == marker.id)),
            Definition::Gradient(gradient) => known
                .iter()
                .any(|d| matches!(d, Definition::Gradient(g) if g.id == gradient.id)),
            Definition::Mask(_) | Definition::Clip(_) => false,
        };
        if !own {
            kept.push(definition);
        }
    }
    kept
}
