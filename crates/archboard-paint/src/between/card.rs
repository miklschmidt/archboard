//! Carrying a card (a node, a container's frame or header, a connection's
//! label) from where it was drawn to where it is drawn now.
//!
//! The frame shapes, the body and the halo around it, are each an offset from
//! the card's box, so they are drawn at the moving box plus that offset. The
//! content is left as the next scene drew it, at its final place, and the
//! whole of it is moved back by however far the box still has to go. When the
//! content changed, the old content is borrowed from the last scene and moved
//! the same way from its own box, so that both ride inside the one moving frame
//! while one cross-fades into the other. A frame whose look changed, a
//! standing's outline taking it over, say, is cross-faded the same way, the old
//! frame riding over the new. Content is clipped to the frame only while the
//! frame changes size, which is when it spills.

use archboard_scene::geometry::{Point, Rect};
use archboard_scene::scene::{Geometry, Group, Item, Role, Shape, Transform, Viewport};

use super::content::{Paired, look, pair_content, shell, split};
use super::ease::{ease_in_out, emphasised, lerp, mix_rect, phase};
use super::found::Found;
use super::phases::Transition;

/// How far, in the picture's units, a card's content travels as it swaps: the
/// old content drops this far while it fades, the new settles this far down
/// into place. A fraction of a card's height, so the content is seen to move
/// and never to leave.
const CONTENT_DROP: f64 = 10.0;

/// How far either side of the swap a label's old and new words share, as a
/// fraction of the move.
const LABEL_OVERLAP: f64 = 0.12;

/// How close to the card's edge, in the picture's units, a mark sits to be
/// astride it. A standing's pin is inset three units from the body and a
/// warning badge sits in the top-right corner, both reaching outside the frame,
/// while a type chip is set well inside. Measured from the halo the card is
/// boxed by, which lies three units outside the body.
const MARK_MARGIN: f64 = 14.0;

/// How many times larger one box is than the other, on a side, for what a card
/// was drawn with to stop following the box. A door that opens into a frame is
/// a button and then a tray, and a button stretched to a tray's size is a bar of
/// bright colour across the picture.
const OPENS_INTO: f64 = 1.5;

/// The smallest side a clip is given, so that a box shrinking to nothing does
/// not divide by nothing.
const LEAST_SIDE: f64 = 1e-3;

/// Where one coordinate of a frame line stands, given where its card's box is
/// along that axis.
#[derive(Clone, Copy, Debug, PartialEq)]
enum Anchor {
    /// A distance from the box's start.
    Start(f64),
    /// A distance from the box's end.
    End(f64),
}

impl Anchor {
    fn at(self, start: f64, size: f64) -> f64 {
        match self {
            Anchor::Start(offset) => start + offset,
            Anchor::End(offset) => start + size + offset,
        }
    }

    /// Keep a coordinate its distance from whichever edge of the box it is nearer.
    fn nearer(value: f64, start: f64, size: f64) -> Anchor {
        let from_start = value - start;
        let from_end = value - (start + size);
        if from_start.abs() <= from_end.abs() {
            Anchor::Start(from_start)
        } else {
            Anchor::End(from_end)
        }
    }

    /// Where the two ends of a frame line keep to along one axis. Ends at one
    /// place, a rule across the card's width at one height, keep to the box's
    /// start together, as the content drawn beside them does, so the line never
    /// tilts. Ends at two places keep each to its nearer edge, so a rule spans
    /// the width and a lifeline the height of the box it is drawn in.
    fn pair(first: f64, second: f64, start: f64, size: f64) -> (Anchor, Anchor) {
        if first == second {
            let together = Anchor::Start(first - start);
            (together, together)
        } else {
            (
                Anchor::nearer(first, start, size),
                Anchor::nearer(second, start, size),
            )
        }
    }
}

