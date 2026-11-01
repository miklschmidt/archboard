//! The parts of a move that are not a carry: a subject only the last scene had
//! leaves, one only the next has arrives, and one drawn another way swaps in
//! place.

use archboard_scene::geometry::Rect;
use archboard_scene::scene::{Group, Item, Pointer, Role, Transform};

use super::ease::{ease_in_out, ease_out, emphasised, phase, scale_about, then};
use super::found::Found;
use super::phases::Transition;

/// How much a card leaving shrinks to.
const LEAVE_SCALE: f64 = 0.96;

/// How much a card arriving grows from.
const ARRIVE_SCALE: f64 = 0.94;

/// How much a card that blooms out of a picture grows from.
const BLOOM_SCALE: f64 = 0.84;

/// How far through its arrival a card shows in full.
const SHOWN_BY: f64 = 0.6;

/// Where a label that crosses the board is gone, as a share of the move.
pub(super) const LABEL_GONE_BY: f64 = 0.16;

/// The move that changes nothing.
const STILL: Transform = Transform::translate(0.0, 0.0);

/// How solid a group is drawn, whatever the move does to it.
fn base(group: &Group) -> f64 {
    group.opacity.unwrap_or(1.0)
}

/// A group borrowed from the last scene: drawn but not picked, and without the
/// crossing mask, which cuts gaps where nothing crosses here.
fn borrowed(group: &Group) -> Group {
    Group {
        mask: None,
        pointer: Some(Pointer::None),
        ..group.clone()
    }
}

/// A group scaled about the middle of a box, under the move it already has.
fn scaled_about(group: &mut Group, frame: Option<Rect>, scale: f64) {
    if let Some(frame) = frame {
        group.transform = Some(then(
            group.transform.unwrap_or(STILL),
            Some(scale_about(frame, scale)),
        ));
    }
}

/// A subject only the last scene had, seen off: it fades, and a card draws in on
/// itself a little as it goes.
#[derive(Clone, Debug)]
pub(super) struct Leave {
    group: Group,
    frame: Option<Rect>,
    /// How the plain groups around it moved it.
    outer: Option<Transform>,
    exit_end: f64,
}

impl Leave {
    /// A subject of the last scene, leaving.
    pub(super) fn new(found: &Found<'_>, phases: Transition) -> Leave {
        Leave {
            group: borrowed(found.group),
            frame: found
                .frame
                .filter(|_| found.form() == super::found::Form::Card),
            outer: found.outer,
            exit_end: phases.exit_end,
        }
    }

    /// Something of the last scene that is no subject, gone by a point of the move.
    pub(super) fn plain(item: Item, exit_end: f64) -> Leave {
        Leave {
            group: Group::new(Role::Marks, vec![item]),
            frame: None,
            outer: None,
            exit_end,
        }
    }

    /// The subject at a moment of the move: nothing once it is gone.
    pub(super) fn at(&self, progress: f64) -> Vec<Item> {
        let gone = ease_out(phase(progress, 0.0, self.exit_end));
        if gone >= 1.0 {
            return Vec::new();
        }
        let mut group = self.group.clone();
        group.opacity = Some(base(&group) * (1.0 - gone));
        scaled_about(&mut group, self.frame, 1.0 - (1.0 - LEAVE_SCALE) * gone);
        let item = Item::Group(group);
        match self.outer {
            Some(outer) => {
                let mut around = Group::new(Role::Marks, vec![item]);
                around.transform = Some(outer);
                vec![Item::Group(around)]
            }
            None => vec![item],
        }
    }
}

/// A card only the next scene has, grown into place and faded in.
#[derive(Clone, Debug)]
pub(super) struct Grow {
    group: Group,
    frame: Option<Rect>,
    start: f64,
    end: f64,
    /// How small it starts.
    from: f64,
    /// How far from its place it starts.
    pull: (f64, f64),
    /// How much of it shows at its start.
    shown: f64,
}

impl Grow {
    /// A card, arriving between two points of the move.
    pub(super) fn new(found: &Found<'_>, start: f64, end: f64) -> Grow {
        Grow {
            group: found.group.clone(),
            frame: found.frame,
            start,
            end,
            from: ARRIVE_SCALE,
            pull: (0.0, 0.0),
            shown: 0.0,
        }
    }

