//! The outlines of glyphs and icons, each built once. A glyph's outline comes
//! from the core's own faces. An icon's comes from the host's icon set, which
//! the scene names and does not carry.

use std::collections::{BTreeMap, HashMap};
use std::rc::Rc;

use archboard_text::{Face, Segment, outline};
use kurbo::BezPath;

/// The outlines a painter keeps from frame to frame.
#[derive(Clone, Debug, Default)]
pub struct Outlines {
    glyphs: HashMap<(Face, u32), Rc<BezPath>>,
    icons: HashMap<String, Rc<[BezPath]>>,
}

impl Outlines {
    /// Add icons to what a painter knows, each as its SVG path data.
    pub fn learn_icons(&mut self, icons: &BTreeMap<String, Vec<String>>) {
        for (name, data) in icons {
            let paths: Vec<BezPath> = data
                .iter()
                .filter_map(|data| BezPath::from_svg(data).ok())
                .collect();
            self.icons.insert(name.clone(), paths.into());
        }
    }

    /// The outline of a glyph, in the units of its face.
    pub(crate) fn glyph(&mut self, face: Face, id: u32) -> Rc<BezPath> {
        Rc::clone(self.glyphs.entry((face, id)).or_insert_with(|| {
            let mut path = BezPath::new();
            for segment in outline(face, id).iter() {
                match *segment {
                    Segment::Move(x, y) => path.move_to((x, y)),
                    Segment::Line(x, y) => path.line_to((x, y)),
                    Segment::Quad(cx, cy, x, y) => path.quad_to((cx, cy), (x, y)),
                    Segment::Cubic(ax, ay, bx, by, x, y) => {
                        path.curve_to((ax, ay), (bx, by), (x, y));
                    }
                    Segment::Close => path.close_path(),
                }
            }
            Rc::new(path)
        }))
    }

    /// The paths of an icon.
    pub(crate) fn icon(&self, name: &str) -> Option<Rc<[BezPath]>> {
        self.icons.get(name).map(Rc::clone)
    }
}
