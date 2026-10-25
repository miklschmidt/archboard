// The answer of the code check, as the browser, the server and the command line read it: the findings, the evidence behind them, what the check skipped, how far each board is behind its code and the timings, and what the server remembers of a reading. A reader names a part by its place in an answer, such as `CodeCheckAnswer["findings"][number]`. Browser-safe: no Node import.
export { CodeCheckAnswerSchema, RememberedFindingsSchema } from "#shared/protocol/code-check.ts";
export type { CodeCheckAnswer, RememberedFindings } from "#shared/protocol/code-check.ts";
