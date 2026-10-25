//! What an exported picture's legend lists, read back from the drawn scene: the
//! appearance each subject was drawn with, the distinct samples among them, the
//! marks a comparison puts on what it changed, and the lists of entries those
//! make (TASK-468).

use std::collections::{BTreeMap, HashSet};

use crate::request::{Arrowhead, Dash, NodeAppearance, PaletteColor, Standing};
use crate::scene::{EntryKind, Group, Icon, Item, LineFacts, Role, SubjectKind};

/// How the picture drew a subject: as a part of some appearance, or as a
/// relationship's line.
#[derive(Clone, Debug)]
pub enum Drawn {
    /// A part, a card or a container.
    Part(NodeAppearance),
    /// A relationship's line.
    Line(LineFacts),
}

/// What a picture draws a subject as, read back from the drawn scene.
#[derive(Clone, Debug)]
pub struct Applied {
    /// How it was drawn.
    pub drawn: Drawn,
    /// The icon its chip draws, when it draws one.
    pub icon: Option<Icon>,
}

/// What two subjects share when one sample keys them both: the icon, the
/// kind, its name, the kind's colour, the line's colour, dash and arrowhead.
type SampleKey<'a> = (
    Option<&'a Icon>,
    &'a str,
    &'a str,
    Option<PaletteColor>,
    Option<PaletteColor>,
    Dash,
    Arrowhead,
);

impl Applied {
    /// What the subject's kind is called.
    pub fn type_name(&self) -> &str {
        match &self.drawn {
            Drawn::Part(appearance) => &appearance.type_name,
            Drawn::Line(facts) => &facts.appearance.name,
        }
    }

    /// What two subjects share when one sample keys them both.
    fn sample_key(&self) -> SampleKey<'_> {
        let icon = self.icon.as_ref();
        match &self.drawn {
            Drawn::Part(appearance) => (
                icon,
                &appearance.type_kind,
                &appearance.type_name,
                appearance.type_color,
                None,
                Dash::Solid,
                Arrowhead::Filled,
            ),
            Drawn::Line(facts) => (
                icon,
                &facts.kind,
                &facts.appearance.name,
                None,
                facts.appearance.color,
                facts.appearance.dash,
                facts.appearance.arrowhead,
            ),
        }
    }
}

/// How a group says its subject was drawn, when it says so.
fn drawn_by(group: &Group) -> Option<Drawn> {
    match &group.role {
        Role::Card(appearance) | Role::Header(appearance) | Role::Frame(Some(appearance)) => {
            Some(Drawn::Part(appearance.as_ref().clone()))
        }
        Role::Line(Some(facts)) => Some(Drawn::Line(facts.as_ref().clone())),
        _ => None,
    }
}

/// The scene as it is walked: the subjects of the open groups, and every
/// subject met.
struct Walk {
    open: Vec<Option<usize>>,
    met: Vec<(String, Applied)>,
}

impl Walk {
    /// One item, inside an icon's group or not.
    fn visit(&mut self, item: &Item, in_icon: bool) {
        match item {
            Item::Group(group) => self.group(group),
            Item::Viewport(viewport) => {
                for child in &viewport.items {
                    self.visit(child, false);
                }
            }
            Item::Icon(icon) if in_icon => {
                for at in self.open.iter().flatten() {
                    self.met[*at].1.icon.get_or_insert_with(|| icon.clone());
                }
            }
            _ => {}
        }
    }

    /// A group and what it holds, the subject it draws met if it says how it was drawn.
    fn group(&mut self, group: &Group) {
        // A group's region is named by its group's id, not a subject id, so
        // the page's key never reads it.
        let subject = group
            .subject
            .as_ref()
            .filter(|subject| subject.kind != SubjectKind::GroupRegion)
            .zip(drawn_by(group))
            .map(|(subject, drawn)| {
                self.met
                    .push((subject.id.clone(), Applied { drawn, icon: None }));
                self.met.len() - 1
            });
        self.open.push(subject);
        let icon = matches!(group.role, Role::Icon(Some(_)));
        for child in &group.items {
            self.visit(child, icon);
        }
        self.open.pop();
    }
}

/// Every subject the scene draws with an appearance, and the icon inside it.
fn picture_appearances(body: &[Item]) -> Vec<(String, Applied)> {
    let mut walk = Walk {
        open: Vec::new(),
        met: Vec::new(),
    };
    for item in body {
        walk.visit(item, false);
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
fn distinct_samples(appearances: Vec<(String, Applied)>) -> Vec<(String, Applied)> {
    let mut samples: Vec<(String, Applied)> = Vec::new();
    for sample in appearances {
        match samples
            .iter_mut()
            .find(|held| held.1.sample_key() == sample.1.sample_key())
        {
            Some(entry) => *entry = sample,
            None => samples.push(sample),
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

/// What a picture's key lists, read back from its scene: each subject it
/// draws with an appearance, in the order it draws them, and one sample of
/// each distinct part kind and relationship kind among them.
#[derive(Clone, Debug)]
pub struct PictureKey {
    /// Each subject and what it was drawn as, where it was first met, as it was last met.
    pub subjects: Vec<(String, Applied)>,
    /// One sample of each distinct part kind drawn, and the last subject drawn so.
    pub kinds: Vec<(String, Applied)>,
    /// One sample of each distinct relationship kind drawn, likewise.
    pub relationships: Vec<(String, Applied)>,
}

/// What a picture's key lists, read back from the items of its body.
pub fn picture_key(body: &[Item]) -> PictureKey {
    let subjects = picture_appearances(body);
    let of = |part: bool| {
        distinct_samples(
            subjects
                .iter()
                .filter(|(_, one)| matches!(one.drawn, Drawn::Part(_)) == part)
                .cloned()
                .collect(),
        )
    };
    let kinds = of(true);
    let relationships = of(false);
    PictureKey {
        subjects,
        kinds,
        relationships,
    }
}

/// The legend's lists, empty ones left out: the comparison's marks, the part
/// kinds drawn, and the relationship kinds drawn followed by emphasis and traffic.
pub(super) fn entries_of(
    body: &[Item],
    marks: &[(Standing, &'static str, usize)],
) -> Vec<Vec<Entry>> {
    let PictureKey {
        kinds,
        relationships,
        ..
    } = picture_key(body);
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
