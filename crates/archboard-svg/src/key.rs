//! What a picture's key lists, as a pane reads it beside the document: each
//! subject the picture draws with the appearance it was drawn with, and one
//! sample of each part kind and relationship kind it draws (TASK-383). The
//! samples are the scene's own (`archboard_scene::paint::picture_key`), the
//! rule an exported legend lists by, and every fact is spelt as the document
//! writes it on the subject's group, its icon as the document draws it.

use std::collections::BTreeMap;

use archboard_scene::names::word;
use archboard_scene::paint::{Applied, Drawn, picture_key};
use archboard_scene::scene::Item;
use serde::Serialize;
use ts_rs::TS;

use crate::groups::colour_word;
use crate::write::write_icon;

/// How a picture drew one subject, each fact as its group says it.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct AppliedAppearance {
    /// The subject.
    pub id: String,
    /// What its kind is called.
    pub type_name: String,
    /// The key of its kind in the vault's policy.
    pub type_kind: String,
    /// The icon's own markup, as the picture draws it; empty for a line.
    pub icon_svg: String,
    /// `card` or `container` for a part; empty for a line.
    pub depiction: String,
    /// The colour of a part's kind, `neutral` for none and for a line.
    pub type_color: String,
    /// A line's colour, `neutral` for none and for a part.
    pub line_color: String,
    /// A line's dash, `solid` for a part.
    pub dash: String,
    /// A line's arrowhead, `filled` for a part.
    pub arrowhead: String,
}

/// What a picture's key lists: only what the picture draws, in drawing order.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, TS)]
pub struct PictureKey {
    /// One sample of each part kind the picture draws.
    pub kinds: Vec<AppliedAppearance>,
    /// One sample of each relationship kind the picture draws.
    pub relationships: Vec<AppliedAppearance>,
}

/// One subject's appearance, spelt as the document writes it.
fn spelt(id: &str, applied: &Applied, icons: &BTreeMap<String, Vec<String>>) -> AppliedAppearance {
    let mut icon_svg = String::new();
    if let Some(icon) = &applied.icon {
        write_icon(icon, icons, &mut icon_svg);
    }
    let (type_kind, depiction, type_color, line_color, dash, arrowhead) = match &applied.drawn {
        Drawn::Part(look) => (
            look.type_kind.clone(),
            if look.container { "container" } else { "card" },
            colour_word(look.type_color),
            "neutral",
            "solid",
            "filled",
        ),
        Drawn::Line(facts) => (
            facts.kind.clone(),
            "",
            "neutral",
            colour_word(facts.appearance.color),
            word(&facts.appearance.dash),
            word(&facts.appearance.arrowhead),
        ),
    };
    AppliedAppearance {
        id: id.to_owned(),
        type_name: applied.type_name().to_owned(),
        type_kind,
        icon_svg,
        depiction: depiction.to_owned(),
        type_color: type_color.to_owned(),
        line_color: line_color.to_owned(),
        dash: dash.to_owned(),
        arrowhead: arrowhead.to_owned(),
    }
}

/// Each subject a picture's body draws with its appearance, in drawing order,
/// and its key, or none when it draws no subject of a kind.
pub fn appearances(
    body: &[Item],
    icons: &BTreeMap<String, Vec<String>>,
) -> (Vec<AppliedAppearance>, Option<PictureKey>) {
    let key = picture_key(body);
    let subjects = key
        .subjects
        .iter()
        .map(|(id, applied)| spelt(id, applied, icons))
        .collect();
    let samples = |of: &[(String, Applied)]| -> Vec<AppliedAppearance> {
        of.iter()
            .map(|(id, applied)| spelt(id, applied, icons))
            .collect()
    };
    let listed = (!key.kinds.is_empty() || !key.relationships.is_empty()).then(|| PictureKey {
        kinds: samples(&key.kinds),
        relationships: samples(&key.relationships),
    });
    (subjects, listed)
}
