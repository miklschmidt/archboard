//! What a picture shows besides its scene. The scene says what is drawn. This
//! says how it is seen right now, so that one scene answers the hand with no
//! new scene. A painter takes a scene and this, and one frame comes out.

use std::collections::{HashMap, HashSet};

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
    /// The flow heads held at the top of the view.
    pub stuck: HashSet<String>,
    /// How the picture recedes behind what is lit.
    pub recede: Recede,
    /// The traffic's clock in seconds, or nothing when it is not shown.
    pub traffic: Option<f64>,
}
