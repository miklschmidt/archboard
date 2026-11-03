//! The order a list of items is drawn in. A picture draws its parts in layers,
//! so a selected line ran under the lines and labels drawn after it. The SVG
//! viewer drew every selected card, line and step last among its siblings, in
//! picture order. A flow's head that is held down draws last too, because the
//! messages it stands over are drawn after it. A line and its traffic go up
//! only to just before the next card, so a selected line's ring and its pulses
//! never lie on the face of a card it runs into. A container, a flow and a
//! lifeline never rise, because each runs under what it holds or crosses.

use std::{slice, vec};

use archboard_scene::scene::{Group, Item, Role, SubjectKind};

use crate::presentation::Presentation;

/// Items in the order they are drawn.
pub(crate) enum Sequence<'a> {
    /// As the picture has them.
    Plain(slice::Iter<'a, Item>),
    /// With some raised.
    Raised(vec::IntoIter<&'a Item>),
}

impl<'a> Iterator for Sequence<'a> {
    type Item = &'a Item;

    fn next(&mut self) -> Option<&'a Item> {
        match self {
            Sequence::Plain(items) => items.next(),
            Sequence::Raised(items) => items.next(),
        }
    }
}

/// Whether a group is a part drawn as a card.
fn is_card(group: &Group) -> bool {
    match &group.role {
        Role::Card(look) | Role::Header(look) | Role::Frame(Some(look)) => !look.container,
        _ => false,
    }
}

/// Whether a group draws a line, or the traffic that rides one.
fn is_line(group: &Group) -> bool {
    matches!(group.role, Role::Traffic(_))
        || group
            .subject
            .as_ref()
            .is_some_and(|subject| subject.kind == SubjectKind::Edge)
}

/// Whether a group draws over the rest of its siblings now.
fn rises(group: &Group, presentation: &Presentation) -> bool {
    let selected = |id: &String| presentation.selected.contains(id);
    match &group.role {
        Role::FlowHead(flow) => presentation.drop_of(flow) > 0.0,
        Role::Traffic(line) => selected(line),
        _ => group.subject.as_ref().is_some_and(|subject| {
            selected(&subject.id)
                && (matches!(subject.kind, SubjectKind::Edge | SubjectKind::Step) || is_card(group))
        }),
    }
}

/// Whether an item is a group that rises.
fn is_raised(item: &Item, presentation: &Presentation) -> bool {
    matches!(item, Item::Group(group) if rises(group, presentation))
}

/// Where a raised item lands in an order it has left: before the next card
/// from where it stood when it is a line, and last otherwise.
fn landing(order: &[&Item], from: usize, item: &Item) -> usize {
    let line = matches!(item, Item::Group(group) if is_line(group));
    let card = || {
        order[from..]
            .iter()
            .position(|one| matches!(one, Item::Group(group) if is_card(group)))
    };
    line.then(card)
        .flatten()
        .map_or(order.len(), |ahead| from + ahead)
}

/// The items in order with each raised one moved, one at a time in picture
/// order.
fn arranged<'a>(items: &'a [Item], presentation: &Presentation) -> Vec<&'a Item> {
    let mut order: Vec<&Item> = items.iter().collect();
    for item in items.iter().filter(|item| is_raised(item, presentation)) {
        let Some(from) = order.iter().position(|one| std::ptr::eq(*one, item)) else {
            continue;
        };
        order.remove(from);
        let to = landing(&order, from, item);
        order.insert(to, item);
    }
    order
}

/// The items in the order they are drawn. A frame with nothing raised
/// allocates nothing.
pub(crate) fn drawn_in_order<'a>(items: &'a [Item], presentation: &Presentation) -> Sequence<'a> {
    let nothing = presentation.selected.is_empty() && presentation.heads.is_empty();
    if nothing || !items.iter().any(|item| is_raised(item, presentation)) {
        return Sequence::Plain(items.iter());
    }
    Sequence::Raised(arranged(items, presentation).into_iter())
}

#[cfg(test)]
mod tests {
    use super::drawn_in_order;
    use crate::presentation::Presentation;
    use archboard_scene::request::NodeAppearance;
    use archboard_scene::scene::{Group, Item, Role, Subject, SubjectKind};

    fn subject(kind: SubjectKind, id: &str) -> Subject {
        Subject {
            kind,
            id: id.to_owned(),
            standing: None,
        }
    }

    fn appearance(container: bool) -> NodeAppearance {
        NodeAppearance {
            container,
            tags: Vec::new(),
            type_color: None,
            icon: String::new(),
            type_name: String::new(),
            type_kind: String::new(),
            drill: None,
        }
    }

    fn named(role: Role, kind: SubjectKind, id: &str) -> Item {
        Item::Group(Group::new(role, Vec::new()).drawing(subject(kind, id)))
    }

    fn card(id: &str) -> Item {
        named(
            Role::Card(Box::new(appearance(false))),
            SubjectKind::Node,
            id,
        )
    }

    fn line(id: &str) -> Item {
        named(Role::Line(None), SubjectKind::Edge, id)
    }

    /// The ids of the subjects in the order they are drawn.
    fn order(items: &[Item], selected: &[&str]) -> Vec<String> {
        let presentation = Presentation {
            selected: selected.iter().map(|id| (*id).to_owned()).collect(),
            ..Presentation::default()
        };
        drawn_in_order(items, &presentation)
            .map(|item| match item {
                Item::Group(group) => group
                    .subject
                    .as_ref()
                    .map_or_else(|| "?".to_owned(), |subject| subject.id.clone()),
                _ => "?".to_owned(),
            })
            .collect()
    }

    #[test]
    fn nothing_selected_draws_in_picture_order() {
        let items = [line("l"), card("a"), line("m")];
        assert_eq!(order(&items, &[]), ["l", "a", "m"]);
    }

    #[test]
    fn a_selected_card_draws_last_and_selected_ones_keep_picture_order() {
        let items = [card("a"), card("b"), line("l"), card("c")];
        assert_eq!(order(&items, &["a", "b"]), ["l", "c", "a", "b"]);
    }

    #[test]
    fn a_selected_line_stops_before_the_next_card() {
        let items = [line("l"), line("m"), card("a"), line("n"), card("b")];
        assert_eq!(order(&items, &["l"]), ["m", "l", "a", "n", "b"]);
        assert_eq!(order(&items, &["n"]), ["l", "m", "a", "n", "b"]);
        assert_eq!(order(&items, &["l", "a"]), ["m", "l", "n", "b", "a"]);
    }

    #[test]
    fn a_container_never_rises() {
        let frame = named(
            Role::Frame(Some(Box::new(appearance(true)))),
            SubjectKind::Region,
            "r",
        );
        let items = [frame, card("a")];
        assert_eq!(order(&items, &["r"]), ["r", "a"]);
    }

    #[test]
    fn a_held_down_head_draws_last_and_a_head_at_rest_does_not() {
        let head = Item::Group(Group::new(Role::FlowHead("f".to_owned()), Vec::new()));
        let items = [head, card("a")];
        let mut presentation = Presentation::default();
        let first = |presentation: &Presentation| {
            matches!(
                drawn_in_order(&items, presentation).next(),
                Some(Item::Group(group)) if matches!(group.role, Role::FlowHead(_))
            )
        };
        assert!(first(&presentation));
        presentation.heads.insert("f".to_owned(), 12.0);
        assert!(!first(&presentation));
    }
}
