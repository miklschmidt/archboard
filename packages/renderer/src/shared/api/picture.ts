// What a pane reads of a picture besides its pixels: the key it lists, the inks and marks it draws with, the warnings on code, and what a render asks and answers. Safe for the browser.
export {
	headLength,
	lineInk,
	lineWidth,
	pulseInk,
	standingMark,
} from "#shared/rules/render/diagram.ts";
export {
	appearanceFrom,
	keyOf,
	LINE_MARKS,
	markCounts,
	pictureAppearances,
	sampleKey,
} from "#shared/rules/render/picture-key.ts";
export type { AppliedAppearance, PictureKey } from "#shared/rules/render/picture-key.ts";
export { drillDirection } from "#shared/rules/svg/parts/drill-mark.ts";
export type { DrillDirection } from "#shared/rules/svg/parts/drill-mark.ts";
export { cornerWarning, lineWarning } from "#shared/rules/svg/parts/standing.ts";
export type { SubjectStanding } from "#shared/rules/svg/parts/standing.ts";
