//! How wide a piece of diagram text is, as the host measures it.
//!
//! Text width is measured, never estimated: by the canvas of the place drawing
//! the picture, with the diagram's own faces loaded. A measurement names a
//! face, family and weight, the same face the painter writes onto the element.
//! The core shapes text itself once TASK-520.07 lands; until then the host
//! answers every width the painter asks for.

use std::cell::RefCell;
use std::collections::HashMap;

use crate::drawing::DiagramFont;
use crate::js;

/// The host's measure of text.
pub trait Measure {
    /// The width of one line in diagram units, to a hundredth of a unit.
    fn width(&self, text: &str, font: DiagramFont, size: f64) -> f64;
}

/// The host's measure, each width asked for once in a picture.
pub struct Measurer<'host> {
    host: &'host dyn Measure,
    known: RefCell<HashMap<(String, DiagramFont, u64), f64>>,
}

/// The ellipsis a cut line ends in.
const ELLIPSIS: &str = "…";

impl<'host> Measurer<'host> {
    /// A measurer over the host's measure.
    pub fn new(host: &'host dyn Measure) -> Self {
        Measurer {
            host,
            known: RefCell::new(HashMap::new()),
        }
    }

    /// The width of one line.
    pub fn measure(&self, text: &str, font: DiagramFont, size: f64) -> f64 {
        let key = (text.to_owned(), font, size.to_bits());
        if let Some(width) = self.known.borrow().get(&key) {
            return *width;
        }
        let width = self.host.width(text, font, size);
        self.known.borrow_mut().insert(key, width);
        width
    }

    /// The line, or as much of it as fits the room followed by an ellipsis.
    ///
    /// Each character is measured on its own, which is very slightly wider than
    /// measuring the prefix, so a cut line never comes out over budget.
    pub fn truncate(&self, text: &str, font: DiagramFont, size: f64, room: f64) -> String {
        if self.measure(text, font, size) <= room {
            return text.to_owned();
        }
        let characters: Vec<char> = text.chars().collect();
        let ellipsis = self.measure(ELLIPSIS, font, size);
        let mut width = 0.0;
        let mut kept = 0;
        for character in &characters {
            let next = width + self.measure(&character.to_string(), font, size);
            if next + ellipsis > room {
                break;
            }
            width = next;
            kept += 1;
        }
        if kept == 0 {
            return ELLIPSIS.to_owned();
        }
        let head: String = characters[..kept].iter().collect();
        format!("{}{ELLIPSIS}", js::trim_end(&head))
    }
}

#[cfg(test)]
pub mod fixed {
    //! A measure for tests: every character the same width.
    use super::Measure;
    use crate::drawing::DiagramFont;

    /// Every character `size * 0.5` wide.
    pub struct Monospace;

    impl Measure for Monospace {
        fn width(&self, text: &str, _font: DiagramFont, size: f64) -> f64 {
            text.chars().count() as f64 * size * 0.5
        }
    }
}
