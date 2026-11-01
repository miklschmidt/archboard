//! What a picture shows besides its scene. The scene says what is drawn. This
//! says how it is seen right now, so that one scene answers the hand with no
//! new scene. A painter takes a scene and this, and one frame comes out.

use std::collections::{HashMap, HashSet};

use serde::Deserialize;

use crate::sweep::Sweep;
use crate::warnings::Warnings;

/// Where the picture lies on the canvas, in canvas pixels.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Camera {
    /// The canvas position of the picture's left edge.
    pub x: f64,
    /// The canvas position of the picture's top edge.
    pub y: f64,
    /// Canvas pixels to one unit of the picture.
    pub scale: f64,
}

impl Default for Camera {
    fn default() -> Self {
        Camera {
            x: 0.0,
            y: 0.0,
            scale: 1.0,
        }
    }
}

/// How far each subject recedes behind what is lit, as an opacity from 0 to 1.
#[derive(Clone, Debug, PartialEq)]
pub struct Recede {
    /// A subject the table does not name.
    pub rest: f64,
    /// A relationship's label the table does not name: it stays readable.
    pub labels: f64,
    /// A subject the light names, by id. What is inside it does not recede.
    pub subjects: HashMap<String, f64>,
}

impl Default for Recede {
    fn default() -> Self {
        Recede {
            rest: 1.0,
            labels: 1.0,
            subjects: HashMap::new(),
        }
    }
}

/// How a picture is seen in one frame.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Presentation {
    /// Where the picture lies.
    pub camera: Camera,
    /// How far the picture is through its swap to the far view: 0 is the near
    /// view and 1 is the far view.
    pub far: f64,
    /// The subjects drawn with their selection ring.
    pub selected: HashSet<String>,
    /// The relationships lit along their whole route, shared stretches too.
    pub whole: HashSet<String>,
    /// How far each flow's head is held down from where the picture drew it,
    /// in the picture's units, by flow. A head with no drop stays where it is.
    pub heads: HashMap<String, f64>,
    /// How the picture recedes behind what is lit.
    pub recede: Recede,
    /// The traffic's clock in seconds, or nothing when it is not shown.
    pub traffic: Option<f64>,
    /// A card whose words fade while the camera flies into it, and how much of
    /// them shows.
    pub fading_words: Option<(String, f64)>,
    /// The subject whose control the pointer rests on.
    pub hovered_toggle: Option<String>,
    /// The lines that are being drawn on as they light.
    pub sweep: Option<Sweep>,
    /// The marks of the code check's warnings.
    pub warnings: Warnings,
}

impl Presentation {
    /// How far a flow's head is held down.
    pub fn drop_of(&self, flow: &str) -> f64 {
        self.heads.get(flow).copied().unwrap_or(0.0)
    }
}

/// How one lit subject stands in the light.
#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq)]
pub struct Shine {
    /// Its opacity, from 0 to 1.
    pub opacity: f64,
    /// How long it waits before it changes, in milliseconds: a further hop of a
    /// trace lights after a nearer one.
    pub delay: f64,
}

/// What the light says about a whole picture.
#[derive(Clone, Debug, Default, Deserialize, PartialEq)]
pub struct Light {
    /// The opacity of a subject that is not lit.
    pub rest: f64,
    /// The opacity of a relationship's label that is not lit.
    pub labels: f64,
    /// What is lit, by id.
    pub subjects: HashMap<String, Shine>,
    /// How long the change takes, in milliseconds.
    pub duration: f64,
}

/// What a page marks on a picture, whole, each time any of it changes. The
/// flow heads are not among them, because they move with the camera.
#[derive(Clone, Debug, Default, Deserialize, PartialEq, Eq)]
pub struct Marks {
    /// The subjects drawn with their selection ring.
    pub selected: HashSet<String>,
    /// The relationships lit along their whole route.
    pub whole: HashSet<String>,
}
