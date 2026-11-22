//! What the painter's tests share: a painting of a plain white page.

use std::collections::BTreeMap;

use archboard_scene::scene::{Atlas, Colour, Item, Painting, Scene};

/// A 400 by 400 white page that draws this body and has no icons.
pub(crate) fn painting(body: Vec<Item>) -> Painting {
    Painting {
        scene: Scene {
            width: 400.0,
            height: 400.0,
            title: String::new(),
            description: None,
            reading: None,
            background: Colour::White,
            definitions: Vec::new(),
            body,
            atlas: Atlas::default(),
            placed: Vec::new(),
        },
        icons: BTreeMap::new(),
    }
}
