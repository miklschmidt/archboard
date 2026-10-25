// The codes a reading of the history lens refuses with (ADR 0045), as the
// server answers them and the command line maps them to its exit status. A
// board that is missing or unreadable is refused with the board store's own
// code instead.

/** Each code a footprint or a locality reading refuses with, by itself. */
const HistoryRefusalCode = {
	/** A variant the caller named is not on the board. */
	UNKNOWN_VARIANT: "UNKNOWN_VARIANT",
	/** The variant named to read is shelved or historical. */
	NOT_A_DRAFT: "NOT_A_DRAFT",
	/** Nothing was named, and the board has no current variant to read. */
	NO_CURRENT_VARIANT: "NO_CURRENT_VARIANT",
	/** The footprint would set a variant against itself. */
	NOTHING_TO_COMPARE: "NOTHING_TO_COMPARE",
	/** The variant a proposal is read against is shelved or historical. */
	AGAINST_NOT_LIVE: "AGAINST_NOT_LIVE",
	/** The head the caller named resolves in no checkout that holds a part. */
	HEAD_UNRESOLVED: "HEAD_UNRESOLVED",
} as const;

/** One code a reading of the history lens refuses with. */
type HistoryRefusalCode = (typeof HistoryRefusalCode)[keyof typeof HistoryRefusalCode];

export { HistoryRefusalCode };
