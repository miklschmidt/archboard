//! A frame is a well cut into whatever holds it, and its tab is a raised piece
//! that stands on the well's edge. The picture looks at a well from below its foot,
//! so it shows one wall: the top wall, which is the rim less itself moved down, and
//! so thins to nothing round both top corners. A side wall stands edge on, and what
//! shows of it is the soft shadow its rim leaves on the floor. The floor stands a
//! step below, with a lit lip at its foot. The top edge and inner shadow cross the
//! whole width, under the tab too, so the edge parts the tab from the well. The rim
//! turns down at both top corners, and at the left the tab fills the corner above
//! it. One closed path goes round the tab and the well, with one radius at every
//! corner, and the tab's left side is the well's. A tray casts no shadow.

use crate::geometry::{Point, Rect, round_coord};
use crate::paint::build::{Items, lines, point, shape};
use crate::paint::design::{BAND_RADIUS, TRAY_LIP, TRAY_WALL};
use crate::paint::flowchart_shapes::ring;
use crate::paint::palette::Palette;
use crate::paint::polygon::Polygon;
use crate::paint::shadow::{falling, shadow_ink};
use crate::paint::slab::{Rim, plate, rim_band, slab_seat, solid_ghost};
use crate::paint::standing::{OUTLINE_WIDTH, ink_of, outline_dash};
use crate::request::Standing;
use crate::scene::{
    Colour, Definition, Gradient, GradientForm, GradientId, Paint, PathStep, Pointer, Purpose,
    Shape, Stroke,
};

/// How a tray looks: its floor, its tab and the line round it.
#[derive(Clone, Debug, PartialEq)]
pub(super) struct TrayLook {
    pub floor: Colour,
    pub top_wall: Colour,
    pub tab: Colour,
    pub line: Colour,
}

/// How heavy the line round a tray is.
const LINE_WIDTH: f64 = 1.0;
/// How far the inner shadow reaches down the floor from the top wall.
const TOP_SHADE: f64 = 14.0;
/// How far the shadow of a side reaches across the floor.
const SIDE_SHADE: f64 = 12.0;
/// How strong the shadow of a side is, against the top wall's.
const SIDE_STRENGTH: f64 = 0.7;

