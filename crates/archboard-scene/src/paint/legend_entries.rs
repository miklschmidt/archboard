//! What an exported picture's legend lists, read back from the drawn scene: the
//! appearance each subject was drawn with, the distinct samples among them, the
//! marks a comparison puts on what it changed, and the lists of entries those
//! make (TASK-468).

use std::collections::{BTreeMap, HashSet};

use crate::markup::spelt;
use crate::request::Standing;
use crate::scene::{Item, SubjectKind};

/// What a picture draws a subject as, read back from the drawn scene.
#[derive(Clone, Debug)]
pub(super) struct Applied {
    pub(super) type_name: String,
    pub(super) type_kind: String,
    pub(super) icon: Option<Item>,
    pub(super) depiction: String,
    pub(super) type_color: String,
    pub(super) line_color: String,
    pub(super) dash: String,
    pub(super) arrowhead: String,
}

impl Applied {
    /// What two subjects share when one sample keys them both.
    fn sample_key(&self) -> (Option<&Item>, [&str; 6]) {
        (
            self.icon.as_ref(),
            [
                &self.type_kind,
                &self.type_name,
                &self.type_color,
                &self.line_color,
                &self.dash,
                &self.arrowhead,
            ],
        )
    }
}

/// A value as a reader of the written document reads it back: without the
/// characters XML cannot hold.
fn read_back(spelt: &str) -> String {
    spelt
        .chars()
        .filter(|character| !crate::markup::forbidden(*character))
        .collect()
}

/// One open element as the scene is walked: whether it holds an icon, and the subject it drew.
struct Open {
    icon: bool,
    subject: Option<usize>,
}

/// Every subject the scene draws with an appearance, and the icon markup inside it.
fn picture_appearances(body: &[Item]) -> Vec<(String, Applied)> {
    struct Walk {
        open: Vec<Open>,
        met: Vec<(String, Applied)>,
    }
    fn visit(walk: &mut Walk, item: &Item) {
        let (name, subject, pairs, children, empty) = match item {
            Item::Group(group) => (
                "g",
                group.subject.as_ref(),
                &group.attrs,
                &group.children,
                false,
            ),
            Item::Element(element) => (
                element.name,
                None,
                &element.attrs,
                &element.children,
                element.empty,
            ),
            _ => return,
        };
        // A group's region is written with its group's id, not a subject id,
        // so the page's key never reads it.
        let id = subject
            .filter(|subject| subject.kind != SubjectKind::GroupRegion)
            .map(|subject| read_back(&subject.id));
        let read = |wanted: &str| {
            pairs
                .iter()
                .find(|(held, _)| *held == wanted)
                .map(|(_, value)| read_back(&spelt(value)))
        };
        let subject = id.zip(read("data-type-name")).map(|(id, type_name)| {
            walk.met.push((
                id,
                Applied {
                    type_name,
                    type_kind: read("data-type-kind").unwrap_or_default(),
                    icon: None,

                    depiction: read("data-depiction").unwrap_or_default(),
                    type_color: read("data-type-color").unwrap_or_else(|| "neutral".to_owned()),
                    line_color: read("data-line-color").unwrap_or_else(|| "neutral".to_owned()),
                    dash: read("data-line-dash").unwrap_or_else(|| "solid".to_owned()),
                    arrowhead: read("data-arrowhead").unwrap_or_else(|| "filled".to_owned()),
                },
            ));
            walk.met.len() - 1
        });
        if empty {
            return;
        }
        walk.open.push(Open {
            icon: read("data-type-icon").is_some(),
            subject,
        });
        for child in children {
            visit(walk, child);
        }
        walk.open.pop();
        if name == "svg" {
            adopt_icon(walk, item);
        }
    }
    /// An icon's markup, as the icon of every open subject without one yet,
    /// when it stands inside a group that draws an icon.
    fn adopt_icon(walk: &mut Walk, item: &Item) {
        if !walk.open.last().is_some_and(|parent| parent.icon) {
            return;
        }
        for open in &walk.open {
            if let Some(at) = open.subject
                && walk.met[at].1.icon.is_none()
            {
                walk.met[at].1.icon = Some(item.clone());
            }
        }
    }
    let mut walk = Walk {
        open: Vec::new(),
        met: Vec::new(),
    };
    for item in body {
        visit(&mut walk, item);
    }
    // One entry per subject, where it was first met, with what it was last drawn as.
    let mut appearances: Vec<(String, Applied)> = Vec::new();
    for (id, applied) in walk.met {
        match appearances.iter_mut().find(|(held, _)| *held == id) {
            Some(entry) => entry.1 = applied,
            None => appearances.push((id, applied)),
        }
    }
    appearances
}

/// One sample of each distinct appearance, where it was first met, as it was last met.
fn distinct_samples(appearances: Vec<Applied>) -> Vec<Applied> {
    let mut samples: Vec<Applied> = Vec::new();
    for applied in appearances {
        match samples
            .iter_mut()
            .find(|held| held.sample_key() == applied.sample_key())
        {
            Some(entry) => *entry = applied,
            None => samples.push(applied),
        }
    }
    samples
}

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
    /// The word an entry's `data-legend-entry` attribute names its sort by.
    pub(super) fn as_str(&self) -> &'static str {
        match self {
            Keys::Mark(..) => "mark",
            Keys::Kind(_) => "kind",
            Keys::Relationship(_) => "relationship",
            Keys::Emphasis => "emphasis",
            Keys::Traffic => "traffic",
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
    let appearances: Vec<Applied> = picture_appearances(body)
        .into_iter()
        .map(|(_, applied)| applied)
        .collect();
    let kinds = distinct_samples(
        appearances
            .iter()
            .filter(|one| !one.depiction.is_empty())
            .cloned()
            .collect(),
    );
    let relationships = distinct_samples(
        appearances
            .into_iter()
            .filter(|one| one.depiction.is_empty())
            .collect(),
    );
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
                words: applied.type_name.clone(),
                keys: Keys::Kind(applied),
            })
            .collect(),
    ];
    let mut lined: Vec<Entry> = Vec::new();
    let any = !relationships.is_empty();
    for applied in relationships {
        lined.push(Entry {
            words: applied.type_name.clone(),
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
