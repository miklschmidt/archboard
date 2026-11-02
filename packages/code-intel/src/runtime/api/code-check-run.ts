// The code check of a vault's documents (ADR 0046): one run over the documents with behind beside it, and the check of a correction's candidate.
export { createCodeCheck } from "#runtime/operations/code-check/run.ts";
export {
	checkCandidateCode,
	suggestHistoricalCommits,
} from "#runtime/operations/code-check/candidate.ts";
