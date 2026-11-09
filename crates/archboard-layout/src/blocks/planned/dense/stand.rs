//! Where a reading's cards stand for the parts that some sets put in their frames: the frames
//! together, and the doors round them. Each way to stand them stands once, and two pages of the
//! same sets share one scene and what the ring knows of it.

use crate::geometry::{Point, Rect};

use super::{Reading, Set, ring, search::Staged, together};

/// How many scenes a reading keeps for another page, each with what the ring knows of it.
const SCENES: usize = 16;

/// Where the cards of a reading stand: what one way to stand them answers.
#[derive(Clone)]
pub(super) struct Stood {
    /// Where each frame stands, and the frames' whole.
    pub places: Vec<Point>,
    pub whole: Point,
    /// The doors' boxes round that whole.
    pub doors: Vec<Rect>,
    /// What the scene of these cards costs.
    pub cost: f64,
}

impl Reading<'_> {
    /// Stand the frames of some sizes together, and the doors round them, for parts that stand
    /// in their frames as some sets put them. A way to stand them that the reading met before
    /// stands as it stood then.
    pub(super) fn stand(&self, sets: &[Set], stacked: bool, room: f64, page: Point) -> Stood {
        let scene: Vec<u64> = (sets.iter())
            .flat_map(|set| {
                let parts = set.parts.iter();
                let sides = parts.flat_map(|part| [part.x, part.y, part.width, part.height]);
                [set.size.x, set.size.y].into_iter().chain(sides)
            })
            .chain([room, f64::from(u8::from(stacked))])
            .map(f64::to_bits)
            .collect();
        let key: Vec<u64> = (scene.iter().copied())
            .chain([page.x, page.y].map(f64::to_bits))
            .collect();
        if let Some(stood) = self.stood.borrow().get(&key) {
            return stood.clone();
        }
        let stood = self.stand_anew(sets, (stacked, room, page), scene);
        self.stood.borrow_mut().insert(key, stood.clone());
        stood
    }

    /// Stand the frames and the doors for parts that stand as some sets put them, as `stand`
    /// does the first time.
    fn stand_anew(
        &self,
        sets: &[Set],
        (stacked, room, page): (bool, f64, Point),
        bits: Vec<u64>,
    ) -> Stood {
        let sizes: Vec<Point> = sets.iter().map(|set| set.size).collect();
        let (places, whole) = together(&sizes, stacked, room);
        let mut scenes = self.scenes.borrow_mut();
        // The doors' places are what the ring answers, so a scene the same sets built before
        // serves wherever it left them.
        let before = scenes.iter().position(|(one, _)| *one == bits);
        let Staged { mut scene, doors } = if let Some(at) = before {
            scenes.remove(at).1
        } else {
            self.built(sets, &places)
        };
        let bounds = Rect {
            x: 0.0,
            y: 0.0,
            width: whole.x,
            height: whole.y,
        };
        ring::stand(&mut scene, &doors, bounds, ring::RING_GAP + room, page);
        let stood = Stood {
            places,
            whole,
            doors: doors.iter().map(|&door| scene.boxes[door]).collect(),
            cost: scene.weigh().total(),
        };
        if before.is_none() {
            if scenes.len() == SCENES {
                scenes.remove(0);
            }
            scenes.push((bits, Staged { scene, doors }));
        }
        stood
    }

    /// The scene of the parts that some sets put in their frames, the frames standing at some
    /// places.
    fn built(&self, sets: &[Set], places: &[Point]) -> Staged {
        let parts: Vec<Rect> = (sets.iter().zip(places))
            .flat_map(|(set, at)| {
                set.parts.iter().map(|part| Rect {
                    x: at.x + part.x,
                    y: at.y + part.y,
                    ..*part
                })
            })
            .collect();
        let frames: Vec<Rect> = (places.iter().zip(sets))
            .map(|(at, set)| Rect {
                x: at.x,
                y: at.y,
                width: set.size.x,
                height: set.size.y,
            })
            .collect();
        self.scene(&parts, &frames)
    }
}
