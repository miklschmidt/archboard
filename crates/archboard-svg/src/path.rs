//! A path's steps spelt as SVG path data. The picture has always spelt its
//! paths in four ways, by what they are: a route with a comma in each point
//! and a space before each command; an outline with a space between every
//! number; a port's slot with no spaces at all; and a legend's sample with a
//! space only inside a point.

use archboard_scene::geometry::Point;
use archboard_scene::js;
use archboard_scene::scene::PathStep;

/// How a path is spelt.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Spelling {
    /// `M1,2 L3,4 Z`: a route, a mark, a glyph.
    Route,
    /// `M1,2 L3,4 z`: an arrowhead in its marker.
    Marker,
    /// `M 1 2 L 3 4 Z`: an outline with straight sides and rounded corners.
    Spaced,
    /// `M1,2H3A1,1 0 0 1 4,5Z`: a port's slot and its card's clip.
    Tight,
    /// `M1 2H3`: a legend's sample.
    Compact,
}

/// A number as path data spells it.
fn number(value: f64) -> String {
    js::number(value)
}

/// A point, its two numbers joined as the spelling joins them.
fn point(at: Point, spelling: Spelling) -> String {
    let joint = match spelling {
        Spelling::Spaced | Spelling::Compact => " ",
        Spelling::Route | Spelling::Marker | Spelling::Tight => ",",
    };
    format!("{}{joint}{}", number(at.x), number(at.y))
}

/// An arc's radius, flags and end, as every spelling writes them.
fn arc(radius: Point, clockwise: bool, to: Point, spelling: Spelling) -> String {
    format!(
        "{},{} 0 0 {} {}",
        number(radius.x),
        number(radius.y),
        u8::from(clockwise),
        point(to, spelling)
    )
}

/// One step: its command and its numbers.
fn step(step: &PathStep, spelling: Spelling) -> String {
    let at = |to: Point| point(to, spelling);
    let gap = if spelling == Spelling::Spaced {
        " "
    } else {
        ""
    };
    match *step {
        PathStep::Move { to } => format!("M{gap}{}", at(to)),
        PathStep::Line { to } => format!("L{gap}{}", at(to)),
        PathStep::Across { x } => format!("H{gap}{}", number(x)),
        PathStep::Down { y } => format!("V{gap}{}", number(y)),
        PathStep::Quad { control, to } => format!("Q{gap}{} {}", at(control), at(to)),
        PathStep::Cubic { first, second, to } => {
            format!("C{gap}{} {} {}", at(first), at(second), at(to))
        }
        PathStep::Arc {
            radius,
            clockwise,
            to,
        } => format!("A{}", arc(radius, clockwise, to, spelling)),
        PathStep::AcrossBy { dx } => format!("h{}", number(dx)),
        PathStep::DownBy { dy } => format!("v{}", number(dy)),
        PathStep::ArcBy {
            radius,
            clockwise,
            by,
        } => format!("a{}", arc(radius, clockwise, by, spelling)),
        PathStep::Close if spelling == Spelling::Marker => "z".to_owned(),
        PathStep::Close => "Z".to_owned(),
    }
}

/// A path's steps as path data.
pub(crate) fn path_data(steps: &[PathStep], spelling: Spelling) -> String {
    let between = match spelling {
        Spelling::Route | Spelling::Marker | Spelling::Spaced => " ",
        Spelling::Tight | Spelling::Compact => "",
    };
    steps
        .iter()
        .map(|one| step(one, spelling))
        .collect::<Vec<_>>()
        .join(between)
}

#[cfg(test)]
mod tests {
    use super::{Spelling, path_data};
    use archboard_scene::geometry::Point;
    use archboard_scene::scene::PathStep;

    const fn at(x: f64, y: f64) -> Point {
        Point { x, y }
    }

    #[test]
    fn spells_each_family_as_the_picture_always_has() {
        let steps = [
            PathStep::Move { to: at(1.0, 2.5) },
            PathStep::Across { x: 3.0 },
            PathStep::Arc {
                radius: at(1.0, 1.0),
                clockwise: true,
                to: at(4.0, 5.0),
            },
            PathStep::Close,
        ];
        assert_eq!(
            path_data(&steps, Spelling::Route),
            "M1,2.5 H3 A1,1 0 0 1 4,5 Z"
        );
        assert_eq!(
            path_data(&steps, Spelling::Tight),
            "M1,2.5H3A1,1 0 0 1 4,5Z"
        );
        assert_eq!(path_data(&steps[..2], Spelling::Spaced), "M 1 2.5 H 3");
        assert_eq!(path_data(&steps[..2], Spelling::Compact), "M1 2.5H3");
        assert_eq!(
            path_data(&[steps[0], steps[3]], Spelling::Marker),
            "M1,2.5 z"
        );
    }
}
