//! A line's effect played once, when a reader points at it or at its card:
//! a mutation's spark runs to its target and lights the imprint, a query's eye
//! lights and a spark runs back to the ring at its caller, a compute's "="
//! brightens, and a declared requirement stays still. It is drawn in the
//! spark's look: the line's ink drawn toward the text, one pass. Nothing plays
//! on a line with traffic of its own.

use archboard_scene::request::LineEffect;
use archboard_scene::scene::{Group, Item, Paint, Role, Token};
use kurbo::{BezPath, ParamCurveArclen as _};
use peniko::Color;

use super::{Inside, Walk};
use crate::canvas::{Canvas, Ink};
use crate::path::trimmed;
use crate::presentation::Playing;
use crate::traffic::holds_traffic;

/// How long one play takes, in milliseconds.
const PLAY_MS: f64 = 900.0;
/// The spark's layers: how far back each reaches, how much wider than the line
/// it is, how solid, and how far toward the text its ink goes.
const SPARK: [(f64, f64, f64, f64); 2] = [(44.0, 4.0, 0.25, 0.5), (18.0, 1.0, 1.0, 0.85)];
/// How far toward the text a lit mark's ink goes at its brightest.
const LIT_TOWARD_TEXT: f64 = 0.7;
/// How exactly a spark measures along its line.
const ACCURACY: f64 = 0.05;

/// One line's play at a moment: what its relationship does, and how far
/// through the play it is, from 0 to 1.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct Play {
    pub effect: LineEffect,
    pub at: f64,
}

/// How far through a phase of a play a moment is.
fn phase(at: f64, start: f64, end: f64) -> f64 {
    ((at - start) / (end - start)).clamp(0.0, 1.0)
}

/// A brightening that rises and falls once over a phase.
fn swell(t: f64) -> f64 {
    4.0 * t * (1.0 - t)
}

impl Play {
    /// How lit a line's end mark is: the eye of a query as it starts, the "="
    /// of a compute through the whole play, the ring of a query as the spark
    /// lands on it.
    pub(super) fn mark_glow(self, start: bool) -> f64 {
        match (self.effect, start) {
            (LineEffect::Query, false) => swell(phase(self.at, 0.0, 0.35)),
            (LineEffect::Query, true) => swell(phase(self.at, 0.8, 1.0)),
            (LineEffect::Compute, false) => swell(self.at),
            _ => 0.0,
        }
    }

    /// How lit a mutation's imprint is: as its spark lands.
    pub(super) fn imprint_glow(self) -> f64 {
        match self.effect {
            LineEffect::Mutation => swell(phase(self.at, 0.7, 1.0)),
            _ => 0.0,
        }
    }

    /// Where the spark's front stands, as a share of the line from its start,
    /// and which way it runs: forward for a mutation, back for a query.
    fn front(self) -> Option<(f64, bool)> {
        let eased = |t: f64| 1.0 - (1.0 - t).powi(3);
        match self.effect {
            LineEffect::Mutation if self.at < 0.8 => Some((eased(phase(self.at, 0.0, 0.75)), true)),
            LineEffect::Query if (0.25..0.9).contains(&self.at) => {
                Some((1.0 - eased(phase(self.at, 0.25, 0.85)), false))
            }
            _ => None,
        }
    }
}

/// How far through its play a line is at a moment, from 0 to 1, for a play
/// that started at another, both in milliseconds; none once it is over.
pub(crate) fn play_at(start: f64, now: f64) -> Option<f64> {
    let at = (now - start) / PLAY_MS;
    (at < 1.0).then(|| at.max(0.0))
}

/// Whether some items carry traffic of a line's own.
fn carries_traffic(items: &[Item], id: &str) -> bool {
    items.iter().any(|item| match item {
        Item::Group(group) => match &group.role {
            Role::Traffic(line) if line == id => holds_traffic(&group.items),
            _ => carries_traffic(&group.items, id),
        },
        Item::Viewport(viewport) => carries_traffic(&viewport.items, id),
        _ => false,
    })
}

/// The effect a line can play.
fn animated_effect(group: &Group) -> Option<LineEffect> {
    let Role::Line(Some(facts)) = &group.role else {
        return None;
    };
    facts
        .appearance
        .effect
        .filter(|effect| *effect != LineEffect::Declared)
}

