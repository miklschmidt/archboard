//! A group's attributes: the subject it draws first, then what its role says
//! of it, as the picture has always written them. The class names here are
//! the ones the stylesheet toggles and a viewer reaches for.

use archboard_scene::js;
use archboard_scene::names::word;
use archboard_scene::request::{NodeAppearance, PaletteColor};
use archboard_scene::scene::{Group, LineFacts, Role, Slot, Subject, SubjectKind, Transform};

use crate::definitions::Names;
use crate::xml::Attributes;

/// The class of what a part draws when the picture is seen near.
pub(crate) const NEAR_CLASS: &str = "ab-near";
/// The class of what a part draws only from far away.
pub(crate) const FAR_CLASS: &str = "ab-far";
/// The class of a type chip both views share.
pub(crate) const CHIP_CLASS: &str = "ab-chip";
/// The class of a block of words that moves between the views.
pub(crate) const WORDS_CLASS: &str = "ab-words";
/// Where a chip stands near.
pub(crate) const NEAR_PLACE: &str = "--near";
/// Where a chip stands far.
pub(crate) const FAR_PLACE: &str = "--far";
/// Where a block of words moves to.
pub(crate) const AWAY_PLACE: &str = "--away";
/// The class of the face behind a flow's head of cards.
pub(crate) const HEAD_SHADE_CLASS: &str = "ab-head-shade";
/// The attribute on a line's traffic layer.
pub(crate) const TRAFFIC_ATTRIBUTE: &str = "data-traffic";
/// The attribute on a mark that stands with the subjects it lists.
pub(crate) const MEMBERS_ATTRIBUTE: &str = "data-members";
/// The attribute on a group that draws one part of a subject drawn in two.
const PART_ATTRIBUTE: &str = "data-semantic-part";

/// A move and a scale, as a transform or a custom property spells it.
fn placed(transform: Transform, unit: &str) -> String {
    let moved = format!(
        "translate({}{unit},{}{unit})",
        js::number(transform.x),
        js::number(transform.y)
    );
    match transform.scale {
        None => moved,
        Some(scale) => format!("{moved} scale({})", js::number(scale)),
    }
}

/// The subject a group draws, as its first attributes.
fn subject(subject: &Subject, out: &mut Attributes) {
    out.set("data-semantic-kind", word(&subject.kind));
    let id = if subject.kind == SubjectKind::GroupRegion {
        "data-group"
    } else {
        "data-semantic-id"
    };
    out.set(id, subject.id.as_str()).maybe(
        "data-semantic-standing",
        subject.standing.map(|one| word(&one)),
    );
}

/// A palette colour's word, or the neutral one's.
fn colour_word(color: Option<PaletteColor>) -> &'static str {
    color.map_or("neutral", |color| word(&color))
}

/// How a part was drawn.
fn appearance(appearance: &NodeAppearance, out: &mut Attributes) {
    out.set(
        "data-depiction",
        if appearance.container {
            "container"
        } else {
            "card"
        },
    )
    .set("data-body-color", colour_word(appearance.body_color))
    .maybe("data-group", appearance.group.as_deref())
    .set("data-type-color", colour_word(appearance.type_color))
    .set("data-type-name", appearance.type_name.as_str())
    .set("data-type-kind", appearance.type_kind.as_str());
}

/// A group's transform, as its role writes it.
fn transform(group: &Group, out: &mut Attributes) {
    out.maybe("transform", group.transform.map(|moved| placed(moved, "")));
}

/// The subjects a group stands with, when it stands with any.
fn members(group: &Group, out: &mut Attributes) {
    out.maybe(
        MEMBERS_ATTRIBUTE,
        (!group.members.is_empty()).then(|| group.members.join(" ")),
    );
}

/// What a line's group says: how solid it is, its mask, and how it was drawn.
fn line(group: &Group, facts: Option<&LineFacts>, names: &Names, out: &mut Attributes) {
    out.maybe("opacity", group.opacity).maybe(
        "mask",
        group
            .mask
            .as_ref()
            .map(|mask| format!("url(#{})", names.mask(mask))),
    );
    if let Some(facts) = facts {
        let look = &facts.appearance;
        out.set("data-type-name", look.name.as_str())
            .set("data-type-kind", facts.kind.as_str())
            .set("data-line-color", colour_word(look.color))
            .set("data-line-dash", word(&look.dash))
            .set("data-arrowhead", word(&look.arrowhead));
    }
}

