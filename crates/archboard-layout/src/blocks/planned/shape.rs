//! One fixed placement and the routes selected inside it.

use crate::{
    blocks::assembly::{Placed, PlacedLine},
    geometry::Rect,
};
use std::{collections::BTreeMap, rc::Rc};

pub(super) const CLEAR: f64 = 32.0;

#[derive(Clone)]
pub(super) struct ScopePlacement {
    pub bounds: Rect,
}

#[derive(Clone)]
pub(super) struct Shape {
    pub drawing: Rc<Placed>,
    pub routes: Vec<PlacedLine>,
    pub endpoints: Rc<BTreeMap<usize, Rect>>,
    pub scopes: Rc<BTreeMap<usize, ScopePlacement>>,
    pub labels: BTreeMap<usize, Rect>,
    pub fallbacks: usize,
    pub channel_geometry: Rc<super::channel::GeometryCache>,
    pub label_geometry: Rc<std::cell::OnceCell<super::label_space::Protection>>,
}

impl Shape {
    /// Candidate labels are recomputed, so do not copy the discarded label map.
    pub(super) fn without_labels(&self) -> Self {
        Self {
            drawing: Rc::clone(&self.drawing),
            routes: self.routes.clone(),
            endpoints: Rc::clone(&self.endpoints),
            scopes: Rc::clone(&self.scopes),
            labels: BTreeMap::new(),
            fallbacks: self.fallbacks,
            channel_geometry: Rc::clone(&self.channel_geometry),
            label_geometry: Rc::clone(&self.label_geometry),
        }
    }

    pub(super) fn new(mut drawing: Placed) -> Self {
        let routes = std::mem::take(&mut drawing.edges);
        Self {
            drawing: Rc::new(drawing),
            routes,
            endpoints: Rc::new(BTreeMap::new()),
            scopes: Rc::new(BTreeMap::new()),
            labels: BTreeMap::new(),
            fallbacks: 0,
            channel_geometry: Rc::default(),
            label_geometry: Rc::default(),
        }
    }
}