/// How a frame shape keeps to its card's box.
#[derive(Clone, Debug, PartialEq)]
enum Place {
    /// A box: its edges relative to the card's.
    Rect { dx: f64, dy: f64, dw: f64, dh: f64 },
    /// A box of its own size that rides the corner of the card's box.
    Riding { dx: f64, dy: f64 },
    /// A line: each end's coordinates relative to the card's box.
    Line {
        x: (Anchor, Anchor),
        y: (Anchor, Anchor),
    },
}

/// One shape of a card's frame, and how to draw it wherever the card is.
#[derive(Clone, Debug)]
struct Frame {
    shape: Shape,
    place: Place,
}

impl Frame {
    /// A frame shape as an offset from the card's box. Only a box and a line
    /// are frame shapes.
    fn of(shape: &Shape, card: Rect) -> Option<Frame> {
        let place = match &shape.geometry {
            Geometry::Rect { rect, .. } => Place::Rect {
                dx: rect.x - card.x,
                dy: rect.y - card.y,
                dw: rect.width - card.width,
                dh: rect.height - card.height,
            },
            Geometry::Line { from, to } => Place::Line {
                x: Anchor::pair(from.x, to.x, card.x, card.width),
                y: Anchor::pair(from.y, to.y, card.y, card.height),
            },
            Geometry::Circle { .. } | Geometry::Path { .. } => return None,
        };
        Some(Frame {
            shape: shape.clone(),
            place,
        })
    }

    /// The shape drawn at a box.
    fn at(&self, card: Rect) -> Item {
        let mut shape = self.shape.clone();
        match (&mut shape.geometry, &self.place) {
            (Geometry::Rect { rect, .. }, Place::Rect { dx, dy, dw, dh }) => {
                *rect = Rect {
                    x: card.x + dx,
                    y: card.y + dy,
                    width: (card.width + dw).max(0.0),
                    height: (card.height + dh).max(0.0),
                };
            }
            (Geometry::Rect { rect, .. }, Place::Riding { dx, dy }) => {
                rect.x = card.x + dx;
                rect.y = card.y + dy;
            }
            (Geometry::Line { from, to }, Place::Line { x, y }) => {
                *from = Point {
                    x: x.0.at(card.x, card.width),
                    y: y.0.at(card.y, card.height),
                };
                *to = Point {
                    x: x.1.at(card.x, card.width),
                    y: y.1.at(card.y, card.height),
                };
            }
            _ => {}
        }
        Item::Shape(shape)
    }

    /// The same shape at its own size, riding the corner of the card's box.
    fn riding(mut self) -> Frame {
        if let Place::Rect { dx, dy, .. } = self.place {
            self.place = Place::Riding { dx, dy };
        }
        self
    }
}

/// Whether one box is so much larger than the other that a card opens or closes.
fn opens(small: Rect, large: Rect) -> bool {
    large.width > small.width * OPENS_INTO || large.height > small.height * OPENS_INTO
}

/// Whether a content item is a mark astride the card's edge, a standing's pin
/// or a warning badge, rather than something drawn inside it.
///
/// Such a mark reaches outside the frame by design, so it is not clipped to the
/// frame while the card is in flight. Clipped, it is cut to a sliver and
/// pops back whole when the picture lands.
fn is_corner_mark(item: &Item, card: Rect) -> bool {
    let Item::Group(Group {
        transform: Some(at),
        ..
    }) = item
    else {
        return false;
    };
    let near_x = at.x - card.x < MARK_MARGIN || card.x + card.width - at.x < MARK_MARGIN;
    let near_y = at.y - card.y < MARK_MARGIN || card.y + card.height - at.y < MARK_MARGIN;
    near_x || near_y
}

/// One role's content: what is drawn inside the frame, and the marks astride its edge.
#[derive(Clone, Debug, Default)]
struct Wrapped {
    inside: Vec<Item>,
    marks: Vec<Item>,
}

