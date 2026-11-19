// What a pane reads of a picture besides its pixels: the words of the key it lists, the inks and marks it draws with, the warnings on code, and what a render asks and answers. Safe for the browser.
export {
	cornerWarning,
	HEAD_LENGTH,
	lineInk,
	neutralPulse,
	OPEN_ARM,
	lineWarning,
	lineWidth,
	standingMark,
} from "#shared/render/rules/marks.ts";
export { lineMarks, markCounts } from "#shared/render/rules/key-marks.ts";
export { scopedDrawingKey } from "#shared/render/rules/drawing-key.ts";
export type { LineMark, LineMarkEntry } from "#shared/render/rules/key-marks.ts";
export type { SubjectStanding } from "#shared/protocol/render-request.ts";
