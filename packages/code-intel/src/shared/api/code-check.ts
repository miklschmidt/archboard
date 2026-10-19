// The answer of the code check, as the browser, the server and the command line read it: the findings, the evidence behind them, what the check skipped, how far each board is behind its code, and what the server remembers of a reading. Browser-safe: no Node import.
export {
	CheckTimingSchema,
	CodeCheckAnswerSchema,
	RememberedFindingsSchema,
} from "#shared/protocol/code-check.ts";
export type {
	BehindSkip,
	BoardBehind,
	CheckTiming,
	CodeCheckAnswer,
	CodeCheckSkip,
	CodeEvidence,
	CodeFinding,
	RememberedFindings,
	RememberedReading,
} from "#shared/protocol/code-check.ts";