impl Wrapped {
    fn of<'a>(items: impl Iterator<Item = &'a Item>, card: Rect) -> Wrapped {
        let mut wrapped = Wrapped::default();
        for item in items {
            let side = if is_corner_mark(item, card) {
                &mut wrapped.marks
            } else {
                &mut wrapped.inside
            };
            side.push(item.clone());
        }
        wrapped
    }
}

/// Some items together, moved and faded as one. Nothing is drawn for what is
/// empty or not visible.
fn together(items: &[Item], dx: f64, dy: f64, opacity: f64) -> Option<Item> {
    if items.is_empty() || opacity <= 0.0 {
        return None;
    }
    let mut group = Group::new(Role::Marks, items.to_vec());
    if dx != 0.0 || dy != 0.0 {
        group.transform = Some(Transform::translate(dx, dy));
    }
    if opacity < 1.0 {
        group.opacity = Some(opacity);
    }
    Some(Item::Group(group))
}

/// What one card carries between its two boxes.
#[derive(Clone, Debug)]
pub(super) struct CardCarry {
    shell: Group,
    /// The entrance's growth, or another move still on the old group.
    from_transform: Option<Transform>,
    fixed: Vec<Item>,
    frames: Vec<Frame>,
    old_frames: Vec<Frame>,
    kept: Wrapped,
    incoming: Wrapped,
    outgoing: Wrapped,
    from: Rect,
    to: Rect,
    clipped: bool,
    label: bool,
    phases: Transition,
}

/// The old frame shapes whose look the new frame does not keep: an outline a
/// standing took over, a fill that changed. A shape that looks the same is not
/// borrowed. The new one is it.
fn fading_frame<'a>(old: &[&'a Shape], new: &[&Shape]) -> Vec<&'a Shape> {
    old.iter()
        .enumerate()
        .filter(|&(index, shape)| new.get(index).is_none_or(|own| look(own) != look(shape)))
        .map(|(_, shape)| *shape)
        .collect()
}

impl CardCarry {
    /// The carry of a card, or nothing when it neither moved nor changed.
    pub(super) fn new(
        before: &Found<'_>,
        from: Rect,
        after: &Found<'_>,
        to: Rect,
        phases: Transition,
    ) -> Option<CardCarry> {
        let (old, new) = (split(before.group, from), split(after.group, to));
        let Paired {
            kept,
            arriving,
            leaving,
        } = pair_content(&old.content, &new.content);
        let changed = !arriving.is_empty() || !leaving.is_empty();
        let fading = fading_frame(&old.frame, &new.frame);
        if from == to
            && !changed
            && fading.is_empty()
            && before.group.transform == after.group.transform
        {
            return None;
        }
        let pick = |from: &[&Item], at: &[usize]| -> Vec<Item> {
            at.iter().map(|&index| from[index].clone()).collect()
        };
        let framed = |shape: &&Shape, card: Rect, rides: bool| {
            Frame::of(shape, card).map(|frame| if rides { frame.riding() } else { frame })
        };
        Some(CardCarry {
            shell: shell(after.group),
            from_transform: before.group.transform,
            fixed: new.fixed.iter().map(|item| (*item).clone()).collect(),
            frames: new
                .frame
                .iter()
                .filter_map(|shape| framed(shape, to, opens(to, from)))
                .collect(),
            old_frames: fading
                .iter()
                .filter_map(|shape| framed(shape, from, opens(from, to)))
                .collect(),
            kept: Wrapped::of(pick(&new.content, &kept).iter(), to),
            incoming: Wrapped::of(pick(&new.content, &arriving).iter(), to),
            outgoing: Wrapped::of(pick(&old.content, &leaving).iter(), from),
            from,
            to,
            // Clipped while the frame changes size, and while content swaps: the
            // old content drops as it goes, and must not be seen below the frame.
            clipped: from.width != to.width || from.height != to.height || changed,
            label: after.is_label(),
            phases,
        })
    }

