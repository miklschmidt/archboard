//! A frame is a well cut into whatever holds it, and its tab is a raised piece
//! that stands on the well's edge. The well shows its depth as a slab does: walls
//! inside its box, a shaded top wall, a floor a step below, a lit lip and a crease
//! at its foot. Its top edge and inner shadow cross its whole width, under the tab
//! too, so the edge parts the tab from the well. One closed path goes round the tab
//! and the well, with one radius at every corner, and the tab's left side is the
//! well's. A tray casts no shadow.

use crate::geometry::{Point, Rect, round_coord};
use crate::paint::build::{Items, lines, point, shape};
use crate::paint::design::{BAND_RADIUS, TRAY_CREASE, TRAY_LIP, TRAY_WALL};
use crate::paint::flowchart_shapes::ring;
use crate::paint::palette::Palette;
use crate::paint::polygon::Polygon;
use crate::paint::slab::{plate, slab_seat, solid_ghost};
use crate::paint::standing::{OUTLINE_WIDTH, ink_of, outline_dash};
use crate::request::Standing;
use crate::scene::{
    Colour, Definition, Gradient, GradientForm, GradientId, Paint, PathStep, Pointer, Purpose,
    Shape, Stop, Stroke,
};

/// How a tray looks: its floor, its tab and the line round it.
#[derive(Clone, Debug, PartialEq)]
pub(super) struct TrayLook {
    pub floor: Colour,
    pub top_wall: Colour,
    pub side_wall: Colour,
    pub tab: Colour,
    pub line: Colour,
}

/// How heavy the line round a tray is.
const LINE_WIDTH: f64 = 1.0;
/// How far the inner shadow reaches down the floor from the top wall.
const SHADE_REACH: f64 = BAND_RADIUS;
/// The corners of a well's floor.
const FLOOR_RADIUS: f64 = BAND_RADIUS - TRAY_WALL;

/// What a frame draws: its box, and the box of the tab at its top left.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct Well {
    pub frame: Rect,
    pub tab: Rect,
}

impl Well {
    /// The top edge of the well: the foot of the tab.
    fn edge(&self) -> f64 {
        self.frame.y + self.tab.height
    }

    /// The well's box: what stands below the tab.
    pub(super) fn body(&self) -> Rect {
        Rect {
            y: self.edge(),
            height: self.frame.height - self.tab.height,
            ..self.frame
        }
    }

    /// The corners of the silhouette, for what a comparison or a selection draws round it.
    pub(super) fn outline(&self) -> Polygon {
        let (end, edge) = (self.tab_end(), self.edge());
        let (top, foot) = (self.frame.y, self.frame.y + self.frame.height);
        let (left, right) = (self.frame.x, self.right());
        let corner = |x: f64, y: f64| Point { x, y };
        vec![
            corner(left, top),
            corner(end, top),
            corner(end, edge),
            corner(right, edge),
            corner(right, foot),
            corner(left, foot),
        ]
    }

    /// Where the tab ends.
    fn tab_end(&self) -> f64 {
        self.frame.x + self.tab.width
    }

    /// Where the tab's foot has curved out to the edge of the well.
    fn foot_end(&self) -> f64 {
        self.tab_end() + BAND_RADIUS
    }

    /// The right of the frame.
    fn right(&self) -> f64 {
        self.frame.x + self.frame.width
    }

    /// The foot of the walls, above the lip and the crease.
    fn wall_foot(&self) -> f64 {
        self.frame.y + self.frame.height - TRAY_LIP - TRAY_CREASE
    }

    /// The floor's box: inside the walls, the lip and the crease.
    fn floor(&self) -> Rect {
        let top = self.edge() + TRAY_WALL;
        Rect {
            x: self.frame.x + TRAY_WALL,
            y: top,
            width: self.frame.width - 2.0 * TRAY_WALL,
            height: self.wall_foot() - top,
        }
    }

