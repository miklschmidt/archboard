// Read the PR's source footprint through the CLI. An adopted proposal no longer holds removed
// bindings, so those bindings are read from the base vault over the same immutable commit range.

/* oxlint-disable archboard/absolute-imports -- actions/ has no # imports; sibling imports stay relative */
import { archboard, firstLine } from "./context.ts";
import type { Context } from "./context.ts";
import type { Trees } from "./pictures.ts";
import type { ModelState } from "./plan.ts";
import { planBuckets } from "./proposal-plan.ts";
import type { Buckets, FootprintReading, ProposalPlan } from "./proposal-plan.ts";
import { parseJson } from "../shared/process.ts";

/** A successful footprint, or why the command could not read it. */
interface FootprintResult {
	readonly answer?: FootprintReading;
	readonly note?: string;
}

/**
 * Run the footprint over the pull request's immutable base with the given selection.
 * @param context The run.
 * @param directory The vault to read.
 * @param selection The selected state or source head.
 * @returns The reading, or why it could not be read.
 */
function footprintAt(
	context: Context,
	directory: string,
	selection: readonly string[],
): FootprintResult {
	const result = archboard(context, directory, [
		"model",
		"footprint",
		"--base",
		context.baseSha,
		...selection,
	]);
	const answer: FootprintReading | undefined = parseJson(result.stdout);
	return result.exitCode === 0 && answer !== undefined
		? { answer }
		: { note: `The footprint could not be read: ${firstLine(result.stderr)}` };
}

/**
 * Add the bindings that disappeared at the head, using only their evidence from the base.
 * @param head The footprint read at the head.
 * @param base The footprint read at the base, over the same source range.
 * @param removed The identities whose bindings only the base holds.
 * @returns One footprint with each removed binding's evidence preserved.
 */
function includeRemoved(
	head: FootprintReading,
	base: FootprintReading,
	removed: ReadonlySet<string>,
) {
	return {
		...head,
		changed: [
			...(base.changed ?? []).filter((part) => removed.has(part.subject.id)),
			...(head.changed ?? []),
		],
		skipped: [
			...(base.skipped ?? []).filter((part) => removed.has(part.subject.id)),
			...(head.skipped ?? []).filter((part) => !removed.has(part.subject.id)),
		],
	};
}

/**
 * The footprint of the pull request, including any binding removed by the proposal.
 * @param context The run.
 * @param trees The base and head vaults.
 * @param state The proposal, if any.
 * @param plan The proposal's plan.
 * @returns The buckets and unread evidence, or why the footprint could not be read.
 */
function readFootprint(
	context: Context,
	trees: Trees,
	state: ModelState | undefined,
	plan: ProposalPlan,
): { buckets?: Buckets; note?: string | undefined } {
	const head = footprintAt(
		context,
		trees.headDir,
		state === undefined ? [] : ["--state", state.id],
	);
	if (head.answer === undefined) return { note: head.note };
	const base =
		plan.baseOnlyBindings.size === 0
			? { answer: {} }
			: footprintAt(context, trees.baseDir, ["--head", context.headSha]);
	if (base.answer === undefined) return { note: base.note };
	const answer = includeRemoved(head.answer, base.answer, plan.baseOnlyBindings);
	const skipped = answer.skipped.map(
		(part) => `${part.subject.name} (${part.reason ?? "unavailable"})`,
	);
	return {
		buckets: planBuckets(answer, plan.named),
		note: skipped.length === 0 ? undefined : `The footprint did not read: ${skipped.join(", ")}.`,
	};
}

export { readFootprint };
