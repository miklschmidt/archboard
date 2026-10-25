//! The colours of a scene: the page's theme tokens and the palette's named
//! colours, and the operations that make a colour of them. A colour is a value
//! the frontend resolves against the theme it shows the picture in, so one
//! scene takes either theme.

use serde::Serialize;
use ts_rs::TS;

use crate::request::PaletteColor;
use crate::scene::definition::GradientId;

/// One colour of the page's theme, named by what it is for.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, TS)]
#[serde(rename_all = "kebab-case")]
pub enum Token {
    /// The page behind everything.
    Background,
    /// A card's top face, before its group tints it.
    SlabFace,
    /// A card's front edge, the thickness that shows along its foot.
    SlabEdge,
    /// What a colour is shaded into for the front edge of a card or a label.
    SlabDeep,
    /// What the fine highlight along the top edge of a face mixes toward.
    SlabGlint,
    /// The light at the top of a face, which falls off down it.
    SlabSheen,
    /// One layer of the shadow a part casts.
    SlabShadow,
    /// A container's floor at the top level.
    TrayFloor,
    /// What a nested container's floor sinks toward.
    TraySink,
    /// The lit lip along the bottom of a container.
    TrayLip,
    /// A port's inside by its rim.
    PortWall,
    /// A port's inside at its deepest.
    PortDeep,
    /// A port's lit floor, by the sill.
    PortLip,
    /// Text that carries the meaning.
    DiagramText,
    /// Secondary text, and a kind's glyph.
    DiagramTextMuted,
    /// A neutral line, its arrowhead and a lifeline.
    DiagramEdge,
    /// The light a traffic pulse mixes into its line's colour.
    DiagramGlow,
    /// The ring round whatever the person has selected.
    DiagramSelection,
    /// A subject a proposal adds.
    StandingAdded,
    /// A subject a proposal changes.
    StandingChanged,
    /// A subject a proposal removes.
    StandingRemoved,
    /// The face of a raised surface on the dark theme.
    Popover,
    /// The warning colour.
    Warning,
    /// The warning colour where it is read on a light ground.
    WarningForeground,
    /// The gold of a primary action.
    Primary,
    /// Words on the gold of a primary action.
    PrimaryForeground,
    /// The top of a primary action's face.
    PrimaryTop,
    /// The foot of a primary action's face.
    PrimaryBottom,
    /// A primary action's front edge.
    PrimaryEdge,
}

/// A colour: a token, a named palette colour, a fixed colour, or one made of
/// other colours. Every operation is the one CSS names for it, in the sRGB and
/// OKLCH spaces CSS computes it in.
#[derive(Clone, Debug, PartialEq, Serialize, TS)]
#[serde(tag = "colour", rename_all = "camelCase")]
pub enum Colour {
    /// One of the theme's tokens.
    Token {
        /// Which token.
        token: Token,
    },
    /// One of the vault policy's named colours, as the theme defines it.
    Palette {
        /// Which colour.
        color: PaletteColor,
    },
    /// Black, which a mask hides through.
    Black,
    /// White, which a mask shows through.
    White,
    /// Nothing at all: fully see-through.
    Transparent,
    /// Part way from one colour to another, mixed in sRGB.
    Mix {
        /// The colour mixed into.
        base: Box<Colour>,
        /// The colour mixed in.
        ink: Box<Colour>,
        /// How much of `ink`, between 0 and 1 and never either.
        share: f64,
    },
    /// One colour on the light theme and another on the dark one.
    LightDark {
        /// The colour on the light theme.
        light: Box<Colour>,
        /// The colour on the dark theme.
        dark: Box<Colour>,
    },
    /// An ink's own hue at a lightness of its own, keeping a share of the
    /// ink's chroma up to a cap: `oklch(L, min(C, cap) * chroma, H)`.
    Tone {
        /// The ink whose hue the tone keeps.
        ink: Box<Colour>,
        /// The tone's OKLCH lightness.
        lightness: f64,
        /// The most of the ink's chroma that counts.
        cap: f64,
        /// The share of that chroma the tone keeps.
        chroma: f64,
    },
    /// An ink with its OKLCH lightness held between two bounds.
    Held {
        /// The ink.
        ink: Box<Colour>,
        /// The least lightness it keeps.
        least: f64,
        /// The most lightness it keeps.
        most: f64,
    },
}

impl Colour {
    /// One of the theme's tokens.
    pub const fn token(token: Token) -> Colour {
        Colour::Token { token }
    }

    /// One of the palette's named colours.
    pub const fn palette(color: PaletteColor) -> Colour {
        Colour::Palette { color }
    }
}

impl From<Token> for Colour {
    fn from(token: Token) -> Self {
        Colour::token(token)
    }
}

/// What fills or strokes a shape: nothing, a colour, or a gradient.
#[derive(Clone, Debug, PartialEq, Serialize, TS)]
#[serde(tag = "paint", rename_all = "camelCase")]
pub enum Paint {
    /// Nothing is painted.
    None,
    /// One colour.
    Colour {
        /// The colour.
        colour: Colour,
    },
    /// A gradient of the picture's definitions.
    Gradient {
        /// Which gradient.
        id: GradientId,
    },
}

impl From<Colour> for Paint {
    fn from(colour: Colour) -> Self {
        Paint::Colour { colour }
    }
}

impl From<&Colour> for Paint {
    fn from(colour: &Colour) -> Self {
        Paint::Colour {
            colour: colour.clone(),
        }
    }
}

impl From<Token> for Paint {
    fn from(token: Token) -> Self {
        Paint::from(Colour::token(token))
    }
}

impl From<GradientId> for Paint {
    fn from(id: GradientId) -> Self {
        Paint::Gradient { id }
    }
}