    /// Up a left side, round the top of the tab, and out along the concave foot.
    fn over_tab(&self, from: f64) -> Vec<PathStep> {
        let (left, top) = (self.frame.x, self.frame.y);
        let (end, edge) = (self.tab_end(), self.edge());
        vec![
            PathStep::Move {
                to: point(left, from),
            },
            PathStep::Down {
                y: round_coord(top + BAND_RADIUS),
            },
            corner(point(left + BAND_RADIUS, top), true),
            PathStep::Across {
                x: round_coord(end - BAND_RADIUS),
            },
            corner(point(end, top + BAND_RADIUS), true),
            PathStep::Down {
                y: round_coord(edge - BAND_RADIUS),
            },
            corner(point(end + BAND_RADIUS, edge), false),
        ]
    }

    /// Along the well's top from the start of the run, round the frame, to its
    /// left side above its foot.
    fn round_well(&self, foot: f64) -> Vec<PathStep> {
        let (left, right, edge) = (self.frame.x, self.right(), self.edge());
        vec![
            PathStep::Across {
                x: round_coord(right - BAND_RADIUS),
            },
            corner(point(right, edge + BAND_RADIUS), true),
            PathStep::Down {
                y: round_coord(foot - BAND_RADIUS),
            },
            corner(point(right - BAND_RADIUS, foot), true),
            PathStep::Across {
                x: round_coord(left + BAND_RADIUS),
            },
            corner(point(left, foot - BAND_RADIUS), true),
            PathStep::Close,
        ]
    }

    /// The one closed path round the tab and the well, down to a foot.
    fn silhouette(&self, foot: f64) -> Vec<PathStep> {
        let mut steps = self.over_tab(foot - BAND_RADIUS);
        steps.extend(self.round_well(foot));
        steps
    }

    /// The well alone, its top edge straight across and its left corner square.
    fn well(&self, foot: f64) -> Vec<PathStep> {
        let mut steps = vec![PathStep::Move {
            to: point(self.frame.x, self.edge()),
        }];
        steps.extend(self.round_well(foot));
        steps
    }

    /// The one line round the tab and the well, with the well's edge under the tab.
    fn line(&self) -> Vec<PathStep> {
        let mut steps = self.silhouette(self.frame.y + self.frame.height);
        steps.push(PathStep::Move {
            to: point(self.frame.x, self.edge()),
        });
        steps.push(PathStep::Across {
            x: round_coord(self.foot_end()),
        });
        steps
    }

    /// The tab's face, down to the well's edge.
    fn face(&self) -> Vec<PathStep> {
        let mut steps = self.over_tab(self.edge());
        steps.push(PathStep::Close);
        steps
    }

    /// The band of the inner shadow the top wall throws down the floor.
    fn shade(&self) -> Rect {
        Rect {
            height: SHADE_REACH,
            ..self.floor()
        }
    }
}

/// A quarter turn of the one radius to a point.
fn corner(to: Point, clockwise: bool) -> PathStep {
    PathStep::Arc {
        radius: point(BAND_RADIUS, BAND_RADIUS),
        clockwise,
        to,
    }
}

/// A shape that takes no pointer.
fn solid(steps: Vec<PathStep>) -> Shape {
    Shape::path(Purpose::Solid, steps).pointer(Pointer::None)
}

/// What a frame draws under its tab: the crease, the lip, the walls, the floor and
/// the inner shadow. A removed frame draws nothing here.
pub(super) fn well_body(
    well: &Well,
    look: &TrayLook,
    palette: &Palette,
    standing: Option<Standing>,
) -> Items {
    if standing == Some(Standing::Removed) {
        return Items::new();
    }
    let foot = well.frame.y + well.frame.height;
    let side = Well {
        tab: Rect {
            height: well.tab.height + TRAY_WALL,
            ..well.tab
        },
        ..*well
    };
    lines(vec![
        shape(solid(well.well(foot)).filled(&palette.slab_shadow)),
        shape(solid(well.well(foot - TRAY_CREASE)).filled(&palette.tray_lip)),
        shape(solid(well.well(well.wall_foot())).filled(&look.top_wall)),
        shape(solid(side.well(well.wall_foot())).filled(&look.side_wall)),
        shape(plate(well.floor(), FLOOR_RADIUS).filled(&look.floor)),
        shape(plate(well.shade(), FLOOR_RADIUS).filled(Paint::Gradient {
            id: GradientId::WellShade,
        })),
    ])
}

