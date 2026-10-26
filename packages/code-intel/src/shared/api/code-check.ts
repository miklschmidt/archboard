// The answer of the code check, as the browser, the server and the command line read it: the findings, the evidence behind them, what the check skipped, how far each board is behind its code and the timings, what each judged container exposes, and what the server remembers of a reading. A reader names a part by its place in an answer, such as `CodeCheckAnswer["findings"][number]`, and derives a remembered answer from its schema. Browser-safe: no Node import.
export {
	CodeCheckAnswerSchema,
	RememberedExposureSchema,
	RememberedFindingsSchema,
} from "#shared/protocol/code-check.ts";
export type { CodeCheckAnswer } from "#shared/protocol/code-check.ts";