/// Whether the picture holds a line with a playable effect.
fn has_effect(items: &[Item], id: &str) -> bool {
    items.iter().any(|item| match item {
        Item::Group(group) => {
            (group
                .subject
                .as_ref()
                .is_some_and(|subject| subject.id == id)
                && animated_effect(group).is_some())
                || has_effect(&group.items, id)
        }
        Item::Viewport(viewport) => has_effect(&viewport.items, id),
        _ => false,
    })
}

/// The requested lines that can play and carry no traffic of their own.
pub(crate) fn playable(items: &[Item], ids: Vec<String>) -> Vec<String> {
    ids.into_iter()
        .filter(|id| has_effect(items, id) && !carries_traffic(items, id))
        .collect()
}

impl<C: Canvas> Walk<'_, C> {
    /// Whether an item holds a line that plays now, so it is drawn afresh each
    /// frame and never kept.
    pub(super) fn holds_play(&self, item: &Item) -> bool {
        let plays = &self.presentation.plays;
        !plays.is_empty()
            && match item {
                Item::Group(group) => {
                    group
                        .subject
                        .as_ref()
                        .is_some_and(|subject| plays.iter().any(|playing| playing.id == subject.id))
                        || group.items.iter().any(|inner| self.holds_play(inner))
                }
                Item::Viewport(viewport) => {
                    viewport.items.iter().any(|inner| self.holds_play(inner))
                }
                _ => false,
            }
    }

    /// The play of a line's group at this moment, if one runs on it.
    pub(super) fn play_of(&self, group: &Group) -> Option<Play> {
        let effect = animated_effect(group)?;
        let id = &group.subject.as_ref()?.id;
        self.presentation
            .plays
            .iter()
            .find(|playing: &&Playing| playing.id == *id)
            .map(|playing| Play {
                effect,
                at: playing.at,
            })
    }

    /// An ink drawn toward the text by a share.
    pub(super) fn glowing(&self, ink: Ink, glow: f64) -> Ink {
        match ink {
            Ink::Solid(colour) if glow > 0.0 => {
                Ink::Solid(self.toward_text(colour, glow * LIT_TOWARD_TEXT))
            }
            other => other,
        }
    }

    /// A colour drawn toward the text by a share, its own alpha kept.
    fn toward_text(&self, colour: Color, share: f64) -> Color {
        let text = self.palette.colour(&Token::DiagramText.into(), 1.0);
        #[expect(
            clippy::cast_possible_truncation,
            reason = "a colour's components are f32"
        )]
        let share = share.clamp(0.0, 1.0) as f32;
        let [r, g, b, a] = colour.components;
        let [tr, tg, tb, _] = text.components;
        Color::new([
            r + (tr - r) * share,
            g + (tg - g) * share,
            b + (tb - b) * share,
            a,
        ])
    }

    /// A paint as a colour, drawn toward the text by a share.
    pub(super) fn lit_colour(&self, paint: &Paint, glow: f64) -> Color {
        let colour = match paint {
            Paint::Colour { colour } => self.palette.colour(colour, 1.0),
            _ => self.palette.colour(&Token::DiagramText.into(), 1.0),
        };
        self.toward_text(colour, glow * LIT_TOWARD_TEXT)
    }

    /// The spark of a play, on the body a line drew.
    pub(super) fn spark(
        &mut self,
        body: &BezPath,
        paint: &Paint,
        width: f64,
        play: Play,
        inside: Inside,
    ) {
        let Some((front, forward)) = play.front() else {
            return;
        };
        let length: f64 = body.segments().map(|seg| seg.arclen(ACCURACY)).sum();
        let at = front * length;
        self.canvas.set_transform(inside.transform);
        for (reach, wider, alpha, toward) in SPARK {
            let (from, to) = if forward {
                ((at - reach).max(0.0), at)
            } else {
                (at, (at + reach).min(length))
            };
            if to - from <= 0.0 {
                continue;
            }
            let piece = trimmed(body, from, length - to);
            let colour = self.lit_colour(paint, toward / LIT_TOWARD_TEXT);
            #[expect(clippy::cast_possible_truncation, reason = "a colour's alpha is f32")]
            let ink = Ink::Solid(colour.multiply_alpha(alpha as f32));
            let stroke = kurbo::Stroke::new(width + wider).with_caps(kurbo::Cap::Round);
            self.canvas.stroke(&piece, &stroke, &ink);
        }
    }
}
