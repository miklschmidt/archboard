//! The label rules of a block's containers (TASK-349): where the label of a
//! line entering a container is held, and how hard the label of a line leaving
//! one is pulled.

use super::clusters::{Clusters, is_title};
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
    /// its upper: one extra weight when the line leaves a container.
    pub(crate) fn leaving_pull(&self, tail: &str, head: &str) -> f64 {
        if self.left_frames(tail, head).is_empty() {
            0.0
        } else {
            1.0
        }
    }
}