    /// Something that blooms out of a point between two points of the move: it
    /// starts some way from its place, small about a box.
    pub(super) fn bloom(
        group: Group,
        frame: Option<Rect>,
        (start, end): (f64, f64),
        pull: (f64, f64),
    ) -> Grow {
        Grow {
            group,
            frame,
            start,
            end,
            from: BLOOM_SCALE,
            pull,
            shown: 0.0,
        }
    }

    /// Something that flies from where the last picture drew it, showing as much
    /// as what is left of that picture does.
    pub(super) fn flown(
        group: Group,
        (old, new): (Rect, Rect),
        (start, end): (f64, f64),
        shown: f64,
    ) -> Grow {
        let middle = |rect: Rect| (rect.x + rect.width / 2.0, rect.y + rect.height / 2.0);
        let (from, to) = (middle(old), middle(new));
        Grow {
            group,
            frame: Some(new),
            start,
            end,
            from: (old.width / new.width).min(old.height / new.height),
            pull: (from.0 - to.0, from.1 - to.1),
            shown,
        }
    }

    /// Where the card finishes arriving.
    pub(super) fn end(&self) -> f64 {
        self.end
    }

    /// The card at a moment of the move.
    pub(super) fn at(&self, progress: f64) -> Group {
        let here = phase(progress, self.start, self.end);
        let mut group = self.group.clone();
        if here >= 1.0 {
            return group;
        }
        let shown = ease_out(phase(here, 0.0, SHOWN_BY));
        group.opacity = Some(self.shown + (base(&group) - self.shown) * shown);
        let placed = emphasised(here);
        scaled_about(
            &mut group,
            self.frame,
            self.from + (1.0 - self.from) * placed,
        );
        let left = 1.0 - placed;
        group.transform = Some(then(
            Transform::translate(self.pull.0 * left, self.pull.1 * left),
            group.transform,
        ));
        group
    }
}

/// Two drawings of one subject, swapped in place when there is no geometry to
/// carry one into the other: the old fades and the new fades in.
#[derive(Clone, Debug)]
pub(super) struct Swap {
    old: Group,
    new: Group,
    /// When the old drawing goes.
    out: (f64, f64),
    /// When the new drawing comes.
    arrives: (f64, f64),
}

impl Swap {
    /// The old drawing of a subject, and the new.
    pub(super) fn new(old: &Group, new: &Group, phases: Transition) -> Swap {
        let window = (phases.fade_start, phases.fade_end);
        Swap {
            old: borrowed(old),
            new: new.clone(),
            out: window,
            arrives: window,
        }
    }

    /// A label whose line travels far: it goes as the line sets off, and comes
    /// back where the line lands, so that no words cross the board.
    pub(super) fn across(old: &Group, new: &Group, phases: Transition) -> Swap {
        Swap {
            old: borrowed(old),
            new: new.clone(),
            out: (0.0, LABEL_GONE_BY),
            arrives: (phases.labels_start, 1.0),
        }
    }

    /// The pair at a moment of the move.
    pub(super) fn at(&self, progress: f64) -> Vec<Item> {
        let gone = ease_in_out(phase(progress, self.out.0, self.out.1));
        let come = ease_in_out(phase(progress, self.arrives.0, self.arrives.1));
        let mut new = self.new.clone();
        new.opacity = Some(base(&new) * come);
        let mut items = Vec::with_capacity(2);
        if gone < 1.0 {
            let mut old = self.old.clone();
            old.opacity = Some(base(&old) * (1.0 - gone));
            items.push(Item::Group(old));
        }
        items.push(Item::Group(new));
        items
    }
}

/// How solid a shared subject is drawn at each end of a move. A subject a
/// proposal removes fades to a ghost with the rest of its change, rather than
/// dropping to one at once while its colours are still on their way.
#[derive(Clone, Copy, Debug)]
pub(super) struct Ground {
    from: f64,
    to: f64,
    start: f64,
    end: f64,
}

impl Ground {
    /// The easing of a shared subject's opacity, or nothing when the two scenes
    /// draw it equally visible.
    pub(super) fn new(old: &Group, new: &Group, phases: Transition) -> Option<Ground> {
        let (from, to) = (base(old), base(new));
        (from != to).then_some(Ground {
            from,
            to,
            start: phases.fade_start,
            end: phases.fade_end,
        })
    }

    /// Draw a group this far through the move.
    pub(super) fn apply(self, group: &mut Group, progress: f64) {
        let t = ease_in_out(phase(progress, self.start, self.end));
        group.opacity = Some(self.from + (self.to - self.from) * t);
    }
}
