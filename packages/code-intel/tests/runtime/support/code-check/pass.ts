// The steps of one code check pass, which the package's tests drive one at a time. A test
// imports this module after it sets the registry, so the pass reads that registry.
export {
	readStatesToCheck,
	readEveryDraftToCheck,
} from "#tests/runtime/support/code-check/evidence.ts";
export { checkCode } from "#runtime/code-check/operations/check.ts";
export { readPlans } from "#runtime/code-check/operations/plans.ts";
export { checkCandidateCode, suggestHistoricalCommits } from "#tests/runtime/support/candidate.ts";
