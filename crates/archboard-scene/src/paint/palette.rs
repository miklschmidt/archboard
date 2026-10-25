//! The picture's colours: each a CSS expression of the page's tokens, so the
//! picture takes whichever theme the page showing it is in, and a document that
//! stands alone carries the values of the tokens it names.

/// The picture's colours, each a CSS expression of the page's tokens.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Palette {
    /// The page behind everything.
    pub background: &'static str,
    /// A card's top face, before its group tints it.
    pub slab_face: &'static str,
    /// A card's front edge, the thickness that shows along its foot.
    pub slab_edge: &'static str,
    /// What a group's colour is shaded into for the front edge of a card or a label.
    pub slab_deep: &'static str,
    /// What the fine highlight along the top edge of a face mixes toward.
    pub slab_glint: &'static str,
    /// The light at the top of a face, which falls off down it.
    pub slab_sheen: &'static str,
    /// One layer of the stacked shadow a part casts.
    pub slab_shadow: &'static str,
    /// A container's floor at the top level, before its kind tints it.
    pub tray_floor: &'static str,
    /// What a nested container's floor sinks toward, a step for each level.
    pub tray_sink: &'static str,
    /// The lit lip along the bottom of a container.
    pub tray_lip: &'static str,
    /// A port's inside by its rim, its depth, and its lit floor by the sill.
    pub port_wall: &'static str,
    /// A port's inside at its deepest.
    pub port_deep: &'static str,
    /// A port's lit floor, by the sill.
    pub port_lip: &'static str,
    /// Text that carries the meaning: a card's name.
    pub foreground: &'static str,
    /// Secondary text: a responsibility, a region name.
    pub muted: &'static str,
    /// A neutral line, its arrowhead and a lifeline.
    pub edge: &'static str,
    /// The light a traffic pulse mixes into the colour of its line.
    pub glow: &'static str,
    /// A kind glyph.
    pub glyph: &'static str,
    /// A label chip's face, opaque so it can be read wherever it lands.
    pub pill: &'static str,
    /// A label chip's text.
    pub pill_text: &'static str,
    /// The ring around whatever the person has selected.
    pub selection: &'static str,
    /// The mark on a subject whose reconciliation nobody has decided yet.
    pub warning: &'static str,
    /// A subject this proposal has that the variant it came from did not.
    pub standing_added: &'static str,
    /// The same subject, saying something different.
    pub standing_changed: &'static str,
    /// A subject the variant it is read against has and this one does not.
    pub standing_removed: &'static str,
}

/// Diagram roles mapped onto the canonical shadcn theme, without a second palette.
pub const PALETTE: Palette = Palette {
    background: "var(--background)",
    slab_face: "var(--slab-face)",
    slab_edge: "var(--slab-edge)",
    slab_deep: "var(--slab-deep)",
    slab_glint: "var(--slab-glint)",
    slab_sheen: "var(--slab-sheen)",
    slab_shadow: "var(--slab-shadow)",
    tray_floor: "var(--tray-floor)",
    tray_sink: "var(--tray-sink)",
    tray_lip: "var(--tray-lip)",
    port_wall: "var(--port-wall)",
    port_deep: "var(--port-deep)",
    port_lip: "var(--port-lip)",
    foreground: "var(--diagram-text)",
    muted: "var(--diagram-text-muted)",
    edge: "var(--diagram-edge)",
    glow: "var(--diagram-glow)",
    glyph: "var(--diagram-text-muted)",
    pill: "light-dark(var(--slab-face), var(--popover))",
    pill_text: "var(--diagram-text)",
    selection: "var(--diagram-selection)",
    warning: "light-dark(var(--warning-foreground), var(--warning))",
    standing_added: "var(--standing-added)",
    standing_changed: "var(--standing-changed)",
    standing_removed: "var(--standing-removed)",
};

/// One page token, as the picture paints with it.
pub fn token(name: &str) -> String {
    format!("var({name})")
}
