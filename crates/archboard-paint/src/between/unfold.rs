//! A door that opens, and what stands inside it.
//!
//! A door is a small card, and open it is a frame round its parts. The frame's own
//! carry takes the box from the one to the other. The parts ride inside that box
//! as one picture, at the scale of the box, so they grow out of the door and no
//! frame travels empty. A door that closes takes them back the same way.

use std::collections::HashMap;

use archboard_scene::geometry::Rect;
use archboard_scene::scene::{Group, Item, Transform};
use kurbo::Shape as _;

use super::ease::{ease_out, emphasised, mix_rect, phase, then};
use super::found::{Form, Found, Pairing};
use super::line::outline_of;
use super::phases::Transition;

/// A box on its way between two places, which carries the parts inside it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct Unfold {
    /// The box the parts are drawn in.
    rest: Rect,
    from: Rect,
    to: Rect,
    start: f64,
    end: f64,
}

/// The middle of a box.
fn middle(rect: Rect) -> (f64, f64) {
    (rect.x + rect.width / 2.0, rect.y + rect.height / 2.0)
}

impl Unfold {
    /// Where the box stands at a moment of the move.
    pub(super) fn box_at(&self, progress: f64) -> Rect {
        let moved = emphasised(phase(progress, self.start, self.end));
        mix_rect(self.from, self.to, moved)
    }

    /// What the box does to what stands inside it at a moment of the move.
    fn at(&self, progress: f64) -> Transform {
        let held = self.box_at(progress);
        let scale = (held.width / self.rest.width).min(held.height / self.rest.height);
        let (rest, now) = (middle(self.rest), middle(held));
        Transform {
            x: now.0 - rest.0 * scale,
            y: now.1 - rest.1 * scale,
            scale: Some(scale),
        }
    }

    /// Whether a box stands inside this one, by its middle.
    fn holds(&self, frame: Rect) -> bool {
        let (x, y) = middle(frame);
        let rest = self.rest;
        rest.x <= x && x <= rest.x + rest.width && rest.y <= y && y <= rest.y + rest.height
    }
}

/// The doors of a move.
#[derive(Clone, Debug, Default)]
pub(super) struct Doors {
    /// What was a card and is now a frame.
    pub(super) opened: Vec<Unfold>,
    /// What was a frame and is now a card.
    closed: Vec<Unfold>,
}

/// The innermost of some boxes that holds a frame.
fn innermost(unfolds: &[Unfold], frame: Rect) -> Option<Unfold> {
    unfolds
        .iter()
        .filter(|unfold| unfold.holds(frame) && unfold.rest != frame)
        .min_by(|a, b| {
            let area = |unfold: &Unfold| unfold.rest.width * unfold.rest.height;
            area(a).total_cmp(&area(b))
        })
        .copied()
}

/// The box a subject's group stands in: a line's is the box of its route.
fn box_of(found: &Found<'_>) -> Option<Rect> {
    match found.form() {
        Form::Card => found.frame,
        Form::Line => outline_of(found.group).map(|outline| {
            let bounds = outline.bounding_box();
            Rect {
                x: bounds.x0,
                y: bounds.y0,
                width: bounds.width(),
                height: bounds.height(),
            }
        }),
    }
}

/// Whether a line stands whole inside a box.
fn stays_inside(frame: Rect, unfold: &Unfold) -> bool {
    let rest = unfold.rest;
    frame.x >= rest.x
        && frame.y >= rest.y
        && frame.x + frame.width <= rest.x + rest.width
        && frame.y + frame.height <= rest.y + rest.height
}

