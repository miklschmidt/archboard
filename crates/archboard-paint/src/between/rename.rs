//! The last scene's masks and clips, under names that cannot collide with the
//! next scene's. Both scenes name a mask by its line and a clip by its card,
//! and a line that both draw has a mask in each. Rewriting the last scene's
//! once keeps the two apart for the whole move.

use archboard_scene::scene::{ClipId, Definition, Item, MaskId, Scene, Shape};

/// What the last scene's ids begin with. A subject's id is a short run of
/// letters and digits, so no id of the next scene begins with it.
const PREFIX: &str = "last:";

fn mask_id(id: &mut MaskId) {
    id.line.insert_str(0, PREFIX);
}

fn clip_id(id: &mut ClipId) {
    id.card.insert_str(0, PREFIX);
}

fn shapes(shapes: &mut [Shape]) {
    for shape in shapes {
        if let Some(clip) = &mut shape.clip {
            clip_id(clip);
        }
    }
}

/// Rename what some definitions name.
pub(super) fn definitions(definitions: &mut [Definition]) {
    for definition in definitions {
        match definition {
            Definition::Mask(mask) => {
                mask_id(&mut mask.id);
                shapes(&mut mask.shapes);
            }
            Definition::Clip(clip) => clip_id(&mut clip.id),
            Definition::Marker(marker) => shapes(&mut marker.shapes),
            Definition::Gradient(_) => {}
        }
    }
}

/// Rename what some items name or define.
fn items(items: &mut [Item]) {
    for item in items {
        match item {
            Item::Group(group) => {
                if let Some(mask) = &mut group.mask {
                    mask_id(mask);
                }
                self::items(&mut group.items);
            }
            Item::Shape(shape) => {
                if let Some(clip) = &mut shape.clip {
                    clip_id(clip);
                }
            }
            Item::Viewport(viewport) => self::items(&mut viewport.items),
            Item::Definitions { definitions } => self::definitions(definitions),
            Item::Text(_) | Item::Icon(_) | Item::Traffic(_) | Item::Break => {}
        }
    }
}

/// Rename every mask and clip a scene defines and refers to.
pub(super) fn scene(scene: &mut Scene) {
    definitions(&mut scene.definitions);
    items(&mut scene.body);
}

#[cfg(test)]
mod tests {
    use archboard_scene::geometry::Rect;
    use archboard_scene::scene::{
        Atlas, Clip, ClipId, Colour, Definition, Group, Item, Mask, MaskId, Role, Scene, Shape,
    };

    fn rect() -> Rect {
        Rect {
            x: 0.0,
            y: 0.0,
            width: 1.0,
            height: 1.0,
        }
    }

    #[test]
    fn a_renamed_scene_refers_to_the_names_it_defines() {
        let mut clipped = Shape::rect(archboard_scene::scene::Purpose::Plate, rect(), None);
        clipped.clip = Some(ClipId { card: "a".into() });
        let mut group = Group::new(Role::Marks, vec![Item::Shape(clipped)]);
        group.mask = Some(MaskId { line: "a".into() });
        let mut scene = Scene {
            width: 1.0,
            height: 1.0,
            title: String::new(),
            description: None,
            reading: None,
            background: Colour::White,
            definitions: vec![
                Definition::Mask(Mask {
                    id: MaskId { line: "a".into() },
                    bounds: rect(),
                    shapes: Vec::new(),
                }),
                Definition::Clip(Clip {
                    id: ClipId { card: "a".into() },
                    outline: Vec::new(),
                }),
            ],
            body: vec![Item::Group(group)],
            atlas: Atlas::default(),
            placed: Vec::new(),
        };
        super::scene(&mut scene);
        let Definition::Mask(mask) = &scene.definitions[0] else {
            panic!("a mask")
        };
        let Item::Group(group) = &scene.body[0] else {
            panic!("a group")
        };
        assert_eq!(group.mask.as_ref(), Some(&mask.id));
        assert_ne!(mask.id.line, "a");
        let Definition::Clip(clip) = &scene.definitions[1] else {
            panic!("a clip")
        };
        let Item::Shape(shape) = &group.items[0] else {
            panic!("a shape")
        };
        assert_eq!(shape.clip.as_ref(), Some(&clip.id));
    }
}
