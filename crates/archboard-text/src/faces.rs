//! The faces a picture's words are set in, as the font files the core
//! carries in its build: the four faces a drawing names, and the faces a
//! character falls back to where its own face has no glyph for it.
//!
//! The files are the bundled fonts of the renderer package
//! (`packages/renderer/assets/fonts`, with their licences, sources and hashes
//! in its README). The shell sets its own type from the same Onest and DM Mono
//! files, so they stay there, and the build of the core reads them in. Every
//! face has 1000 units per em, so the glyphs of one run share one unit
//! whichever face each comes from.

use std::sync::OnceLock;

use serde::Serialize;
use skrifa::font::Font;
use ts_rs::TS;

/// One face: a family at a weight, which together name exactly one file.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum Face {
    /// Onest at 400, the variable file at its default instance.
    SansRegular,
    /// Onest at 500, the static Medium file.
    SansMedium,
    /// DM Mono at 400.
    MonoRegular,
    /// DM Mono at 500.
    MonoMedium,
    /// Noto Sans at 400, for the Greek a regular face has no glyph for.
    GreekRegular,
    /// Noto Sans at 500, for the Greek a medium face has no glyph for.
    GreekMedium,
    /// Noto Sans Symbols 2: geometric shapes, symbols and dingbats.
    Symbols,
    /// Noto Sans Math: arrows, box drawing and mathematical operators.
    Math,
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
    pub const ALL: [Face; 8] = [
        Face::SansRegular,
        Face::SansMedium,
        Face::MonoRegular,
        Face::MonoMedium,
        Face::GreekRegular,
        Face::GreekMedium,
        Face::Symbols,
        Face::Math,
    ];

    /// The name of the face's file among the bundled fonts.
    pub fn file(self) -> &'static str {
        match self {
            Face::SansRegular => "Onest-wght-v1.000.ttf",
            Face::SansMedium => "Onest-Medium-v1.000.ttf",
            Face::MonoRegular => "DMMono-Regular-v1.000.ttf",
            Face::MonoMedium => "DMMono-Medium-v1.000.ttf",
            Face::GreekRegular => "NotoSans-Greek-Regular-v2.015.ttf",
            Face::GreekMedium => "NotoSans-Greek-Medium-v2.015.ttf",
            Face::Symbols => "NotoSansSymbols2-Subset-v2.008.ttf",
            Face::Math => "NotoSansMath-Subset-v3.000.ttf",
        }
    }

    /// The faces a character falls back to, in order, where this face has no
    /// glyph for it: Noto Sans at this face's weight for Greek, then Noto Sans
    /// Symbols 2, then Noto Sans Math. A fallback face falls back to none.
    pub fn fallbacks(self) -> &'static [Face] {
        match self {
            Face::SansRegular | Face::MonoRegular => {
                &[Face::GreekRegular, Face::Symbols, Face::Math]
            }
            Face::SansMedium | Face::MonoMedium => &[Face::GreekMedium, Face::Symbols, Face::Math],
            Face::GreekRegular | Face::GreekMedium | Face::Symbols | Face::Math => &[],
        }
    }

    /// Whether the face has a glyph for a character.
    pub fn covers(self, character: char) -> bool {
        self.font().charmap().map_unicode(character).is_some()
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
            Face::GreekRegular => include_bytes!(
                "../../../packages/renderer/assets/fonts/NotoSans-Greek-Regular-v2.015.ttf"
            ),
            Face::GreekMedium => include_bytes!(
                "../../../packages/renderer/assets/fonts/NotoSans-Greek-Medium-v2.015.ttf"
            ),
            Face::Symbols => include_bytes!(
                "../../../packages/renderer/assets/fonts/NotoSansSymbols2-Subset-v2.008.ttf"
            ),
            Face::Math => include_bytes!(
                "../../../packages/renderer/assets/fonts/NotoSansMath-Subset-v3.000.ttf"
            ),
        }
    }

    /// The face's font, read once.
    pub(crate) fn font(self) -> &'static Font {
        static FONTS: [OnceLock<Font>; 8] = [const { OnceLock::new() }; 8];
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