impl Doors {
    /// Find the doors that open or close between two pictures.
    pub(super) fn of(
        old: &[Found<'_>],
        new: &[Found<'_>],
        pairing: &Pairing,
        phases: Transition,
    ) -> Doors {
        let mut doors = Doors::default();
        for &(a, b) in &pairing.shared {
            let (before, after) = (&old[a], &new[b]);
            let (Some(from), Some(to)) = (before.frame, after.frame) else {
                continue;
            };
            if before.ordinal != 0 || before.is_region() == after.is_region() {
                continue;
            }
            let unfold = |rest| Unfold {
                rest,
                from,
                to,
                start: phases.move_start,
                end: phases.move_end,
            };
            if after.is_region() {
                doors.opened.push(unfold(to));
            } else {
                doors.closed.push(unfold(from));
            }
        }
        doors
    }

    /// The box that carries a subject only the next picture has, if one does.
    pub(super) fn carrying(&self, new: &Found<'_>) -> Option<Unfold> {
        Doors::around(&self.opened, new)
    }

    /// The box each subject only the next picture has rides in, by id.
    pub(super) fn inside<'a>(
        &self,
        new: &[Found<'a>],
        added: &[usize],
    ) -> HashMap<&'a str, Unfold> {
        added
            .iter()
            .filter_map(|&at| Some((new[at].id, self.carrying(&new[at])?)))
            .collect()
    }

    /// The box that carries a subject only the last picture had, if one does.
    pub(super) fn taking(&self, old: &Found<'_>) -> Option<Unfold> {
        Doors::around(&self.closed, old)
    }

    /// The innermost box round a subject. A line rides only when it stands whole
    /// inside: one that leaves the box stays on the picture.
    fn around(unfolds: &[Unfold], found: &Found<'_>) -> Option<Unfold> {
        let frame = box_of(found)?;
        innermost(unfolds, frame)
            .filter(|unfold| found.form() == Form::Card || stays_inside(frame, unfold))
    }

    /// The largest box that opens: what a move is about, when it is about a door.
    pub(super) fn focus(&self) -> Option<Unfold> {
        self.opened
            .iter()
            .max_by(|a, b| {
                let area = |unfold: &Unfold| unfold.to.width * unfold.to.height;
                area(a).total_cmp(&area(b))
            })
            .copied()
    }
}

/// A part that rides inside a box.
#[derive(Clone, Debug)]
pub(super) struct Inside {
    item: Group,
    unfold: Unfold,
    /// When it shows, or goes.
    fade: (f64, f64),
    /// Whether it arrives, or leaves.
    arrives: bool,
}

impl Inside {
    /// A part that arrives inside a box.
    pub(super) fn arriving(group: Group, unfold: Unfold, fade: (f64, f64)) -> Inside {
        Inside {
            item: group,
            unfold,
            fade,
            arrives: true,
        }
    }

    /// A part that leaves inside a box.
    pub(super) fn leaving(group: Group, unfold: Unfold, fade: (f64, f64)) -> Inside {
        Inside {
            item: group,
            unfold,
            fade,
            arrives: false,
        }
    }

    /// The part at a moment of the move.
    pub(super) fn at(&self, progress: f64) -> Vec<Item> {
        let faded = ease_out(phase(progress, self.fade.0, self.fade.1));
        let visible = if self.arrives { faded } else { 1.0 - faded };
        if visible <= 0.0 {
            return Vec::new();
        }
        let mut group = self.item.clone();
        group.opacity = Some(group.opacity.unwrap_or(1.0) * visible);
        group.transform = Some(then(self.unfold.at(progress), group.transform));
        vec![Item::Group(group)]
    }
}

#[cfg(test)]
mod tests {
    use archboard_scene::geometry::Rect;

    use super::Unfold;

    /// A door 40 by 20 that opens into a frame 400 by 200, over the whole move.
    fn door() -> Unfold {
        let rect = |x, y, width, height| Rect {
            x,
            y,
            width,
            height,
        };
        Unfold {
            rest: rect(100.0, 100.0, 400.0, 200.0),
            from: rect(280.0, 190.0, 40.0, 20.0),
            to: rect(100.0, 100.0, 400.0, 200.0),
            start: 0.0,
            end: 1.0,
        }
    }

    #[test]
    fn the_parts_of_a_door_start_in_the_door_and_end_in_their_places() {
        let start = door().at(0.0);
        assert_eq!(start.scale, Some(0.1));
        let middle = |x: f64| x * 0.1 + start.x;
        assert!(
            (middle(300.0) - 300.0).abs() < 1e-9,
            "the door's own middle"
        );
        let end = door().at(1.0);
        assert_eq!(end.scale, Some(1.0));
        assert!(
            end.x.abs() < 1e-9 && end.y.abs() < 1e-9,
            "where they were drawn"
        );
    }

    #[test]
    fn a_door_holds_what_stands_in_its_frame() {
        let inside = Rect {
            x: 120.0,
            y: 120.0,
            width: 50.0,
            height: 30.0,
        };
        assert!(door().holds(inside));
        assert!(!door().holds(Rect { x: 600.0, ..inside }));
    }
}