/// A tab's face on the well's edge, and the one line round the tab and the well.
fn raised_tab(
    well: &Well,
    look: &TrayLook,
    palette: &Palette,
    standing: Option<Standing>,
) -> Items {
    let line = Stroke::new(&look.line, LINE_WIDTH);
    let mark = match (standing, ink_of(standing, palette)) {
        (Some(standing), Some(ink)) => shape(
            solid(well.face())
                .unfilled()
                .stroked(Stroke::new(ink, OUTLINE_WIDTH).dashed(outline_dash(standing))),
        ),
        _ => Items::new(),
    };
    lines(vec![
        shape(solid(well.face()).filled(&look.tab)),
        shape(solid(well.line()).unfilled().stroked(line)),
        mark,
    ])
}

/// What a tab draws at one view: its seat, its selection ring and the tab itself,
/// which a comparison's removal leaves as a ghost of the whole silhouette.
pub(super) fn tab_view(
    well: &Well,
    look: &TrayLook,
    palette: &Palette,
    standing: Option<Standing>,
) -> Items {
    let outline = well.outline();
    let drawn = if standing == Some(Standing::Removed) {
        solid_ghost(&outline, BAND_RADIUS, palette)
    } else {
        raised_tab(well, look, palette, standing)
    };
    lines(vec![
        slab_seat(well.tab, BAND_RADIUS),
        ring(&outline, BAND_RADIUS, standing, palette),
        drawn,
    ])
}

/// The floor's box, where a viewer lays a sequence's moving head.
pub(super) fn floor_of(rect: Rect) -> Rect {
    Rect {
        x: rect.x + TRAY_WALL,
        y: rect.y + TRAY_WALL,
        width: rect.width - 2.0 * TRAY_WALL,
        height: rect.height - TRAY_WALL - TRAY_LIP - TRAY_CREASE,
    }
}

/// The inner shadow of a well: dark at its top edge, fading down it.
pub(super) fn well_shade(palette: &Palette) -> Definition {
    let stop = |offset: f64, opacity: Option<f64>| Stop {
        offset: Some(offset),
        colour: palette.slab_shadow.clone(),
        opacity,
    };
    Definition::Gradient(Gradient {
        id: GradientId::WellShade,
        form: GradientForm::Linear {
            line: Some((Point { x: 0.0, y: 0.0 }, Point { x: 0.0, y: 1.0 })),
            user_space: false,
        },
        stops: vec![stop(0.0, None), stop(1.0, Some(0.0))],
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn starts(steps: &[PathStep]) -> Vec<Point> {
        (steps.iter())
            .filter_map(|step| match step {
                PathStep::Move { to } => Some(*to),
                _ => None,
            })
            .collect()
    }

    #[test]
    fn the_tab_stands_flush_left_and_the_edge_of_the_well_runs_under_it() {
        let frame = Rect {
            x: 40.0,
            y: 20.0,
            width: 500.0,
            height: 300.0,
        };
        let tab = Rect {
            height: 36.0,
            width: 200.0,
            ..frame
        };
        let well = Well { frame, tab };
        let line = well.line();
        let [round, edge] = starts(&line)[..] else {
            panic!("one path round the tab and the well, and the edge under the tab");
        };
        assert_eq!(round.x, frame.x);
        assert_eq!(edge, point(frame.x, frame.y + tab.height));
        assert_eq!(
            line.last(),
            Some(&PathStep::Across {
                x: frame.x + tab.width + BAND_RADIUS
            })
        );
        // The floor stands inside the well's walls, and its shadow stays on the floor.
        assert_eq!(well.shade().y, edge.y + TRAY_WALL);
    }
}
