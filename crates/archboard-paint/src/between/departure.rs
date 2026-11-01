//! A picture leaving with no place to go in the module tree: for another view of
//! its own board, or for a reading of no board. A board that stands somewhere in
//! the tree leaves on a passage instead (`crate::passage`).
//!
//! Leaving starts the moment somebody asks, not when the next picture arrives: a
//! pane that sat unchanged until then feels as if the click had not been heard.
//! It ends invisible, so a slow draw leaves an empty pane rather than a board
//! nobody is reading any more.

use archboard_scene::geometry::Rect;
use archboard_scene::scene::{Group, Item, Role, Scene};
use serde::Deserialize;

use super::ease::{lerp, scale_about};
use crate::passage::Side;
use crate::timing::Curve;

/// How far the picture shrinks as it goes.
const LEAVING_SCALE: f64 = 0.98;

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
    /// To a board at the same depth, on the side `side` says, or anywhere else.
    Across {
        /// Which way the board stands, when it stands beside this one.
        #[serde(default)]
        side: Option<Side>,
    },
}

/// How much of a picture shows at a share of its leaving.
pub fn visible_at(progress: f64) -> f64 {
    1.0 - LEAVE_EASING.at(progress)
}

/// The last picture on its way out, its ground not drawn.
///
/// Progress is a share of the whole leaving. The picture ends invisible, and
/// nothing is answered once it is as good as gone. The definitions it refers to
/// are the scene's own.
pub fn departure(scene: &Scene, progress: f64) -> Vec<Item> {
    let eased = LEAVE_EASING.at(progress);
    let visible = 1.0 - eased;
    if visible <= VISIBLE_FLOOR {
        return Vec::new();
    }
    let page = Rect {
        x: 0.0,
        y: 0.0,
        width: scene.width,
        height: scene.height,
    };
    let mut leaving = Group::new(Role::Marks, scene.body.clone());
    leaving.opacity = Some(visible);
    leaving.transform = Some(scale_about(page, lerp(1.0, LEAVING_SCALE, eased)));
    vec![Item::Group(leaving)]
}

#[cfg(test)]
mod tests {
    use super::{Heading, departure};
    use crate::between::testing::{card, rect, scene};
    use crate::passage::Side;
    use archboard_scene::scene::Item;

    #[test]
    fn a_picture_leaving_ends_invisible_and_recedes_about_its_middle() {
        let frame = rect(10.0, 10.0, 100.0, 50.0);
        let board = scene(vec![card("a", frame, &["Title"])], &[("a", frame)]);

        assert!(departure(&board, 1.0).is_empty(), "nothing is left of it");
        let [Item::Group(leaving)] = &departure(&board, 0.5)[..] else {
            panic!("the picture leaves as one group")
        };
        let receded = leaving.transform.expect("scaled");
        assert!(receded.scale.is_some_and(|scale| scale < 1.0));
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
            Heading::Across { side: None }
        );
        assert_eq!(
            serde_json::from_str::<Heading>(r#"{"way":"across","side":"left"}"#)
                .expect("a heading"),
            Heading::Across {
                side: Some(Side::Left)
            }
        );
    }
}
