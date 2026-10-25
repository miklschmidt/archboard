//! The four faces a picture's words are set in, as the font files the core
//! carries in its build.
//!
//! The files are the bundled fonts of the renderer package
//! (`packages/renderer/assets/fonts`, with their licences and hashes in its
//! README). The shell sets its own type from the same files, so they stay
//! there, and the build of the core reads them in.

use std::sync::OnceLock;

use skrifa::font::Font;

/// One face: a family at a weight, which together name exactly one file.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum Face {
    /// Onest at 400, the variable file at its default instance.
    SansRegular,
    /// Onest at 500, the static Medium file.
    SansMedium,
    /// DM Mono at 400.
    MonoRegular,
    /// DM Mono at 500.
    MonoMedium,
}

/// How tall a face stands about its baseline, in its font units.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Extent {
    /// The units of one em.
    pub units_per_em: u16,
    /// How far the face reaches above its baseline.
    pub ascent: f64,
    /// How far it reaches below, as a positive number.
    pub descent: f64,
}

impl Face {
    /// Every face, in the order of their files.
    pub const ALL: [Face; 4] = [
        Face::SansRegular,
        Face::SansMedium,
        Face::MonoRegular,
        Face::MonoMedium,
    ];

    /// The name of the face's file among the bundled fonts.
    pub fn file(self) -> &'static str {
        match self {
            Face::SansRegular => "Onest-wght-v1.000.ttf",
            Face::SansMedium => "Onest-Medium-v1.000.ttf",
            Face::MonoRegular => "DMMono-Regular-v1.000.ttf",
            Face::MonoMedium => "DMMono-Medium-v1.000.ttf",
        }
    }

    /// The face's file, as the build carries it.
    fn bytes(self) -> &'static [u8] {
        match self {
            Face::SansRegular => {
                include_bytes!("../../../packages/renderer/assets/fonts/Onest-wght-v1.000.ttf")
            }
            Face::SansMedium => {
                include_bytes!("../../../packages/renderer/assets/fonts/Onest-Medium-v1.000.ttf")
            }
            Face::MonoRegular => {
                include_bytes!("../../../packages/renderer/assets/fonts/DMMono-Regular-v1.000.ttf")
            }
            Face::MonoMedium => {
                include_bytes!("../../../packages/renderer/assets/fonts/DMMono-Medium-v1.000.ttf")
            }
        }
    }

    /// The face's font, read once.
    pub(crate) fn font(self) -> &'static Font {
        static FONTS: [OnceLock<Font>; 4] = [
            OnceLock::new(),
            OnceLock::new(),
            OnceLock::new(),
            OnceLock::new(),
        ];
        FONTS[self as usize].get_or_init(|| {
            Font::new(self.bytes(), 0)
                .unwrap_or_else(|| panic!("the bundled font {} reads as a font", self.file()))
        })
    }

    /// The units of one em of the face.
    pub fn units_per_em(self) -> u16 {
        self.font().units_per_em()
    }

    /// How tall the face stands about its baseline: its `hhea` line, or its
    /// typographic line where the font asks for that one.
    pub fn extent(self) -> Extent {
        let metrics = self.font().metrics();
        let line = if metrics.use_typo_metrics {
            metrics.typo_line.or(metrics.hhea_line)
        } else {
            metrics.hhea_line.or(metrics.typo_line)
        };
        let (ascent, descent) = line.map_or((0.0, 0.0), |line| {
            (line.ascender.to_f64(), -line.descender.to_f64())
        });
        Extent {
            units_per_em: metrics.units_per_em,
            ascent,
            descent,
        }
    }
}
