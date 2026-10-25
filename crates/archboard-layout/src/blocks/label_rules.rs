//! The label rules of a block's containers (TASK-349): where the label of a
//! line entering a container is held, and how hard the label of a line leaving
//! one is pulled.

use crate::geometry::Rect;
use crate::track::scene::Map;

use super::clusters::{Clusters, Link, is_title};
use super::laid::Laid;
use super::tree::ClusterKind;

impl Clusters<'_> {
    /// The innermost container a line enters: a frame its lower end stands in
    /// and its upper end does not. A group region is no boundary a line must go
    /// round, so a line enters none.
    pub(crate) fn entered_frame<'a>(&'a self, tail: &'a str, head: &'a str) -> Option<&'a str> {
        if is_title(head) {
            return None;
        }
        let theirs = self.around(tail);
        self.around(head)
            .into_iter()
            .find(|id| !theirs.contains(id) && self.block.clusters[*id].kind == ClusterKind::Frame)
    }

    /// The upper end of another labelled line into the same card from inside
    /// the container a line enters, which its label may be held below.
    pub(super) fn anchor_of<'a>(
        &self,
        tail: &str,
        head: &str,
        entered: &str,
        links: &'a [Link],
    ) -> Option<&'a str> {
        links
            .iter()
            .find(|link| {
                link.head == head
                    && link.labelled
                    && link.tail != tail
                    && self.around(&link.tail).contains(&entered)
            })
            .map(|link| link.tail.as_str())
    }

    /// Whether anchoring would hold some entering line's label below another
    /// line rather than below its container's title.
    pub(crate) fn anchorable(&self, links: &[Link]) -> bool {
        links.iter().any(|link| {
            let entered = if link.labelled {
                self.entered_frame(&link.tail, &link.head)
            } else {
                None
            };
            entered.is_some_and(|entered| {
                self.anchor_of(&link.tail, &link.head, entered, links)
                    .is_some()
            })
        })
    }

    /// The containers a line leaves: frames its upper end stands in and its lower end does not.
    fn left_frames<'a>(&'a self, tail: &'a str, head: &'a str) -> Vec<&'a str> {
        let theirs = self.around(head);
        self.around(tail)
            .into_iter()
            .filter(|id| {
                !theirs.contains(id) && self.block.clusters[*id].kind == ClusterKind::Frame
            })
            .collect()
    }

    /// How much harder a line's label is pulled onto its lower end than onto
    /// its upper: one where the line leaves a container and its block pulls such labels.
    pub(crate) fn leaving_pull(&self, tail: &str, head: &str) -> f64 {
        if self.pulls_leaving && !self.left_frames(tail, head).is_empty() {
            1.0
        } else {
            0.0
        }
    }

    /// How many lines' labels a laid-out block stands beside a container the line leaves.
    pub(crate) fn labels_beside(&self, links: &[Link], laid: &Laid) -> usize {
        let frames: Map<&str, Rect> = laid
            .frames
            .iter()
            .flatten()
            .map(|frame| (frame.id.as_str(), frame.bx))
            .collect();
        links
            .iter()
            .filter(|link| {
                let Some(at) = laid.boxes.get(&link.label) else {
                    return false;
                };
                link.labelled
                    && self
                        .left_frames(&link.tail, &link.head)
                        .iter()
                        .any(|id| frames.get(id).is_some_and(|frame| beside(at, frame)))
            })
            .count()
    }
}

/// Whether a box stands beside another: on some of its height, wholly left or right of it.
fn beside(one: &Rect, other: &Rect) -> bool {
    let level = one.y < other.y + other.height && other.y < one.y + one.height;
    level && (one.x >= other.x + other.width || one.x + one.width <= other.x)
}
