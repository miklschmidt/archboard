//! What a picture shows besides its scene. The scene says what is drawn. A
//! page's presentation says how it wants it seen, and the stage works out how
//! it is seen at each moment, so that one scene answers the hand with no new
//! scene. A painter takes a scene and this, and one frame comes out.

use std::collections::{HashMap, HashSet};

use serde::Deserialize;

use crate::palette::Theme;
use crate::sweep::Sweep;
use crate::warnings::Warnings;

/// Where the picture lies on the canvas, in canvas pixels.
#[derive(Clone, Copy, Debug, Deserialize, PartialEq)]
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
pub(crate) struct Recede {
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

/// How a picture is seen in one frame: where each value the page stated stands
/// at that moment.
#[derive(Clone, Debug, Default, PartialEq)]
pub(crate) struct Seen {
    /// Where the picture lies.
    pub camera: Camera,
    /// How far the picture has stepped back for the next, from 0 to 1.
    pub awaited: f64,
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

impl Seen {
    /// How far a flow's head is held down.
    pub(crate) fn drop_of(&self, flow: &str) -> f64 {
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
    /// The moment of the page's clock the change starts, in milliseconds.
    pub at: f64,
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

/// A value a page states over a time: where it goes, how long it takes to
/// get there in milliseconds, and the moment of the page's clock it starts.
#[derive(Clone, Copy, Debug, Deserialize, PartialEq)]
pub struct Timed<T> {
    /// Where the value goes.
    pub to: T,
    /// How long it takes, in milliseconds. At 0 it stands there at once.
    pub ms: f64,
    /// The moment of the page's clock it starts, in milliseconds.
    pub at: f64,
}

/// The scale of the camera where the far view begins, in canvas pixels to a
/// unit, and how long a swap takes, in milliseconds. A picture with no far view
/// has its line at 0.
#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq)]
pub struct FarLine {
    /// The scale at the line.
    pub scale: f64,
    /// How long a swap takes.
    pub ms: f64,
}

/// The lines a page draws on as they light, each after its delay in
/// milliseconds, by relationship id. A line takes its length over a speed,
/// between the shortest and the longest time. With no delays nothing is drawn
/// on.
#[derive(Clone, Debug, Default, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LineSweep {
    /// How long each line waits, by relationship id.
    pub delays: HashMap<String, f64>,
    /// The shortest a line takes, in milliseconds.
    pub shortest_ms: f64,
    /// The longest a line takes, in milliseconds.
    pub longest_ms: f64,
    /// The moment of the page's clock the sweep starts, in milliseconds.
    pub at: f64,
}

/// Which control the pointer rests on.
#[derive(Clone, Debug, Default, Deserialize, PartialEq, Eq)]
pub struct Hovered {
    /// The subject whose control it is, or none.
    pub toggle: Option<String>,
}

/// What a page says about how its picture is seen, never the picture itself.
/// A value it states replaces the last, in the order the fields are written,
/// and one it leaves out stays as it was. A timed value starts over from where
/// it stands each time it is stated.
#[derive(Clone, Debug, Default, Deserialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct Presentation {
    /// The theme the picture is drawn in.
    pub theme: Option<Theme>,
    /// The size of the canvas, in canvas pixels.
    pub size: Option<(f64, f64)>,
    /// Whether traffic runs: a person who asked for no motion sees none.
    pub traffic_shown: Option<bool>,
    /// How far each flow's head is held down from where the picture drew it,
    /// in the picture's units, by flow. The heads follow the camera, so a page
    /// says them apart from the marks.
    pub heads: Option<HashMap<String, f64>>,
    /// The subjects the code check warns about.
    pub warnings: Option<HashSet<String>>,
    /// What is marked on the picture.
    pub marks: Option<Marks>,
    /// Which control the pointer rests on.
    pub hovered: Option<Hovered>,
    /// Where the camera goes.
    pub camera: Option<Timed<Camera>>,
    /// Where the far view begins.
    pub far_line: Option<FarLine>,
    /// Whether the next picture is on its way: the picture on the stage steps
    /// back for it, or forward again.
    pub awaited: Option<Timed<bool>>,
    /// How the picture stands in the light.
    pub light: Option<Light>,
    /// The lines drawn on as they light. It replaces any sweep that runs.
    pub sweep: Option<LineSweep>,
}
