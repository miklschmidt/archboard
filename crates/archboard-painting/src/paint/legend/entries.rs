//! What an exported picture's legend lists, read back from the drawn scene
//! (`archboard_scene::legend`): the marks a comparison puts on what it changed,
//! and the lists of entries those and the picture's samples make (TASK-468).

use std::collections::{BTreeMap, HashSet};

use archboard_scene::legend::{Applied, PictureLegend, picture_legend};
use archboard_scene::request::Standing;
use archboard_scene::scene::{EntryKind, Item};

/// What one legend entry keys, with what its symbol is drawn from.
pub(super) enum Keys {
    /// A comparison's mark, and how many placed subjects carry it.
    Mark(Standing, usize),
    Kind(Applied),
    Relationship(Applied),
    Emphasis,
    Traffic,
}

impl Keys {
    /// What sort of entry it is.
    pub(super) fn kind(&self) -> EntryKind {
        match self {
            Keys::Mark(..) => EntryKind::Mark,
            Keys::Kind(_) => EntryKind::Kind,
            Keys::Relationship(_) => EntryKind::Relationship,
            Keys::Emphasis => EntryKind::Emphasis,
            Keys::Traffic => EntryKind::Traffic,
        }
    }
}

/// One entry: what it keys, and its words.
pub(super) struct Entry {
    pub(super) keys: Keys,
    pub(super) words: String,
}

impl Entry {
    /// The count beside the entry's words: a mark's.
    pub(super) fn count(&self) -> Option<usize> {
        match self.keys {
            Keys::Mark(_, count) => Some(count),
            _ => None,
        }
    }
}

/// How many placed subjects carry each mark, in the key's order; none that no subject carries.
pub(super) fn mark_counts(
    standing: Option<&BTreeMap<String, Standing>>,
    placed: &HashSet<&str>,
) -> Vec<(Standing, &'static str, usize)> {
    let values: Vec<Standing> = standing
        .map(|stated| {
            stated
                .iter()
                .filter(|(id, _)| placed.contains(id.as_str()))
                .map(|(_, standing)| *standing)
                .collect()
        })
        .unwrap_or_default();
    [
        (Standing::Added, "Added"),
        (Standing::Changed, "Changed"),
        (Standing::Removed, "Removed"),
    ]
    .into_iter()
    .map(|(standing, word)| {
        (
            standing,
            word,
            values.iter().filter(|one| **one == standing).count(),
        )
    })
    .filter(|(_, _, count)| *count > 0)
    .collect()
}

/// The legend's lists, empty ones left out: the comparison's marks, the part
/// kinds drawn, and the relationship kinds drawn followed by emphasis and traffic.
pub(super) fn entries_of(
    body: &[Item],
    marks: &[(Standing, &'static str, usize)],
) -> Vec<Vec<Entry>> {
    let PictureLegend {
        kinds,
        relationships,
        ..
    } = picture_legend(body);
    let kinds = kinds.into_iter().map(|(_, applied)| applied);
    let relationships: Vec<Applied> = relationships
        .into_iter()
        .map(|(_, applied)| applied)
        .collect();
    let mut lists = vec![
        marks
            .iter()
            .map(|(standing, word, count)| Entry {
                keys: Keys::Mark(*standing, *count),
                words: (*word).to_owned(),
            })
            .collect::<Vec<_>>(),
        kinds
            .into_iter()
            .map(|applied| Entry {
                words: applied.type_name().to_owned(),
                keys: Keys::Kind(applied),
            })
            .collect(),
    ];
    let mut lined: Vec<Entry> = Vec::new();
    let any = !relationships.is_empty();
    for applied in relationships {
        lined.push(Entry {
            words: applied.type_name().to_owned(),
            keys: Keys::Relationship(applied),
        });
    }
    if any {
        lined.push(Entry {
            keys: Keys::Emphasis,
            words: "More emphasis".to_owned(),
        });
        lined.push(Entry {
            keys: Keys::Traffic,
            words: "Illustrated traffic".to_owned(),
        });
    }
    lists.push(lined);
    lists.retain(|list| !list.is_empty());
    lists
}
