//! A container's header at the width it is laid out at (TASK-486). Its words
//! are measured before layout at each width they can wrap at: the narrowest
//! is the header's least width, and each wider one takes a line fewer, so the
//! header row stands shorter. A block takes the widest one its container has
//! room for once it knows how wide that is.

use crate::ecma::js_max;
use crate::graph::{HEADER_STEPS, Node};

use super::laid::Size;

/// A container's title row, at its least width, and each wider size it can
/// take, narrowest first, the first of them the least; absent where it has one size.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Header {
    pub width: f64,
    pub height: f64,
    pub steps: Option<Vec<Size>>,
}

impl Header {
    /// A header of one size.
    pub(crate) fn of(size: Size) -> Header {
        Header {
            width: size.width,
            height: size.height,
            steps: None,
        }
    }

    /// The painted header size, before projecting it into the content column.
    pub(crate) fn painted(&self, index: Option<usize>) -> Size {
        index
            .and_then(|at| self.steps.as_ref()?.get(at))
            .copied()
            .unwrap_or_else(|| self.size())
    }

    /// Its least size.
    pub(crate) fn size(&self) -> Size {
        Size {
            width: self.width,
            height: self.height,
        }
    }
}

/// The sizes a container's title row can take, as its measured node carries them.
///
/// # Errors
///
/// When the measured sizes are not the JSON measurement writes.
pub(crate) fn steps_of(node: &Node, band: f64) -> Result<Option<Vec<Size>>, String> {
    let Some(rows) = node.option(HEADER_STEPS) else {
        return Ok(None);
    };
    let steps: Vec<(f64, f64)> = serde_json::from_str(rows)
        .map_err(|error| format!("{HEADER_STEPS} of {} is unreadable: {error}", node.id))?;
    Ok(Some(
        steps
            .into_iter()
            .map(|(width, height)| Size {
                width,
                height: height + band,
            })
            .collect(),
    ))
}

/// How much room a block gives its header.
pub(crate) struct Room<'a> {
    /// How wide the container is.
    pub frame: f64,
    /// How wide what the block holds is, between its insets.
    pub content: f64,
    /// How wide the header's box may be before it reaches each thing beside it.
    pub beside: &'a [f64],
}

/// A header the layout took: its size, and which of its sizes that is when it
/// is a wider one.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Taken {
    pub size: Size,
    pub index: Option<usize>,
}

/// The shortest header a block has room for, as the box it keeps: its least
/// when none of its wider sizes fits.
pub(crate) fn header_within(header: &Header, room: &Room<'_>) -> Taken {
    let steps = header.steps.as_deref().unwrap_or(&[]);
    let box_of = |step: &Size| js_max(header.width, step.width - room.frame + room.content);
    let mut index = 0;
    while index + 1 < steps.len()
        && steps[index + 1].width <= room.frame
        && room
            .beside
            .iter()
            .all(|&beside| box_of(&steps[index + 1]) <= beside)
    {
        index += 1;
    }
    if index == 0 {
        return Taken {
            size: header.size(),
            index: None,
        };
    }
    Taken {
        size: Size {
            width: box_of(&steps[index]),
            height: steps[index].height,
        },
        index: Some(index),
    }
}

/// The visible slab's horizontal reach for lines naming the parent itself.
pub(crate) fn header_reach(block: &super::tree::Block, laid: &super::laid::Laid) -> (f64, f64) {
    let at = laid.boxes[super::tree::header_of(block).as_str()];
    let inset = crate::constants::HEADER_SLAB_INSET;
    let (low, high) = crate::track::channels::port_reach(&crate::geometry::Rect {
        x: at.x + inset,
        width: (at.width - 2.0 * inset).max(0.0),
        ..at
    });
    (
        block.lone.as_ref().map_or(low, |lone| {
            low.max(super::lone::caption_width(lone) + crate::track::chains::LANE)
        }),
        high,
    )
}

/// Direct parent relationships meet its compact card. Boundary ports for
/// members remain on the enclosing frame and can pass beside that card.
pub(crate) fn place_header_entries(
    block: &super::tree::Block,
    laid: &mut super::laid::Laid,
    settled: &crate::track::scene::Map<String, f64>,
) {
    use crate::geometry::{Rect, Side};
    if !block.ports.keys().any(|port| block.header_entry(port)) {
        return;
    }
    let at = laid.boxes[super::tree::header_of(block).as_str()];
    let reach = header_reach(block, laid);
    let face = Side::Top;
    let ports: Vec<&String> = block
        .ports
        .iter()
        .filter(|(port, side)| **side == face && block.header_entry(port))
        .map(|(port, _)| port)
        .collect();
    let wanted: Vec<f64> = ports
        .iter()
        .map(|port| {
            settled
                .get(port.as_str())
                .copied()
                .unwrap_or(at.x + at.width / 2.0)
        })
        .collect();
    let xs = crate::track::channels::spread_along(reach, &wanted);
    let y = at.y
        + block.lone.as_ref().map_or(0.0, super::lone::band_of)
        + crate::constants::HEADER_SLAB_INSET;
    for (port, x) in ports.into_iter().zip(xs) {
        let size = super::leaves::PORT;
        laid.boxes.insert(
            port.clone(),
            Rect {
                x: x - size / 2.0,
                y: -size / 2.0,
                width: size,
                height: size,
            },
        );
        let header = crate::geometry::Point { x, y };
        let boundary = crate::geometry::Point { x, y: 0.0 };
        for line in block
            .lines
            .values()
            .filter(|line| line.from == *port || line.to == *port)
        {
            laid.lines.insert(
                line.key.clone(),
                if line.from == *port {
                    vec![boundary, header]
                } else {
                    vec![header, boundary]
                },
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn header() -> Header {
        Header {
            width: 100.0,
            height: 40.0,
            steps: Some(vec![
                Size {
                    width: 100.0,
                    height: 40.0,
                },
                Size {
                    width: 160.0,
                    height: 28.0,
                },
                Size {
                    width: 240.0,
                    height: 16.0,
                },
            ]),
        }
    }

    #[test]
    fn takes_the_widest_size_the_container_has_room_for() {
        let taken = header_within(
            &header(),
            &Room {
                frame: 200.0,
                content: 180.0,
                beside: &[],
            },
        );
        assert_eq!(
            taken,
            Taken {
                size: Size {
                    width: 140.0,
                    height: 28.0
                },
                index: Some(1)
            }
        );
    }

    #[test]
    fn keeps_its_least_size_where_something_stands_beside_it() {
        let taken = header_within(
            &header(),
            &Room {
                frame: 400.0,
                content: 380.0,
                beside: &[120.0],
            },
        );
        assert_eq!(
            taken,
            Taken {
                size: Size {
                    width: 100.0,
                    height: 40.0
                },
                index: None
            }
        );
    }
}
