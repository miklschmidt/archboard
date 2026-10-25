// What a pane reads of a picture besides its pixels: the words of the key it lists, the inks and marks it draws with, the warnings on code, and what a render asks and answers. Safe for the browser.
export type { BoardRenderChoices, BoardRenderOutcome } from "#shared/rules/render/board.ts";
export {
	cornerWarning,
	HEAD_LENGTH,
	lineInk,
	OPEN_ARM,
	PULSE_BREADTH,
	lineWarning,
	lineWidth,
	pulseInk,
	standingMark,
} from "#shared/rules/render/marks.ts";
export { LINE_MARKS, markCounts } from "#shared/rules/render/key-marks.ts";
export type { LineMark, MarkCount } from "#shared/rules/render/key-marks.ts";
export type { SubjectStanding } from "#shared/protocol/render-request.ts";
