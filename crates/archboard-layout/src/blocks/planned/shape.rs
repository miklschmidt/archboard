//! One fixed placement and the routes selected inside it.

use crate::{
    blocks::assembly::{Placed, PlacedLine},
    geometry::{Rect, Side, inflate},
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
    /// The box a line ends on: a card, or a whole frame for a line from outside it.
    pub endpoints: Rc<BTreeMap<usize, Rect>>,
    /// The edge tab of each frame, by the frame's endpoint.
    pub tabs: Rc<BTreeMap<usize, Rect>>,
    pub scopes: Rc<BTreeMap<usize, ScopePlacement>>,
    pub labels: BTreeMap<usize, Rect>,
    pub fallbacks: usize,
    /// The lines of a door's trunk, each with whether its part is its source.
    pub trunk: Rc<BTreeMap<usize, bool>>,
    pub channel_geometry: Rc<super::channel::GeometryCache>,
    pub label_geometry: Rc<std::cell::OnceCell<super::label_space::Protection>>,
}

impl Shape {
    /// What other lines keep clear of: a card, or a frame's tab, as a frame's body is a scope.
    pub(super) fn solid(&self, endpoint: usize) -> Rect {
        self.tabs
            .get(&endpoint)
            .copied()
            .unwrap_or_else(|| self.endpoints[&endpoint])
    }

    /// What one line keeps clear of at one endpoint: its own ends are bare, and
    /// a line that ends on the foot of a tab touches that tab.
    pub(super) fn clearance(&self, ends: (usize, usize), foot: Option<usize>, id: usize) -> Rect {
        let own = |at: usize| at == ends.0 || at == ends.1;
        if own(id) {
            self.endpoints[&id]
        } else if foot.is_some_and(own) {
            self.solid(id)
        } else {
            inflate(self.solid(id), 16.0)
        }
    }

    /// The box whose wall takes a line. A frame's right wall starts below the tab's band.
    pub(super) fn wall(&self, endpoint: usize, side: Side) -> Rect {
        let at = self.endpoints[&endpoint];
        match self.tabs.get(&endpoint) {
            Some(tab) if side == Side::Right => Rect {
                y: at.y + tab.height,
                height: at.height - tab.height,
                ..at
            },
            _ => at,
        }
    }

    /// Candidate labels are recomputed, so do not copy the discarded label map.
    pub(super) fn without_labels(&self) -> Self {
        Self {
            drawing: Rc::clone(&self.drawing),
            routes: self.routes.clone(),
            endpoints: Rc::clone(&self.endpoints),
            tabs: Rc::clone(&self.tabs),
            scopes: Rc::clone(&self.scopes),
            labels: BTreeMap::new(),
            fallbacks: self.fallbacks,
            trunk: Rc::clone(&self.trunk),
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
            tabs: Rc::new(BTreeMap::new()),
            scopes: Rc::new(BTreeMap::new()),
            labels: BTreeMap::new(),
            fallbacks: 0,
            trunk: Rc::default(),
            channel_geometry: Rc::default(),
            label_geometry: Rc::default(),
        }
    }
}
