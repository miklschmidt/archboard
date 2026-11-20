// What a pane reads of a picture besides its pixels: the words of the key it lists, the finished
// samples and warnings it shows beside or over the picture, and the key a drawing is kept under.
// Safe for the browser.
export { markSample, warningMark, type MarkSample } from "#shared/render/rules/marks.ts";
export { lineMarks, markCounts } from "#shared/render/rules/key-marks.ts";
export { scopedDrawingKey } from "#shared/render/rules/drawing-key.ts";
export type { LineMark, LineMarkEntry } from "#shared/render/rules/key-marks.ts";
export type { SubjectStanding } from "#shared/protocol/render-request.ts";
