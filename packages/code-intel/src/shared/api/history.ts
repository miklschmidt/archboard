// What Git history says about the parts of a board, as the browser, the server and the command line read it: the locality and footprint answers, the start of a period, and the label of a commit's attribution. A reader names a part by its place in an answer, such as `LocalityAnswer["commits"][number]`. Browser-safe: no Node import.
export { FootprintReplySchema } from "#shared/protocol/footprint.ts";
export type { FootprintAnswer } from "#shared/protocol/footprint.ts";
export { LocalityReplySchema, PeriodStartSchema } from "#shared/protocol/locality.ts";
export type { LocalityAnswer } from "#shared/protocol/locality.ts";
export { historyAttributionLabel } from "#shared/schemas/history-attribution.ts";