    /// The card at a moment of the move.
    pub(super) fn at(&self, progress: f64) -> Group {
        let t = &self.phases;
        let moved = emphasised(phase(progress, t.move_start, t.move_end));
        let card = mix_rect(self.from, self.to, moved);
        let mut items = self.fixed.clone();
        items.extend(self.frames.iter().map(|frame| frame.at(card)));
        let old: Vec<Item> = self.old_frames.iter().map(|frame| frame.at(card)).collect();
        let gone = ease_in_out(phase(progress, t.fade_start, t.fade_end));
        items.extend(together(&old, 0.0, 0.0, 1.0 - gone));
        self.content(&mut items, card, &self.swap(card, progress));
        Group {
            items,
            transform: self.transform_at(moved),
            ..self.shell.clone()
        }
    }

    /// Carry an unfinished entrance's scale and position into the next scene.
    fn transform_at(&self, moved: f64) -> Option<Transform> {
        if self.from_transform == self.shell.transform {
            return self.shell.transform;
        }
        let still = Transform::translate(0.0, 0.0);
        let from = self.from_transform.unwrap_or(still);
        let to = self.shell.transform.unwrap_or(still);
        Some(Transform {
            x: lerp(from.x, to.x, moved),
            y: lerp(from.y, to.y, moved),
            scale: Some(lerp(
                from.scale.unwrap_or(1.0),
                to.scale.unwrap_or(1.0),
                moved,
            )),
        })
    }

    /// Each role's content with where it stands and how visible it is.
    fn swap(&self, card: Rect, progress: f64) -> [(&Wrapped, f64, f64, f64); 3] {
        let t = &self.phases;
        let (from, to) = (self.from, self.to);
        let (go, come) = if self.label {
            // A label is a few words in a plate, where two sets of words fully over
            // each other read as a smudge and none at all reads as an empty plate:
            // the old words hand over to the new ones where they stand, overlapping
            // only while both are faint.
            (
                ease_in_out(phase(progress, t.fade_start, t.swap_at + LABEL_OVERLAP)),
                ease_in_out(phase(progress, t.swap_at - LABEL_OVERLAP, t.fade_end)),
            )
        } else {
            (
                ease_in_out(phase(progress, t.fade_start, t.swap_at)),
                ease_in_out(phase(progress, t.swap_at, t.fade_end)),
            )
        };
        // What leaves drops away as it fades, and once it is gone what arrives
        // settles down into place from just above: one after the other, so
        // nothing is seen twice at once.
        let drop = if self.label { 0.0 } else { CONTENT_DROP };
        [
            (&self.kept, card.x - to.x, card.y - to.y, 1.0),
            (
                &self.outgoing,
                card.x - from.x,
                card.y - from.y + drop * go,
                1.0 - go,
            ),
            (
                &self.incoming,
                card.x - to.x,
                card.y - to.y - drop * (1.0 - come),
                come,
            ),
        ]
    }

    /// Lay the content: inside the clip when there is one, then the marks
    /// astride the edge on top of everything.
    fn content(&self, items: &mut Vec<Item>, card: Rect, swap: &[(&Wrapped, f64, f64, f64); 3]) {
        let inside: Vec<Item> = swap
            .iter()
            .filter_map(|&(wrapped, dx, dy, opacity)| together(&wrapped.inside, dx, dy, opacity))
            .collect();
        if self.clipped {
            let frame = Rect {
                width: card.width.max(LEAST_SIDE),
                height: card.height.max(LEAST_SIDE),
                ..card
            };
            if !inside.is_empty() {
                items.push(Item::Viewport(Viewport {
                    frame,
                    view: frame,
                    items: inside,
                }));
            }
        } else {
            items.extend(inside);
        }
        items.extend(
            swap.iter().filter_map(|&(wrapped, dx, dy, opacity)| {
                together(&wrapped.marks, dx, dy, opacity)
            }),
        );
    }
}
