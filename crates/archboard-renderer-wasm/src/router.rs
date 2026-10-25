//! The router's binding: one call per routing, its scene and its answer as
//! flat numbers, so a call copies two arrays and nothing else.
//!
//! The scene: `clearance, lane, bend, crossing`, then the obstacle count and
//! `x, y, width, height` for each obstacle, then the connector count and two
//! ends for each connector, tail first. An end is
//! `kind, obstacle, x, y, leaves`: kind 0 is a pin on the obstacle (by index)
//! that leaves 0 up, 1 right, 2 down or 3 left; kind 1 is a free point, whose
//! obstacle and leaves are not read.
//!
//! The answer: for each connector, the count of its points and then `x, y`
//! for each, from its tail; a count of 0 is a connector with no route.

use archboard_router::{Dir, End, Params, Point, Rect, Route, Scene, route};
use wasm_bindgen::prelude::*;

struct Reader<'a> {
    numbers: &'a [f64],
    at: usize,
}

impl Reader<'_> {
    fn next(&mut self) -> Result<f64, JsError> {
        let value = *self
            .numbers
            .get(self.at)
            .ok_or_else(|| JsError::new("The router's scene ended early"))?;
        if !value.is_finite() {
            return Err(JsError::new(
                "The router's scene holds a number that is not finite",
            ));
        }
        self.at += 1;
        Ok(value)
    }

    fn count(&mut self) -> Result<usize, JsError> {
        let value = self.next()?;
        whole_below(value, usize::MAX).ok_or_else(|| {
            JsError::new("The router's scene holds a count that is not a whole number")
        })
    }

    fn end(&mut self, obstacles: usize) -> Result<End, JsError> {
        let kind = self.next()?;
        let obstacle = self.next()?;
        let at = Point {
            x: self.next()?,
            y: self.next()?,
        };
        let leaves = self.next()?;
        if kind == 1.0 {
            return Ok(End::Free { at });
        }
        let pin = whole_below(obstacle, obstacles).zip(whole_below(leaves, 4));
        let (0.0, Some((obstacle, leaves))) = (kind, pin) else {
            return Err(JsError::new(
                "The router's scene names an end it does not hold",
            ));
        };
        Ok(End::Pin {
            obstacle,
            at,
            leaves: [Dir::Up, Dir::Right, Dir::Down, Dir::Left][leaves],
        })
    }
}

/// A number as an index below `limit`, if it is a whole number that is one.
fn whole_below(value: f64, limit: usize) -> Option<usize> {
    (value >= 0.0 && value.fract() == 0.0 && value < limit as f64).then_some(value as usize)
}

/// Route a scene's connectors around its obstacles.
#[wasm_bindgen(js_name = routeTrunks)]
pub fn route_trunks(scene: &[f64]) -> Result<Vec<f64>, JsError> {
    let mut read = Reader {
        numbers: scene,
        at: 0,
    };
    let params = Params {
        clearance: read.next()?,
        lane: read.next()?,
        bend: read.next()?,
        crossing: read.next()?,
    };
    let obstacles = (0..read.count()?)
        .map(|_| {
            Ok(Rect {
                x: read.next()?,
                y: read.next()?,
                width: read.next()?,
                height: read.next()?,
            })
        })
        .collect::<Result<Vec<_>, JsError>>()?;
    let connectors = (0..read.count()?)
        .map(|_| Ok((read.end(obstacles.len())?, read.end(obstacles.len())?)))
        .collect::<Result<Vec<_>, JsError>>()?;
    let routes = route(&Scene {
        obstacles,
        connectors,
        params,
    });
    let mut answer = Vec::new();
    for one in routes {
        match one {
            Route::Routed(points) => {
                answer.push(points.len() as f64);
                answer.extend(points.iter().flat_map(|p| [p.x, p.y]));
            }
            Route::Unroutable => answer.push(0.0),
        }
    }
    Ok(answer)
}
