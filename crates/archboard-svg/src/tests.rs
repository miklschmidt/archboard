//! Standalone theme discovery reads only the CSS that the writer emits.

use std::collections::BTreeMap;

use archboard_scene::drawing::{DiagramFont, FontFamily};
use archboard_scene::geometry::Point;
use archboard_scene::request::{DocumentRequest, StandaloneTheme, ThemeColors};
use archboard_scene::scene::{Atlas, Group, Item, Role, Scene, Text, Token};

use crate::document;

/// A standalone picture with author text in both a label and an attribute.
fn labelled(words: &str) -> String {
    let scene = Scene {
        width: 200.0,
        height: 100.0,
        title: words.to_owned(),
        description: Some(words.to_owned()),
        reading: None,
        background: Token::Background.into(),
        definitions: Vec::new(),
        body: vec![Item::Group(Group::new(
            Role::Icon(Some(words.to_owned())),
            vec![Item::Text(Text::set(
                Point { x: 10.0, y: 20.0 },
                DiagramFont {
                    family: FontFamily::Sans,
                    weight: 400,
                },
                12.0,
                Token::DiagramSelection.into(),
                words,
            ))],
        ))],
        atlas: Atlas::default(),
        placed: Vec::new(),
    };
    let colours = BTreeMap::from([
        ("--background".to_owned(), "white".to_owned()),
        ("--diagram-selection".to_owned(), "blue".to_owned()),
    ]);
    document(
        &scene,
        &DocumentRequest {
            name: words.to_owned(),
            description: None,
            far_view_swap_ms: 280.0,
            theme: Some(StandaloneTheme::Light),
            theme_colors: Some(ThemeColors {
                light: colours.clone(),
                dark: colours,
            }),
        },
        &BTreeMap::new(),
    )
    .expect("author text cannot add a theme dependency")
}

#[test]
fn author_text_cannot_reference_or_define_theme_properties() {
    for words in [
        "var(--not-a-theme-colour)",
        ";--background:red",
        r#" style="--background:red;fill:var(--not-a-theme-colour)""#,
        "<style>text{fill:var(--not-a-theme-colour)}</style>",
    ] {
        let svg = labelled(words);
        let root = svg.split_once('>').expect("the document has a root").0;
        assert!(root.contains("--background:white"));
    }
}
