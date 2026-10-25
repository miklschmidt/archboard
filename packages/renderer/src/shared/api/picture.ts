// What a pane reads of a picture besides its pixels: the key it lists, the inks and marks it draws with, the warnings on code, and what a render asks and answers. Safe for the browser.
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
export {
	appearanceFrom,
	keyOf,
	LINE_MARKS,
	markCounts,
	pictureAppearances,
	sampleKey,
} from "#shared/rules/render/picture-key.ts";
export type {
	AppliedAppearance,
	LineMark,
	MarkCount,
	PictureKey,
} from "#shared/rules/render/picture-key.ts";
export { drillDirection } from "#shared/rules/render/semantic-appearance.ts";
export type { DrillDirection } from "#shared/rules/render/semantic-appearance.ts";
export type { SubjectStanding } from "#shared/protocol/render-request.ts";
