// What Git history says about the parts of a board, as the browser, the server and the command line read it: the locality and footprint answers and the label of a commit's attribution. Browser-safe: no Node import.
export { FootprintReplySchema } from "#shared/protocol/footprint.ts";
export type { FootprintAnswer, FootprintPart, FootprintReply } from "#shared/protocol/footprint.ts";
export { LocalityReplySchema, PeriodStartSchema } from "#shared/protocol/locality.ts";
export type {
	CoupledPair,
	LocalityAnswer,
	LocalityCommit,
	LocalityPeriod,
} from "#shared/protocol/locality.ts";
export { historyAttributionLabel } from "#shared/schemas/history-attribution.ts";
