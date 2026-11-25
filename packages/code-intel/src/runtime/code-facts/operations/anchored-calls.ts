// The calls an anchor names, and how each site runs its callee
// (TASK-663.09): what decides whether a relationship anchored there is
// `sync` or `async`. The code check reads it with its language servers
// (call-timing-kind.ts), and the upgrade inventory seeds a kind from it
// through code facts alone (call-timings.ts).
//
// An anchor names a symbol in a file. Its calls are the file's references
// of that spelling that carry a timing, else those of its last name, as the
// anchor's evidence kind is read (anchor-kind.ts). A call that is neither
// awaited nor started, in a language where the callee decides, is resolved
// through the callee's definition, where it is found.

import { lastName } from "#runtime/code-facts/operations/text-reading.ts";
import {
	callKindOf,
	resolvedTiming,
	type CallSite,
} from "#runtime/code-facts/operations/call-timing.ts";
import type { CallTiming } from "#shared/protocol/code-check.ts";
import { definitionSite } from "#runtime/code-facts/operations/definition-site.ts";
import type { Definition, SyntaxFacts } from "#runtime/code-facts/operations/facts.ts";
import type { CheckoutFiles } from "#runtime/code-facts/modules/operations/module-resolution.ts";
import type { FactsPass } from "#runtime/code-facts/services/reader.ts";

/** One reference of a file, with where its import leads. */
type FileReference = SyntaxFacts["references"][number];

/** A reference that calls its name, or hands it to a task starter. */
type TimedReference = FileReference & { readonly timing: CallSite };

/** One call an anchor names, and how its site runs the callee. */
interface AnchoredCall {
	readonly reference: TimedReference;
	readonly timing: CallTiming;
	/** The reference is spelled as the anchor's symbol, not matched by its last name only. */
	readonly exact: boolean;
}

/** Finds the definition a call reaches, where it can. */
type FindCallee = (reference: TimedReference) => Promise<Definition | undefined>;

/**
 * The references of a file that call an anchor's symbol: those spelled as
 * it, else those of its last name.
 * @param facts The anchored file's facts.
 * @param symbol The anchor's symbol.
 * @returns The references, and whether they are spelled as the symbol.
 */
function callsNamed(
	facts: SyntaxFacts,
	symbol: string,
): { references: TimedReference[]; exact: boolean } {
	const timed = facts.references.flatMap((reference) =>
		reference.timing === undefined ? [] : [{ ...reference, timing: reference.timing }],
	);
	const exact = timed.filter((reference) => reference.symbol === symbol);
	if (exact.length > 0) return { references: exact, exact: true };
	const name = lastName(symbol);
	return { references: timed.filter((each) => lastName(each.symbol) === name), exact: false };
}

/**
 * The calls an anchor names in its file, each with its timing.
 * @param facts The anchored file's facts.
 * @param symbol The anchor's symbol.
 * @param callee Finds the definition an unawaited call reaches.
 * @returns The calls, none where the file calls nothing of that name.
 */
async function anchoredCalls(
	facts: SyntaxFacts,
	symbol: string,
	callee: FindCallee,
): Promise<AnchoredCall[]> {
	const { references, exact } = callsNamed(facts, symbol);
	return Promise.all(
		references.map(async (reference) => ({
			reference,
			exact,
			timing:
				reference.timing === "unawaited"
					? resolvedTiming(reference.timing, await callee(reference))
					: reference.timing,
		})),
	);
}

/**
 * How an anchor's calls run their callee, taken together: awaited or
 * started where every one is async (awaited where one is), plain where
 * every one is, and unknown where one is unknown or they disagree.
 * @param timings Each call's timing.
 * @returns The timing, or undefined where there is no call.
 */
function anchorTiming(timings: readonly CallTiming[]): CallTiming | undefined {
	if (timings.length === 0) return undefined;
	const kind = callKindOf(timings);
	if (kind === "sync") return "plain";
	if (kind === undefined) return "unknown";
	return timings.includes("awaited") ? "awaited" : "started";
}

/**
 * Finds a callee through code facts alone: a definition of the file, or one
 * an import leads to.
 * @param pass The pass.
 * @param checkout The checkout.
 * @param file The calling file.
 * @returns The finder.
 */
function calleeInCode(pass: FactsPass, checkout: CheckoutFiles, file: string): FindCallee {
	return async (reference) =>
		(await definitionSite(pass, checkout, file, reference.symbol))?.definition;
}

export { type AnchoredCall, type FindCallee, anchoredCalls, anchorTiming, calleeInCode };
