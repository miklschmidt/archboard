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

/// The shortest header a block has room for, as the box it keeps: its least
/// when none of its wider sizes fits.
pub(crate) fn header_within(header: &Header, room: &Room<'_>) -> Size {
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
        return header.size();
    }
    Size {
        width: box_of(&steps[index]),
        height: steps[index].height,
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
            Size {
                width: 140.0,
                height: 28.0
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
            Size {
                width: 100.0,
                height: 40.0
            }
        );
    }
}
