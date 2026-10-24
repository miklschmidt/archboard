//! The sizes the painter draws with. Layout reads the same sizes from
//! `packages/renderer/src/shared/constants`, where each is explained; the two
//! are one design until layout moves into the core.

pub const BAND_RADIUS: f64 = 10.0;
pub const PART_TITLE_SIZE: f64 = 14.0;
pub const PART_TITLE_LINE: f64 = 20.0;
pub const PART_NOTE_SIZE: f64 = 11.0;
pub const PART_NOTE_LINE: f64 = 17.0;
pub const TEXT_LINE_HEIGHT: f64 = 1.35;
/// How strong a line is on each ground.
pub const LINE_STRENGTH_LIGHT: f64 = 1.0;
pub const LINE_STRENGTH_DARK: f64 = 0.8;
pub const CARD_RADIUS: f64 = 6.0;
pub const SLAB_RADIUS: f64 = 8.0;
pub const CARD_THICKNESS: f64 = 4.0;
pub const TRAY_WALL: f64 = 6.0;
pub const TRAY_LIP: f64 = 2.0;
pub const TRAY_CREASE: f64 = 1.0;
pub const WELL_GAP: f64 = 2.0;
pub const HEADER_SLAB_INSET: f64 = TRAY_WALL + WELL_GAP;
pub const CHIP_THICKNESS: f64 = 1.5;
pub const PILL_THICKNESS: f64 = 2.0;
pub const ICON_CHIP_SIZE: f64 = 24.0;
pub const ICON_CHIP_GAP: f64 = 10.0;
pub const ICON_CHIP_RADIUS: f64 = 5.0;
pub const TITLE_SIZE: f64 = 13.0;
pub const NOTE_SIZE: f64 = 9.5;
pub const PILL_HEIGHT: f64 = 15.0;
pub const PILL_PADDING_X: f64 = 8.0;
pub const PILL_TEXT_SIZE: f64 = 9.0;
pub const PILL_RADIUS: f64 = 4.0;

pub const DIAGRAM_MARGIN: f64 = 20.0;
pub const PLANNED_FRAME_MARGIN: f64 = 16.0;
pub const PLANNED_FRAME_INSET: f64 = 8.0;
pub const REGION_INSET: f64 = 14.0;
pub const ARCHITECTURE_CARD_PADDING: f64 = 16.0;
pub const ARCHITECTURE_ICON_GAP: f64 = 12.0;
pub const ARCHITECTURE_NOTE_GAP: f64 = 2.0;
pub const ARCHITECTURE_HEADER_PADDING: f64 = HEADER_SLAB_INSET + ARCHITECTURE_CARD_PADDING;
pub const ARCHITECTURE_LABEL_PADDING_X: f64 = 10.0;
pub const ARCHITECTURE_LABEL_PADDING_Y: f64 = 8.0;