/// What the groups of a part's two views say: which view, and where a chip
/// and a block of words move between them. False for a group of another role.
fn view(group: &Group, out: &mut Attributes) -> bool {
    match &group.role {
        Role::Chip { far } => {
            out.set("class", CHIP_CLASS);
            transform(group, out);
            if let Some(near) = group.transform {
                out.set(
                    "style",
                    format!(
                        "{NEAR_PLACE}:{};{FAR_PLACE}:{}",
                        placed(near, "px"),
                        placed(*far, "px")
                    ),
                );
            }
        }
        Role::NearView => {
            out.set("class", NEAR_CLASS);
        }
        Role::FarView => {
            out.set("class", FAR_CLASS).set("display", "none");
        }
        Role::Words { away } => {
            out.set("class", WORDS_CLASS)
                .set("style", format!("{AWAY_PLACE}:{}", placed(*away, "px")));
        }
        Role::DrillMark(direction) => {
            out.set("class", "ab-drill")
                .set("data-drill", word(direction));
            transform(group, out);
        }
        Role::Icon(asked) => {
            transform(group, out);
            out.maybe("data-type-icon", asked.as_deref());
        }
        _ => return false,
    }
    true
}

/// What the groups of the page around a drawing say: where it moved, and the
/// parts an export adds. False for a group of another role.
fn page(group: &Group, out: &mut Attributes) -> bool {
    match &group.role {
        Role::Move => transform(group, out),
        Role::Inset => {
            out.maybe(
                "transform",
                group.transform.map(|moved| {
                    format!("translate({} {})", js::number(moved.x), js::number(moved.y))
                }),
            );
        }
        Role::Slot(Slot::PlannedFrame) => {
            out.set("data-slot", "planned-frame");
        }
        Role::Slot(Slot::ExportTitle) => {
            out.set("data-slot", "export-title");
        }
        Role::Slot(Slot::ExportLegend { layout }) => {
            out.set("data-slot", "export-legend")
                .set("data-layout", word(layout));
        }
        Role::LegendEntry(kind) => {
            out.set("data-legend-entry", word(kind));
        }
        _ => return false,
    }
    true
}

/// What a group's role says of it.
fn role(group: &Group, names: &Names, out: &mut Attributes) {
    if view(group, out) || page(group, out) {
        return;
    }
    match &group.role {
        Role::Card(look) | Role::Frame(Some(look)) => appearance(look, out),
        Role::Header(look) => {
            appearance(look, out);
            out.set(PART_ATTRIBUTE, "header");
        }
        Role::Line(facts) => line(group, facts.as_deref(), names, out),
        Role::Label => {
            out.set(PART_ATTRIBUTE, "label");
        }
        Role::Lifeline => {
            out.maybe("opacity", group.opacity)
                .set(PART_ATTRIBUTE, "lifeline");
        }
        Role::Fragment => {
            out.maybe("opacity", group.opacity);
        }
        // A region states its members, none too.
        Role::Region => {
            out.set(MEMBERS_ATTRIBUTE, group.members.join(" "));
        }
        Role::RowMark | Role::Marks => members(group, out),
        Role::Shadow(part) => {
            out.set("class", "ab-shadow");
            members(group, out);
            out.maybe(PART_ATTRIBUTE, part.map(|part| word(&part)));
        }
        Role::Traffic(line) => {
            out.set(TRAFFIC_ATTRIBUTE, line.as_str());
        }
        Role::Junctions => {
            out.set("class", "ab-junctions");
        }
        Role::Port => {
            out.set("class", "ab-port");
        }
        Role::FlowHead(flow) => {
            out.set("data-flow-head", flow.as_str());
        }
        Role::HeadShade => {
            out.set("class", HEAD_SHADE_CLASS)
                .set("visibility", "hidden");
        }
        Role::Pin | Role::Warning => transform(group, out),
        _ => {}
    }
}

/// A group's own attributes: the subject it draws, what its role says, and
/// whether it takes the pointer.
pub(crate) fn group_attributes(group: &Group, names: &Names) -> Attributes {
    let mut out = Attributes::new();
    if let Some(drawn) = &group.subject {
        subject(drawn, &mut out);
    }
    role(group, names, &mut out);
    out.maybe(
        "pointer-events",
        group.pointer.map(|pointer| word(&pointer)),
    );
    out
}
