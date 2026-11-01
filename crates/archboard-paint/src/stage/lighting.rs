//! How a picture stands in the light, as time goes on.

use std::collections::HashMap;

use crate::presentation::{Light, Recede};
use crate::timing::{EASE_OUT, Fade};

/// One subject in the light, and whether it stays there when its fade ends.
#[derive(Clone, Copy, Debug)]
struct Shining {
    fade: Fade,
    staying: bool,
}

/// The fades of the light.
#[derive(Clone, Debug)]
pub(super) struct Lighting {
    rest: Fade,
    labels: Fade,
    subjects: HashMap<String, Shining>,
}

impl Default for Lighting {
    fn default() -> Self {
        Lighting {
            rest: Fade::still(1.0),
            labels: Fade::still(1.0),
            subjects: HashMap::new(),
        }
    }
}

impl Lighting {
    /// Set out for what the light says.
    pub(super) fn set(&mut self, light: &Light, now: f64) {
        let ms = light.duration;
        self.rest = self.rest.toward(light.rest, now, 0.0, ms, EASE_OUT);
        self.labels = self.labels.toward(light.labels, now, 0.0, ms, EASE_OUT);
        for (id, shining) in &mut self.subjects {
            if !light.subjects.contains_key(id) {
                shining.fade = shining.fade.toward(light.rest, now, 0.0, ms, EASE_OUT);
                shining.staying = false;
            }
        }
        for (id, shine) in &light.subjects {
            let from = self
                .subjects
                .get(id)
                .map_or(self.rest, |shining| shining.fade);
            self.subjects.insert(
                id.clone(),
                Shining {
                    fade: from.toward(shine.opacity, now, shine.delay, ms, EASE_OUT),
                    staying: true,
                },
            );
        }
    }

    /// Stand where the light is going: a picture that just entered has no last
    /// light to fade from.
    pub(super) fn stand(&mut self) {
        self.rest = Fade::still(self.rest.target());
        self.labels = Fade::still(self.labels.target());
        self.subjects.retain(|_, shining| shining.staying);
        for shining in self.subjects.values_mut() {
            shining.fade = Fade::still(shining.fade.target());
        }
    }

    /// What recedes at a moment. What has left the light by then is forgotten.
    pub(super) fn recede_at(&mut self, now: f64) -> Recede {
        self.subjects
            .retain(|_, shining| shining.staying || !shining.fade.done(now));
        Recede {
            rest: self.rest.at(now),
            labels: self.labels.at(now),
            subjects: self
                .subjects
                .iter()
                .map(|(id, shining)| (id.clone(), shining.fade.at(now)))
                .collect(),
        }
    }

    /// Whether any of it is still changing at a moment.
    pub(super) fn moving(&self, now: f64) -> bool {
        !(self.rest.done(now) && self.labels.done(now))
            || self
                .subjects
                .values()
                .any(|shining| !shining.fade.done(now))
    }
}
