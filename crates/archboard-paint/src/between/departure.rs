//! A picture leaving with no place to go in the module tree: for another view of
//! its own picture, or for a reading of no picture. A picture that stands somewhere in
//! the tree leaves on a passage instead (`crate::passage`).
//!
//! Leaving starts the moment somebody asks, not when the next picture arrives: a
//! pane that sat unchanged until then feels as if the click had not been heard.
//! It ends invisible, so a slow draw leaves an empty pane rather than a picture
//! nobody is reading any more.

use archboard_scene::geometry::Rect;
use archboard_scene::scene::{Group, Item, Role};

use super::ease::{lerp, scale_about};
use crate::timing::Curve;

/// How far the picture shrinks as it goes.
const LEAVING_SCALE: f64 = 0.98;

/// The curve a picture leaves on: slow to start, gone quickly.
const LEAVE_EASING: Curve = Curve(0.4, 0.0, 1.0, 1.0);

/// Below this a picture is as good as gone, and needs no ghost.
const VISIBLE_FLOOR: f64 = 0.02;

/// How much of a picture shows at a share of its leaving.
pub(crate) fn visible_at(progress: f64) -> f64 {
    1.0 - LEAVE_EASING.at(progress)
}

/// A picture's body on its way out, its ground not drawn, as a page of a size
/// shows it.
///
/// Progress is a share of the whole leaving. The picture ends invisible, and
/// nothing is answered once it is as good as gone. The definitions it refers to
/// are the scene's own.
pub(crate) fn departing(body: Vec<Item>, (width, height): (f64, f64), progress: f64) -> Vec<Item> {
    let eased = LEAVE_EASING.at(progress);
    let visible = 1.0 - eased;
    if visible <= VISIBLE_FLOOR {
        return Vec::new();
    }
    let page = Rect {
        x: 0.0,
        y: 0.0,
        width,
        height,
    };
    let mut leaving = Group::new(Role::Marks, body);
    leaving.opacity = Some(visible);
    leaving.transform = Some(scale_about(page, lerp(1.0, LEAVING_SCALE, eased)));
    vec![Item::Group(leaving)]
}

#[cfg(test)]
mod tests {
    use super::departing;
    use crate::between::testing::{card, rect, scene};
    use archboard_scene::scene::Item;

    #[test]
    fn a_picture_leaving_ends_invisible_and_recedes_about_its_middle() {
        let frame = rect(10.0, 10.0, 100.0, 50.0);
        let picture = scene(vec![card("a", frame, &["Title"])], &[("a", frame)]);

        let leave = |progress| {
            departing(
                picture.body.clone(),
                (picture.width, picture.height),
                progress,
            )
        };
        assert!(leave(1.0).is_empty(), "nothing is left of it");
        let [Item::Group(leaving)] = &leave(0.5)[..] else {
            panic!("the picture leaves as one group")
        };
        let receded = leaving.transform.expect("scaled");
        assert!(receded.scale.is_some_and(|scale| scale < 1.0));
    }
}
