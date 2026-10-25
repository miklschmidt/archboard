//! The sizes the painter draws with. The core's sequence and flowchart layout
//! (`archboard-flows`) reads them from here. The TypeScript layout of Track
//! and Blocks reads the same sizes from `packages/renderer/src/shared/constants`,
//! where each is explained; the two are one design until that layout moves
//! into the core.

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

/// Half the width of a sequence's activation bar, and how far it holds arrows
/// off the lifeline.
pub const ACTIVATION_HALF_WIDTH: f64 = 6.0;
/// How far right a self-message reaches, how far it drops before turning
/// back, and the radius of its two bends.
pub const SELF_LOOP_REACH: f64 = 52.0;
pub const SELF_LOOP_DROP: f64 = 8.0;
pub const SELF_LOOP_CORNER: f64 = 8.0;
/// The step from one line of a wrapped message label to the next.
pub const MESSAGE_LINE_STEP: f64 = 12.0;
/// How far a step's note holds its words in from its plate's edges.
pub const STEP_NOTE_PADDING_X: f64 = 4.0;
pub const STEP_NOTE_PADDING_Y: f64 = 2.0;
/// A decision's or loop's frame: the row its operator tab and words stand
/// on, the row an alternative's label stands on, the room between its sides
/// and the ink it holds, and the padding of the tab around its operator.
pub const FRAME_HEAD_HEIGHT: f64 = 18.0;
pub const FRAME_GUARD_HEIGHT: f64 = 16.0;
pub const FRAME_PAD: f64 = 10.0;
pub const FRAME_TAB_PADDING: f64 = 6.0;
