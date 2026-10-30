// The steps of one code check pass, which the package's tests drive one at a time. A test
// imports this module after it sets the registry, so the pass reads that registry.
export {
	readBoardsToCheck,
	readEveryDraftToCheck,
} from "#tests/runtime/support/code-check/evidence.ts";
export { checkCode } from "#runtime/operations/code-check/check.ts";
export { readPlans } from "#runtime/operations/code-check/plans.ts";
export {
	checkCandidateCode,
	suggestHistoricalCommits,
} from "#runtime/operations/code-check/candidate.ts";
