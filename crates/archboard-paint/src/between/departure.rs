//! A picture leaving for another board.
//!
//! Leaving starts the moment somebody asks, not when the next board arrives:
//! a pane that sat unchanged until then feels as if the click had not been
//! heard. Which way it leaves says where the reader went. Opening a card's
//! board zooms on into that card as the picture fades, going back draws the
//! picture away from the reader, and anything else simply fades. It ends
//! invisible, so a slow draw leaves an empty pane rather than a board nobody is
//! reading any more.

use archboard_scene::geometry::Rect;
use archboard_scene::scene::{Group, Item, Role, Scene};
use serde::Deserialize;

use super::ease::{lerp, scale_about};
use crate::timing::Curve;

/// How far the picture grows as the reader goes into a card.
const INTO_SCALE: f64 = 1.14;

/// How far it shrinks as the reader goes back out.
const OUT_SCALE: f64 = 0.9;

/// How far it shrinks as the reader goes anywhere else.
const ACROSS_SCALE: f64 = 0.98;

/// The curve a picture leaves on: slow to start, gone quickly.
const LEAVE_EASING: Curve = Curve(0.4, 0.0, 1.0, 1.0);

/// Below this a picture is as good as gone, and needs no ghost.
const VISIBLE_FLOOR: f64 = 0.02;

/// Where the reader went, as far as the picture leaving is concerned.
#[derive(Clone, Copy, Debug, PartialEq, Deserialize)]
#[serde(tag = "way", rename_all = "camelCase")]
pub enum Heading {
    /// Into the board a card opens. The picture grows about that card, or
    /// about the middle of its page when the card is not known.
    Into {
        /// The card opened, as it stands in the picture leaving.
        toward: Option<Rect>,
    },
    /// Back to the board above.
    Out,
    /// Anywhere else.
    Across,
}

impl Heading {
    /// How far the picture ends up scaled.
    fn scale(self) -> f64 {
        match self {
            Heading::Into { .. } => INTO_SCALE,
            Heading::Out => OUT_SCALE,
            Heading::Across => ACROSS_SCALE,
        }
    }
}

/// The last picture on its way out, its ground not drawn.
///
/// Progress is a share of the whole leaving. The picture ends invisible, and
/// nothing is answered once it is as good as gone. The definitions it refers to
/// are the scene's own.
pub fn departure(scene: &Scene, heading: &Heading, progress: f64) -> Vec<Item> {
    let eased = LEAVE_EASING.at(progress);
    let visible = 1.0 - eased;
    if visible <= VISIBLE_FLOOR {
        return Vec::new();
    }
    let about = match heading {
        Heading::Into { toward: Some(card) } => *card,
        _ => Rect {
            x: 0.0,
            y: 0.0,
            width: scene.width,
            height: scene.height,
        },
    };
    let mut leaving = Group::new(Role::Marks, scene.body.clone());
    leaving.opacity = Some(visible);
    leaving.transform = Some(scale_about(about, lerp(1.0, heading.scale(), eased)));
    vec![Item::Group(leaving)]
}

#[cfg(test)]
mod tests {
    use super::{Heading, departure};
    use crate::between::testing::{card, rect, scene};
    use archboard_scene::scene::Item;

    #[test]
    fn a_picture_leaving_ends_invisible_and_scales_about_where_the_reader_went() {
        let frame = rect(10.0, 10.0, 100.0, 50.0);
        let board = scene(vec![card("a", frame, &["Title"])], &[("a", frame)]);
        let toward = Heading::Into {
            toward: Some(frame),
        };

        assert!(
            departure(&board, &toward, 1.0).is_empty(),
            "nothing is left of it"
        );
        let [Item::Group(leaving)] = &departure(&board, &toward, 0.5)[..] else {
            panic!("the picture leaves as one group")
        };
        let grown = leaving.transform.expect("scaled");
        let scale = grown.scale.expect("a scale");
        assert!(scale > 1.0, "going into a card grows the picture");
        let (cx, cy) = (60.0, 35.0);
        assert!(
            (cx * scale + grown.x - cx).abs() < 1e-9 && (cy * scale + grown.y - cy).abs() < 1e-9
        );

        let [Item::Group(back)] = &departure(&board, &Heading::Out, 0.5)[..] else {
            panic!("the picture leaves as one group")
        };
        assert!(
            back.transform
                .and_then(|transform| transform.scale)
                .is_some_and(|scale| scale < 1.0)
        );
    }

    #[test]
    fn the_host_hands_over_its_heading_as_json() {
        let heading: Heading =
            serde_json::from_str(r#"{"way":"into","toward":{"x":1,"y":2,"width":3,"height":4}}"#)
                .expect("a heading");
        assert_eq!(
            heading,
            Heading::Into {
                toward: Some(rect(1.0, 2.0, 3.0, 4.0))
            }
        );
        assert_eq!(
            serde_json::from_str::<Heading>(r#"{"way":"across"}"#).expect("a heading"),
            Heading::Across
        );
    }
}