/// How wide a band of shadow is painted: its reach, and the far corners it rounds past that.
const fn band_of(reach: f64) -> f64 {
    reach + BAND_RADIUS
}

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

    /// The foot of the walls, above the lip.
    fn wall_foot(&self) -> f64 {
        self.frame.y + self.frame.height - TRAY_LIP
    }

    /// The floor's box: the well's whole width, below the top wall and above the lip.
    fn floor(&self) -> Rect {
        let top = self.edge() + TRAY_WALL;
        Rect {
            y: top,
            height: self.wall_foot() - top,
            ..self.frame
        }
    }

    /// The bands of shadow on the floor, each rounded as the floor is. Where two
    /// overlap, they darken the corner as an inset shadow does.
    fn shades(&self) -> [(Rect, GradientId); 3] {
        let floor = self.floor();
        let side = Rect {
            width: band_of(SIDE_SHADE),
            ..floor
        };
        [
            (
                Rect {
                    height: band_of(TOP_SHADE),
                    ..floor
                },
                GradientId::WellShade,
            ),
            (side, GradientId::WellLeftShade),
            (
                Rect {
                    x: self.right() - side.width,
                    ..side
                },
                GradientId::WellRightShade,
            ),
        ]
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

    /// The rim's start: down the left side, under the tab's corner.
    fn rim_start(&self) -> Point {
        point(self.frame.x, self.edge() + BAND_RADIUS)
    }

    /// The rim's left corner, from its start to the well's top edge.
    fn rim_corner(&self) -> PathStep {
        corner(point(self.frame.x + BAND_RADIUS, self.edge()), true)
    }

    /// The well alone, its top edge straight across between two rounded corners.
    fn well(&self, foot: f64) -> Vec<PathStep> {
        let mut steps = vec![
            PathStep::Move {
                to: self.rim_start(),
            },
            self.rim_corner(),
        ];
        steps.extend(self.round_well(foot));
        steps
    }

    /// The one line round the tab and the well, with the well's edge under the tab.
    fn line(&self) -> Vec<PathStep> {
        let mut steps = self.silhouette(self.frame.y + self.frame.height);
        steps.extend([
            PathStep::Move {
                to: self.rim_start(),
            },
            self.rim_corner(),
            PathStep::Across {
                x: round_coord(self.foot_end()),
            },
        ]);
        steps
    }

    /// The tab's face, down to the well's edge and round the rim's corner.
    fn face(&self) -> Vec<PathStep> {
        let mut steps = self.over_tab(self.rim_start().y);
        steps.extend([
            PathStep::Across {
                x: round_coord(self.frame.x + BAND_RADIUS),
            },
            corner(self.rim_start(), false),
            PathStep::Close,
        ]);
        steps
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

/// What a frame draws under its tab: the lip, the floor, the inner shadow and the
/// top wall. A removed frame draws nothing here.
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
    let mut items = vec![
        shape(solid(well.well(foot)).filled(&palette.tray_lip)),
        shape(solid(well.well(well.wall_foot())).filled(&look.floor)),
    ];
    items.extend(
        well.shades()
            .map(|(band, id)| shape(plate(band, BAND_RADIUS).filled(Paint::Gradient { id }))),
    );
    items.push(rim_band(
        well.body(),
        BAND_RADIUS,
        TRAY_WALL,
        Rim::Top,
        &look.top_wall,
    ));
    lines(items)
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

/// The floor's box clear of the side shadows, where a viewer lays a sequence's
/// moving head.
pub(super) fn floor_of(rect: Rect) -> Rect {
    Rect {
        x: rect.x + SIDE_SHADE,
        y: rect.y + TRAY_WALL,
        width: rect.width - 2.0 * SIDE_SHADE,
        height: rect.height - TRAY_WALL - TRAY_LIP,
    }
}

/// The inner shadow of a well: what falls from its top wall, and what each side
/// leaves on the floor, which is weaker because the light falls straight down.
pub(super) fn well_shades(palette: &Palette) -> Vec<Definition> {
    let at = |x: f64, y: f64| Point { x, y };
    let band = |id: GradientId, line: (Point, Point), reach: f64, strength: f64| {
        Definition::Gradient(Gradient {
            id,
            form: GradientForm::Linear {
                line: Some(line),
                user_space: false,
            },
            stops: falling(&shadow_ink(palette, strength), reach / band_of(reach)),
        })
    };
    vec![
        band(
            GradientId::WellShade,
            (at(0.0, 0.0), at(0.0, 1.0)),
            TOP_SHADE,
            1.0,
        ),
        band(
            GradientId::WellLeftShade,
            (at(0.0, 0.0), at(1.0, 0.0)),
            SIDE_SHADE,
            SIDE_STRENGTH,
        ),
        band(
            GradientId::WellRightShade,
            (at(1.0, 0.0), at(0.0, 0.0)),
            SIDE_SHADE,
            SIDE_STRENGTH,
        ),
    ]
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
        let [round, rim] = starts(&line)[..] else {
            panic!("one path round the tab and the well, and the edge under the tab");
        };
        assert_eq!(round.x, frame.x);
        assert_eq!(rim, point(frame.x, frame.y + tab.height + BAND_RADIUS));
        assert_eq!(
            line.last(),
            Some(&PathStep::Across {
                x: frame.x + tab.width + BAND_RADIUS
            })
        );
    }

    #[test]
    fn the_floor_reaches_both_sides_where_only_a_shadow_marks_the_wall() {
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
        let floor = well.floor();
        assert_eq!((floor.x, floor.width), (frame.x, frame.width));
        // Each band of shadow stands on the floor, against its own edge.
        let [top, left, right] = well.shades().map(|(band, _)| band);
        assert_eq!((top.x, top.y, top.width), (floor.x, floor.y, floor.width));
        assert_eq!(
            (left.x, left.y, left.height),
            (floor.x, floor.y, floor.height)
        );
        assert_eq!(right.x + right.width, floor.x + floor.width);
    }

    #[test]
    fn the_rim_rounds_at_both_top_corners_and_the_tab_fills_the_left_one() {
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
        let edge = frame.y + tab.height;
        let left = corner(point(frame.x + BAND_RADIUS, edge), true);
        let right = corner(point(frame.x + frame.width, edge + BAND_RADIUS), true);
        let rim = well.well(frame.y + frame.height);
        assert_eq!(
            rim[0],
            PathStep::Move {
                to: well.rim_start()
            }
        );
        assert_eq!(rim[1], left);
        assert!(rim.contains(&right));
        // The tab's foot meets the rim's corner and turns back along it, so no gap stands there.
        let face = well.face();
        assert_eq!(
            face[0],
            PathStep::Move {
                to: well.rim_start()
            }
        );
        assert_eq!(face[face.len() - 2], corner(well.rim_start(), false));
    }
}
