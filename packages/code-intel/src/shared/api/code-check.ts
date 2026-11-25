// The answer of the code check, as the browser, the server and the command line read it: the findings, the evidence behind them, what the check skipped, how far each document is behind its code and the timings, and what the server remembers of a reading. A reader names a part by its place in an answer, such as `CodeCheckAnswer["findings"][number]`. Browser-safe: no Node import.
export { codeCheckAnswerSchema, rememberedFindingsSchema } from "#shared/protocol/code-check.ts";
export type { CodeCheckAnswer } from "#shared/protocol/code-check.ts";
// The answers of the code browser's routes (TASK-648): the files of a checkout, and one whole file with the modules that own it.
export { codeFileSchema, codeFilesSchema } from "#shared/protocol/code-files.ts";
