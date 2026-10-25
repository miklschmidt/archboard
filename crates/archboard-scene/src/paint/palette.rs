//! The picture's colours: each a token of the page's theme, or made of them,
//! so the picture takes whichever theme it is shown in.

use crate::paint::colour::light_dark;
use crate::scene::{Colour, Token};

/// The picture's colours, by what each is for.
#[derive(Clone, Debug, PartialEq)]
pub(super) struct Palette {
    /// The page behind everything.
    pub background: Colour,
    /// A card's top face, before its group tints it.
    pub slab_face: Colour,
    /// A card's front edge, the thickness that shows along its foot.
    pub slab_edge: Colour,
    /// What a group's colour is shaded into for the front edge of a card or a label.
    pub slab_deep: Colour,
    /// What the fine highlight along the top edge of a face mixes toward.
    pub slab_glint: Colour,
    /// The light at the top of a face, which falls off down it.
    pub slab_sheen: Colour,
    /// One layer of the stacked shadow a part casts.
    pub slab_shadow: Colour,
    /// A container's floor at the top level, before its kind tints it.
    pub tray_floor: Colour,
    /// What a nested container's floor sinks toward, a step for each level.
    pub tray_sink: Colour,
    /// The lit lip along the bottom of a container.
    pub tray_lip: Colour,
    /// A port's inside by its rim.
    pub port_wall: Colour,
    /// A port's inside at its deepest.
    pub port_deep: Colour,
    /// A port's lit floor, by the sill.
    pub port_lip: Colour,
    /// Text that carries the meaning: a card's name.
    pub foreground: Colour,
    /// Secondary text: a responsibility, a region name.
    pub muted: Colour,
    /// A neutral line, its arrowhead and a lifeline.
    pub edge: Colour,
    /// The light a traffic pulse mixes into the colour of its line.
    pub glow: Colour,
    /// A kind glyph.
    pub glyph: Colour,
    /// A label chip's face, opaque so it can be read wherever it lands.
    pub pill: Colour,
    /// A label chip's text.
    pub pill_text: Colour,
    /// The ring around whatever the person has selected.
    pub selection: Colour,
    /// The mark on a subject whose reconciliation nobody has decided yet.
    pub warning: Colour,
    /// A subject this proposal has that the variant it came from did not.
    pub standing_added: Colour,
    /// The same subject, saying something different.
    pub standing_changed: Colour,
    /// A subject the variant it is read against has and this one does not.
    pub standing_removed: Colour,
}

impl Palette {
    /// Diagram roles mapped onto the canonical shadcn theme, without a second palette.
    pub(super) fn of_page() -> Self {
        Palette {
            background: Token::Background.into(),
            slab_face: Token::SlabFace.into(),
            slab_edge: Token::SlabEdge.into(),
            slab_deep: Token::SlabDeep.into(),
            slab_glint: Token::SlabGlint.into(),
            slab_sheen: Token::SlabSheen.into(),
            slab_shadow: Token::SlabShadow.into(),
            tray_floor: Token::TrayFloor.into(),
            tray_sink: Token::TraySink.into(),
            tray_lip: Token::TrayLip.into(),
            port_wall: Token::PortWall.into(),
            port_deep: Token::PortDeep.into(),
            port_lip: Token::PortLip.into(),
            foreground: Token::DiagramText.into(),
            muted: Token::DiagramTextMuted.into(),
            edge: Token::DiagramEdge.into(),
            glow: Token::DiagramGlow.into(),
            glyph: Token::DiagramTextMuted.into(),
            pill: light_dark(&Token::SlabFace.into(), &Token::Popover.into()),
            pill_text: Token::DiagramText.into(),
            selection: Token::DiagramSelection.into(),
            warning: light_dark(&Token::WarningForeground.into(), &Token::Warning.into()),
            standing_added: Token::StandingAdded.into(),
            standing_changed: Token::StandingChanged.into(),
            standing_removed: Token::StandingRemoved.into(),
        }
    }
}
