// Read the pull request's source footprint through the CLI, and sort it against the plan.
//
// Every registered repository reads the same --base, and only this one holds the pull request's
// commits, so --base is the base branch's remote ref, which each checkout that CI fetched in full
// has. The CLI counts from the merge base of that ref and HEAD, so a base branch that moves on
// leaves the range alone. There is no --head, so each checkout counts up to its own HEAD: this
// one's is the head commit.

/* oxlint-disable archboard/absolute-imports -- actions/ has no # imports; sibling imports stay relative */
import { archboard, firstLine } from "./context.ts";
import type { Context } from "./context.ts";
import type { ModelState } from "./plan.ts";
import { planBuckets } from "./proposal-plan.ts";
import type { Buckets, FootprintReading, ProposalPlan } from "./proposal-plan.ts";
import { parseJson } from "../shared/process.ts";

/**
 * The ref that the footprint counts from.
 * @param context The run.
 * @returns The base branch's remote ref, else the base commit.
 */
function footprintBase(context: Context): string {
	return context.baseRef === undefined ? context.baseSha : `origin/${context.baseRef}`;
}

/**
 * The footprint of the pull request, sorted against the plan.
 * @param context The run.
 * @param headDir The vault at the head.
 * @param state The proposal, if any. Its bindings place the changes.
 * @param plan The proposal's plan.
 * @returns The buckets and the modules it could not read, or why the footprint could not be read.
 */
function readFootprint(
	context: Context,
	headDir: string,
	state: ModelState | undefined,
	plan: ProposalPlan,
): { buckets?: Buckets; note?: string | undefined } {
	const result = archboard(context, headDir, [
		"model",
		"footprint",
		"--base",
		footprintBase(context),
		...(state === undefined ? [] : ["--state", state.id]),
	]);
	const answer: FootprintReading | undefined = parseJson(result.stdout);
	if (result.exitCode !== 0 || answer === undefined) {
		return { note: `The footprint could not be read: ${firstLine(result.stderr)}` };
	}
	return { buckets: planBuckets(answer, plan), note: unreadNote(answer, plan) };
}

/**
 * Name the modules whose code the footprint could not read.
 * @param answer The footprint.
 * @param plan The proposal's plan.
 * @returns A sentence, or undefined when it read them all.
 */
function unreadNote(answer: FootprintReading, plan: ProposalPlan): string | undefined {
	const skipped = answer.skipped ?? [];
	const skippedIds = new Set(skipped.map((part) => part.subject.id));
	const unread = [
		...skipped.map((part) => `${part.subject.name} (${part.reason ?? "unavailable"})`),
		// The head binds no code to a module the proposal removes, so its code is read nowhere.
		...[...plan.named]
			.filter(([id]) => plan.baseOnlyBindings.has(id) && !skippedIds.has(id))
			.map(([, name]) => `${name} (no binding at the head)`),
	];
	return unread.length === 0 ? undefined : `The footprint did not read: ${unread.join(", ")}.`;
}

export { readFootprint };
